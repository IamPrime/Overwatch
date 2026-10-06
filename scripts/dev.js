// `npm run dev` - starts the API server (server.js) and the Vite frontend together, on one API port
// chosen here and handed to both, so the frontend's /api proxy can never point at a different port
// than the server is actually on.
//
// If PORT is set (in .env or the shell), that port is used as-is and it's an error if it's taken.
// Otherwise the first free port from 3000 up is used - something else on this machine (e.g. a
// Docker container) holding 3000 used to mean the frontend's /api calls silently reached that
// instead of Overwatch. Production (`npm start` on Render) never goes through this script.
require('dotenv').config();

const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_PORT = 3000;
const MAX_PORT = 3100;
const root = path.join(__dirname, '..');

// Probes with the same default bind as Express's app.listen (all interfaces, IPv4 + IPv6), so a
// port Docker has published on 0.0.0.0/[::] counts as taken here too.
function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port);
  });
}

async function pickApiPort() {
  if (process.env.PORT) {
    const port = Number(process.env.PORT);
    if (!(await isPortFree(port))) {
      throw new Error(`PORT=${port} (from .env or your shell) is already in use - free it, or remove PORT to pick a free port automatically.`);
    }
    return port;
  }

  for (let port = DEFAULT_PORT; port <= MAX_PORT; port++) {
    if (await isPortFree(port)) {
      if (port !== DEFAULT_PORT) {
        console.log(`[dev] Port ${DEFAULT_PORT} is in use by another program - using ${port} for the API instead.`);
      }
      return port;
    }
  }
  throw new Error(`No free port between ${DEFAULT_PORT} and ${MAX_PORT}.`);
}

async function main() {
  const port = await pickApiPort();
  console.log(`[dev] API server on http://localhost:${port}; the frontend proxies /api there.`);

  // Both run as plain `node` processes (Vite via its bin script rather than `npm run dev`) so no
  // shell sits in between - on Windows, killing a shell leaves the real process running.
  const children = [
    spawn(process.execPath, ['server.js'], {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdio: 'inherit',
    }),
    spawn(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js')], {
      cwd: path.join(root, 'frontend'),
      env: { ...process.env, API_PORT: String(port) },
      stdio: 'inherit',
    }),
  ];

  // If either one stops (crash or Ctrl+C), stop the other too rather than leaving half the app up.
  let shuttingDown = false;
  function shutDown(code) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (child.exitCode === null) child.kill();
    }
    process.exitCode = code;
  }

  for (const child of children) {
    child.on('exit', (code) => shutDown(code ?? 0));
  }
  process.on('SIGINT', () => shutDown(0));
  process.on('SIGTERM', () => shutDown(0));
}

main().catch((err) => {
  console.error(`[dev] ${err.message}`);
  process.exit(1);
});
