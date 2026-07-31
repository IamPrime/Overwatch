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

- **`purdue-genai`** (default) — sends the photo to [Purdue GenAI Studio](https://genai.rcac.purdue.edu/), a free, Purdue-hosted, SSO-authenticated vision-language model service. Tries `PURDUE_GENAI_MODEL` first (default `llama4:latest`), and falls back to `PURDUE_GENAI_FALLBACK_MODEL` (default `gemma4:26b-a4b`) if that fails or times out. Note: `qwen3-vl:32b`/`llava:latest` are also listed in GenAI Studio but currently broken server-side (RCAC's Ollama-backed models hit a missing-`Pillow` bug on any image request — reported to RCAC). `llama4`/`gemma4` are served via vLLM instead, which sidesteps that bug.
- **`local`** — runs a Food-101 image classifier ([`onnx-community/swin-finetuned-food101-ONNX`](https://huggingface.co/onnx-community/swin-finetuned-food101-ONNX)) locally via [`@huggingface/transformers`](https://www.npmjs.com/package/@huggingface/transformers). No network call at all for the detection step — useful if Purdue GenAI Studio is unavailable, or you'd rather not depend on an external service. The model (~100MB+) downloads and caches on first use. Note: this pulls in `sharp`/`onnxruntime-node`, which currently have known unpatched high-severity advisories in their image-decoding code — acceptable for local/dev use, but that's why this path is opt-in rather than the default.

## Setup

```sh
npm install
```

Copy [`.env.example`](.env.example) to `.env` (never commit `.env` — it's already covered by `.gitignore`) and fill in:

```env
FOOD_DETECTOR=purdue-genai

PURDUE_GENAI_API_KEY=your-purdue-genai-api-key
PURDUE_GENAI_MODEL=llama4:latest
PURDUE_GENAI_FALLBACK_MODEL=gemma4:26b-a4b

WOLFRAM_APP_ID=your-wolfram-alpha-app-id
```

- Get a Purdue GenAI Studio API key by logging into [genai.rcac.purdue.edu](https://genai.rcac.purdue.edu/) with your Purdue SSO, then avatar → Settings → Account → API Keys.
- Get a Wolfram Alpha App ID from the [Wolfram Alpha Developer Portal](https://developer.wolframalpha.com/). The free tier is capped at **2,000 non-commercial API calls per month** — if nutrition lookups that used to work suddenly start failing, check whether you've hit that monthly quota.
- To use the self-hosted model instead, set `FOOD_DETECTOR=local` — no Purdue key needed in that case.

## Running

```sh
npm start
```

Then open `http://localhost:3000`.

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

- **"Could not identify the food in this image."** — Check the server console. If `FOOD_DETECTOR=purdue-genai` and it logs an error from both the primary and fallback model, your `PURDUE_GENAI_API_KEY` may be missing/invalid, or both models may be down — check genai.rcac.purdue.edu directly. If `FOOD_DETECTOR=local`, check that the model finished downloading (see server console on first run).
- **`Wolfram Alpha couldn't find nutrition facts for "..."`** — Wolfram Alpha's Simple API is queried with the bare food name (not "\<food\> nutrition facts" — that phrasing 501s on some dish names, e.g. "sandwich nutrition facts" fails but "sandwich" alone works). The server already falls back to just the last word of the tag once; if both attempts fail, Wolfram Alpha genuinely doesn't have an entry for that food/phrasing.
- **Node fails to start with `Error: UNKNOWN: unknown error, read` on `server.js`** — this is a known Windows + OneDrive quirk, not an app bug: OneDrive's sync/cloud-file layer briefly locks a file it's just finished syncing, so Node's file read fails at exactly the wrong moment. It's transient — just re-run `npm start`. If it keeps happening, mark the project folder "Always keep on this device" in OneDrive settings, or move the project outside a OneDrive-synced folder.
- **Port 3000 already in use** — set `PORT=3001` (or any free port) in `.env` and restart.
- **Nutrition lookups that used to work start failing for everything** — you may have hit Wolfram Alpha's 2,000-calls/month free-tier cap. Check your usage at the [Wolfram Alpha Developer Portal](https://developer.wolframalpha.com/portal/myapps/); the exact error Wolfram returns once you're over quota hasn't been confirmed here.

## License

MIT — see [LICENSE](LICENSE).
