# Overwatch

## Food Analysis Web

<details>
    <summary>Food is essential to every living thing on our planet for daily survival, strength, energy and health. As a human, we usually do not keep track of the nutrition in our food, even though as a species we have technologically advanced, still it is difficult to keep track of the nutrition value of the foods we consume.
    </summary>
<p> This simple application can help you keep track of the foods you consume and give you an almost instant nutrition fact check by identifying your food photo and looking up its nutrition facts.
</p>
</details>

## How it works

1. You sign in (or, if you've installed the app to your phone's home screen, it signs you in anonymously with no password) and upload a photo of food in the browser.
2. The browser sends the photo to a small local server ([server.js](server.js)), with your session token attached.
3. The server identifies the food (see "Food detection backends" below), then calls the **Wolfram Alpha** Simple API to get a nutrition-facts image for that food.
4. The nutrition image is displayed on the page — click it to view a larger, scrollable version.

The API calls happen server-side (not in the browser) so credentials never need to be exposed in client-side JavaScript, and because Wolfram Alpha's API doesn't support being called directly from a browser (no CORS headers) anyway.

### Accounts & Wolfram Alpha usage

Accounts (email/password on the web, no-password anonymous sessions in the installed PWA) are handled by [Supabase](https://supabase.com/) Auth — see "Supabase setup" below. Every signed-in user gets **5 free nutrition lookups/day** against the app's own shared `WOLFRAM_APP_ID`. If you add your own free Wolfram Alpha App ID in the app's Settings panel, your lookups use your own key instead and are uncapped — you stop drawing from the shared quota entirely. There's no payment or paid tier: bringing your own (free) Wolfram Alpha key is the entire "upgrade path."

### Food detection backends

Which one is used is controlled by the `FOOD_DETECTOR` env var:

- **`grubwatch`** (default) — sends the photo to [Purdue GenAI Studio](https://genai.rcac.purdue.edu/), a free, Purdue-hosted, SSO-authenticated vision-language model service. Tries `PURDUE_GENAI_MODEL` first (default `llama4:latest`), and falls back to `PURDUE_GENAI_FALLBACK_MODEL` (default `gemma4:26b-a4b`) if that fails or times out. Note: `qwen3-vl:32b`/`llava:latest` are also listed in GenAI Studio but currently broken server-side (RCAC's Ollama-backed models hit a missing-`Pillow` bug on any image request — reported to RCAC). `llama4`/`gemma4` are served via vLLM instead, which sidesteps that bug.
  - If both Purdue models fail (e.g. during a Purdue-side outage - see Troubleshooting) and `GEMINI_API_KEY` is set, a third attempt is made against the [Gemini API](https://ai.google.dev/gemini-api/docs/openai)'s free tier via its OpenAI-compatibility endpoint. This is a cloud fallback, not a local one - it costs no RAM/disk on the server, which matters on Render's free tier (see `local` below for why that's the alternative to avoid there).
    - `GEMINI_MODEL` defaults to the `gemini-flash-latest` alias rather than a pinned version - Google retires specific model versions from the free tier on a timescale of months (e.g. `gemini-2.0-flash` and even `gemini-2.5-flash-lite` both returned errors for new API keys as of writing), and the alias always resolves to whatever their current flash model is. Pin an explicit version only if you specifically need reproducible behavior across Google's model updates.
- **`local`** — runs a Food-101 image classifier ([`onnx-community/swin-finetuned-food101-ONNX`](https://huggingface.co/onnx-community/swin-finetuned-food101-ONNX)) locally via [`@huggingface/transformers`](https://www.npmjs.com/package/@huggingface/transformers). No network call at all for the detection step — useful if Purdue GenAI Studio is unavailable, or you'd rather not depend on an external service. The model (~100MB+) downloads and caches on first use. Note: this pulls in `sharp`/`onnxruntime-node`, which currently have known unpatched high-severity advisories in their image-decoding code — acceptable for local/dev use, but that's why this path is opt-in rather than the default.
  - Food-101's labels aren't all English dish names (e.g. `huevos_rancheros`, `croque_madame`), which Wolfram Alpha's Simple API doesn't recognize. Rather than call out to Purdue for translation (defeating the point of the `local` path), a second, small local model — [`onnx-community/Qwen2.5-1.5B-Instruct`](https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct) (~1-1.5GB, also downloads/caches on first use) — cleans up/translates the raw label using the same English-naming rule given to the Purdue vision prompt (`FOOD_NAME_RULES` in `server.js`). The smaller 0.5B variant was tried first but produced unreliable, sometimes nonsensical translations; 1.5B is the smallest that gave consistently coherent (if occasionally imperfect) results. Wolfram's last-word fallback and the front end's error-message fallback both still apply on top of this, so an imperfect translation degrades gracefully rather than breaking anything.

## Setup

```sh
npm install
```

Copy [`.env.example`](.env.example) to `.env` (never commit `.env` — it's already covered by `.gitignore`) and fill in:

```env
FOOD_DETECTOR=grubwatch

PURDUE_GENAI_API_KEY=your-purdue-genai-api-key
PURDUE_GENAI_MODEL=llama4:latest
PURDUE_GENAI_FALLBACK_MODEL=gemma4:26b-a4b

GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-flash-latest

WOLFRAM_APP_ID=your-wolfram-alpha-app-id
WOLFRAM_DAILY_FREE_LOOKUPS=5

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

NETLIFY_ORIGIN=https://grubwatch.netlify.app
```

- Get a Purdue GenAI Studio API key by logging into [genai.rcac.purdue.edu](https://genai.rcac.purdue.edu/) with your Purdue SSO, then avatar → Settings → Account → API Keys.
- `GEMINI_API_KEY` is optional but recommended in production: get a free key (no credit card) from [Google AI Studio](https://aistudio.google.com/) → Get API Key. Used only if both Purdue models fail.
- Get a Wolfram Alpha App ID from the [Wolfram Alpha Developer Portal](https://developer.wolframalpha.com/) for `WOLFRAM_APP_ID` — this is the *shared* key every signed-in user's free 5 lookups/day draw from (see "Accounts & Wolfram Alpha usage" above). The free tier is capped at **2,000 non-commercial API calls per month** — if free-tier lookups that used to work suddenly start failing for everyone, check whether you've hit that monthly quota. `WOLFRAM_DAILY_FREE_LOOKUPS` is optional and defaults to 5.
- `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are required for accounts — see "Supabase setup" below. `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security; never expose it to the frontend or commit it.
- To use the self-hosted model instead, set `FOOD_DETECTOR=local` — no Purdue/Gemini key needed in that case. **Not recommended on Render's free tier**: the local classifier plus its translator model need more RAM than the free tier's ~512MB gives, and its ephemeral disk means both models (~1.1-1.5GB combined) re-download on every cold start. In practice this crash-loops the service (see Troubleshooting) — use `local` for local dev, and rely on the Gemini fallback above for production resilience instead.
- `NETLIFY_ORIGIN` only matters if you're hosting the front end separately from this server (see Deployment below) — it's the one origin allowed to call this API cross-origin.

### Supabase setup

Accounts and per-user Wolfram Alpha data are backed by [Supabase](https://supabase.com/) (Postgres + Auth), free tier. The schema lives in [`supabase/migrations/`](supabase/migrations) as versioned [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) migrations rather than a single ad-hoc SQL file, so the same history can be replayed against any fresh project (local dev, staging, a new prod project, or a disaster-recovery rebuild) with one command instead of manually copy-pasting SQL into the dashboard each time.

1. Create a Supabase project.
2. **Authentication → Providers** → enable **Anonymous Sign-Ins** (off by default) — this is what lets the installed PWA sign a user in with no password. Since anonymous sign-in needs no verification, a script could otherwise mint unlimited fresh accounts to keep re-harvesting new 5-lookups/day allowances against the shared `WOLFRAM_APP_ID` — enable invisible CAPTCHA or Cloudflare Turnstile here too (Supabase's own [recommendation](https://supabase.com/docs/guides/auth/auth-anonymous#abuse-prevention-and-rate-limits) for this exact risk) on top of the default 30-requests/hour IP rate limit.
3. Apply the migrations with the Supabase CLI (no global install needed - `npx` pulls it on demand):
   ```sh
   npx supabase login
   npx supabase link --project-ref your-project-ref   # found in the project's dashboard URL / Settings → General
   npx supabase db push
   ```
   - `login` opens a browser to authenticate the CLI to your Supabase *account* (once per machine, not per project).
   - `link` connects *this repo* to one specific *project* and will prompt for that project's database password — find or reset it under **Settings → Database → Database password**. `db push` fails with "Cannot find project ref. Have you run supabase link?" if this step is skipped.
   - `db push` may print `Warning: failed to cache migrations catalog: ... failed to inspect docker image ...` if Docker isn't running/installed — that's benign here (it's only for an optional local diffing optimization); look for `Finished supabase db push.` at the end to confirm the migration actually applied, and confirm in **Table Editor** that `user_wolfram_keys`/`wolfram_usage` now exist.

   This creates those two tables, their Row Level Security policies, and the `increment_wolfram_usage`/`decrement_wolfram_usage` functions the server uses to track the daily free-lookup cap atomically (see the comments in [`supabase/migrations/`](supabase/migrations) for why the `revoke`/`grant` lines in there are load-bearing). Setting up a second project later (e.g. a separate prod project) is the same `link` + `db push` against that project's ref — no manual SQL Editor work.
4. **Project Settings → API** → copy the Project URL, the `anon` public key, and the `service_role` secret key.
5. Put the Project URL + `service_role` key in this repo's `.env` (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) and, for local frontend dev, in `frontend/.env` (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — see [`frontend/.env.example`](frontend/.env.example)). In production, set the `VITE_*` ones as Netlify build environment variables (they get baked into the built JS at build time, since there's no server to read them at runtime).

**Adding a schema change later:**
```sh
npx supabase migration new <description>   # creates a new timestamped file in supabase/migrations/
# write the SQL in that new file
npx supabase db push                        # applies only the new, not-yet-applied migration(s)
```
`link` only needs to be run again if you're doing this from a different machine/clone (the link is stored locally, not committed) or targeting a different project.

## Running

Start the API server:

```sh
npm start
```

In a separate terminal, run the frontend in dev mode:

```sh
cd frontend
npm install
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:5173`). The frontend's dev server proxies API calls to whatever `VITE_API_BASE` is set to in `frontend/.env` (leave it empty to call `http://localhost:3000` on the same machine).

## Deployment

The front end (`frontend/`) and the API server (`server.js`) don't have to be hosted together. This repo is set up to run as:

- **API server on [Render](https://render.com)** — free tier, no credit card required. Push this repo, set the env vars from `.env.example` in Render's dashboard, build command `npm install && npm run build` (the root `build` script also builds `frontend/`, so `server.js` has something in `frontend/dist` to serve — see "Visiting the Render URL directly" below), start command `npm start`. Render sets its own `PORT` env var automatically; don't override it.
  - This build also needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in Render's Environment tab (same values as Netlify's, below) — Vite bakes them into the built JS at build time same as it does for Netlify. Deliberately do **not** set `VITE_API_BASE` here: left unset, it defaults to an empty string, giving relative `/api/*` paths that resolve same-origin when the Render URL serves both the API and this build of the frontend - exactly what's needed for a direct-Render-URL visit, as opposed to Netlify's build, which needs `VITE_API_BASE` pointed at this Render URL since it's a different origin there.
- **Static front end on [Netlify](https://netlify.com)** (or anywhere else that serves static files) — [`netlify.toml`](netlify.toml) at the repo root tells Netlify to build from the `frontend/` directory (`base = "frontend"`, `command = "npm run build"`, `publish = "dist"`). Set `VITE_API_BASE`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` as Netlify build environment variables (Site settings → Environment variables) — since there's no server at runtime to inject them, Vite bakes them into the built JS at build time. If you redeploy `server.js` to a different Render URL, update `VITE_API_BASE` and redeploy the frontend.
- CORS is handled by `NETLIFY_ORIGIN` in `server.js` — set it to your actual static site's URL so the browser allows the cross-origin call.

Why not just proxy `/api/*` through Netlify's redirects instead of calling Render directly? Netlify's redirect/proxy to an external URL times out at ~27 seconds, which is shorter than Render's free-tier cold-start wake time (30-60s after 15 min idle) and shorter than the worst case for the Purdue GenAI primary+fallback chain — so a proxy would fail exactly when you need it most. Calling Render directly removes that ceiling; the browser will wait as long as `server.js` takes.

**Caveat**: Render's free tier spins down after 15 minutes of inactivity. The first request after that will take 30-60s to respond (not fail, just slow) while it wakes back up.

Visiting the Render URL directly (not through Netlify) also works: Render's build command builds `frontend/dist` as part of deploying (see above), which `server.js` serves directly, and same-origin requests aren't subject to CORS at all, so `NETLIFY_ORIGIN` is irrelevant in that case. For local testing of this specific path, run `npm run build` at the repo root (not inside `frontend/`) to match what Render does.

## Project layout

- `server.js` — Node/Express server. Serves the built front end and proxies requests to the chosen food-detection backend + Wolfram Alpha so credentials stay server-side; also resolves each user's Wolfram Alpha access (their own key, or the shared metered one) behind Supabase-authenticated routes.
- `frontend/` — Vite + React SPA: login/anonymous-session UI, the upload/nutrition-result flow, the Wolfram Alpha BYOK settings panel, and PWA manifest/service-worker config (`vite-plugin-pwa`). Has its own `package.json`/`.env.example` — see "Running" above.
- `supabase/schema.sql` — Postgres schema (run once in the Supabase SQL Editor) for per-user Wolfram Alpha keys and the daily free-lookup counter, including the Row Level Security policies and RPC functions the server uses.
- `netlify.toml` — tells Netlify to build `frontend/` rather than the repo root.
- `.env.example` — template listing every env var the server reads.
- `.env` — your local credentials (never committed).

## Customization

The nutrition image's size and text size come from the Wolfram Alpha request in `fetchWolframImage()` in [server.js](server.js) — adjust `width` (pixels) and `fontsize` (points) there if you want a bigger or smaller default image. See the [Simple API docs](https://products.wolframalpha.com/simple-api/documentation/) for the full set of supported parameters (`background`, `foreground`, `layout`, `units`, etc.).

## Troubleshooting

- **"Could not identify the food in this image."** — Check the server console. If `FOOD_DETECTOR=grubwatch` and it logs an error from the primary model, the fallback model, and Gemini (or Gemini was never attempted because `GEMINI_API_KEY` isn't set), your `PURDUE_GENAI_API_KEY` may be missing/invalid, or all configured models are down — check genai.rcac.purdue.edu directly. If `FOOD_DETECTOR=local`, check that the model finished downloading (see server console on first run).
- **Render service silently restarts (`==> Running 'npm start'` appears again with no new `==> Deploying...` block) shortly after setting `FOOD_DETECTOR=local`** — this is Render's supervisor relaunching a crashed process, almost certainly an out-of-memory kill (Render's free tier logs don't print an explicit OOM message). The local classifier + translator models need more RAM than the free tier's ~512MB, and don't persist across the free tier's ephemeral disk, so every cold start re-triggers the same crash on the next request. Use `local` for local dev only; in production, rely on the Gemini fallback (`GEMINI_API_KEY`) instead.
- **`Wolfram Alpha couldn't find nutrition facts for "..."`** — Wolfram Alpha's Simple API is queried with the bare food name (not "\<food\> nutrition facts" — that phrasing 501s on some dish names, e.g. "sandwich nutrition facts" fails but "sandwich" alone works). The server already falls back to just the last word of the tag once; if both attempts fail, Wolfram Alpha genuinely doesn't have an entry for that food/phrasing.
- **Node fails to start with `Error: UNKNOWN: unknown error, read` on `server.js`** — this is a known Windows + OneDrive quirk, not an app bug: OneDrive's sync/cloud-file layer briefly locks a file it's just finished syncing, so Node's file read fails at exactly the wrong moment. It's transient — just re-run `npm start`. If it keeps happening, mark the project folder "Always keep on this device" in OneDrive settings, or move the project outside a OneDrive-synced folder.
- **Port 3000 already in use** — set `PORT=3001` (or any free port) in `.env` and restart.
- **Nutrition lookups that used to work start failing for everything** — you may have hit Wolfram Alpha's 2,000-calls/month free-tier cap. Check your usage at the [Wolfram Alpha Developer Portal](https://developer.wolframalpha.com/portal/myapps/); the exact error Wolfram returns once you're over quota hasn't been confirmed here.
- **"Missing Authorization header." / "Invalid or expired session." on every API call** — the frontend has no signed-in session yet, or `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are missing or wrong on the server (`requireAuth` in `server.js` can't verify the token without them). Confirm both are set and match the same Supabase project the frontend's `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` point at.
- **The installed PWA gets stuck on the login form instead of signing in automatically** — either `supabase/schema.sql`'s Anonymous Sign-Ins provider isn't enabled (Authentication → Providers in the Supabase dashboard, off by default), or the standalone-mode detection in `frontend/src/hooks/useStandalone.js` didn't recognize this install path (known to vary across browsers/iOS versions). Tap "Continue without an account" on the login form either way — it calls the same anonymous sign-in directly.
- **"You've used all 5 free nutrition lookups for today."** — expected behavior once a user without their own Wolfram Alpha key hits the daily cap on the shared `WOLFRAM_APP_ID` (see "Accounts & Wolfram Alpha usage" above); add a personal key in Settings for unlimited lookups, or wait until the next UTC day.

## License

MIT — see [LICENSE](LICENSE).
