# Overwatch

## Food Analysis Web

<details>
    <summary>Food is essential to every living thing on our planet for daily survival, strength, energy and health. As a human, we usually do not keep track of the nutrition in our food, even though as a species we have technologically advanced, still it is difficult to keep track of the nutrition value of the foods we consume.
    </summary>
<p> This simple application can help you keep track of the foods you consume and give you an almost instant nutrition fact check by identifying your food photo and looking up its nutrition facts.
</p>
</details>

## How it works

1. You upload a photo of food in the browser.
2. The browser sends the photo to a small local server ([server.js](server.js)).
3. The server identifies the food (see "Food detection backends" below), then calls the **Wolfram Alpha** Simple API to get a nutrition-facts image for that food.
4. The nutrition image is displayed on the page — click it to view a larger, scrollable version.

The API calls happen server-side (not in the browser) so credentials never need to be exposed in client-side JavaScript, and because Wolfram Alpha's API doesn't support being called directly from a browser (no CORS headers) anyway.

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

NETLIFY_ORIGIN=https://grubwatch.netlify.app
```

- Get a Purdue GenAI Studio API key by logging into [genai.rcac.purdue.edu](https://genai.rcac.purdue.edu/) with your Purdue SSO, then avatar → Settings → Account → API Keys.
- `GEMINI_API_KEY` is optional but recommended in production: get a free key (no credit card) from [Google AI Studio](https://aistudio.google.com/) → Get API Key. Used only if both Purdue models fail.
- Get a Wolfram Alpha App ID from the [Wolfram Alpha Developer Portal](https://developer.wolframalpha.com/). The free tier is capped at **2,000 non-commercial API calls per month** — if nutrition lookups that used to work suddenly start failing, check whether you've hit that monthly quota.
- To use the self-hosted model instead, set `FOOD_DETECTOR=local` — no Purdue/Gemini key needed in that case. **Not recommended on Render's free tier**: the local classifier plus its translator model need more RAM than the free tier's ~512MB gives, and its ephemeral disk means both models (~1.1-1.5GB combined) re-download on every cold start. In practice this crash-loops the service (see Troubleshooting) — use `local` for local dev, and rely on the Gemini fallback above for production resilience instead.
- `NETLIFY_ORIGIN` only matters if you're hosting the front end separately from this server (see Deployment below) — it's the one origin allowed to call this API cross-origin.

## Running

```sh
npm start
```

Then open `http://localhost:3000`.

## Deployment

The front end (`index.html`/`overwatch.css`/`overwatch.js`) and the API server (`server.js`) don't have to be hosted together. This repo is set up to run as:

- **API server on [Render](https://render.com)** — free tier, no credit card required. Push this repo, set the env vars from `.env.example` in Render's dashboard, build command `npm install`, start command `npm start`. Render sets its own `PORT` env var automatically; don't override it.
- **Static front end on [Netlify](https://netlify.com)** (or anywhere else that serves static files) — `overwatch.js` calls the Render API directly via the hardcoded `API_BASE` constant at the top of the file, rather than relative paths, so it works regardless of what origin serves the page. If you redeploy to a different Render URL, update `API_BASE` there.
- CORS is handled by `NETLIFY_ORIGIN` in `server.js` — set it to your actual static site's URL so the browser allows the cross-origin call.

Why not just proxy `/api/*` through Netlify's redirects instead of calling Render directly? Netlify's redirect/proxy to an external URL times out at ~27 seconds, which is shorter than Render's free-tier cold-start wake time (30-60s after 15 min idle) and shorter than the worst case for the Purdue GenAI primary+fallback chain — so a proxy would fail exactly when you need it most. Calling Render directly removes that ceiling; the browser will wait as long as `server.js` takes.

**Caveat**: Render's free tier spins down after 15 minutes of inactivity. The first request after that will take 30-60s to respond (not fail, just slow) while it wakes back up.

Visiting the Render URL directly (not through Netlify) also works fine — same-origin requests aren't subject to CORS at all, so `NETLIFY_ORIGIN` is irrelevant in that case.

## Project layout

- `server.js` — Node/Express server. Serves the static front end and proxies requests to the chosen food-detection backend + Wolfram Alpha so credentials stay server-side.
- `index.html` — the page markup.
- `overwatch.js` — client-side script: reads the uploaded photo, sends it to the server, and renders the result.
- `overwatch.css` — styling.
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

## License

MIT — see [LICENSE](LICENSE).
