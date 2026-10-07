# Development

Setting up, running and testing Angalia on your own machine. For how the pieces fit together see [how-it-works.md](how-it-works.md); for hosting see [deployment.md](deployment.md).

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Running](#running)
- [Tests](#tests)
- [Project layout](#project-layout)
- [Customization](#customization)

## Prerequisites

- **Node.js 24** (the version Netlify is pinned to in [`netlify.toml`](../netlify.toml); Vite 8 needs a modern Node).
- A **Supabase** project (free tier) for accounts.
- A **Wolfram Alpha App ID** (free) for nutrition lookups.
- For `FOOD_DETECTOR=grubwatch` (the default): a **Purdue GenAI Studio** API key, a **Gemini** API key, or both.
- Disk space for models downloaded on first use: Whisper for voice (always), plus about 1.1–1.5 GB more for `FOOD_DETECTOR=local`.

## Setup

```bash
npm install                             # API server dependencies
npm install --prefix frontend           # frontend dependencies
cp .env.example .env                    # API server settings - fill in below
cp frontend/.env.example frontend/.env  # frontend settings
```

Never commit either `.env`; both are covered by `.gitignore`. Then set up Supabase (below) before running.

## Environment variables

### API server (`.env`)

| Variable | Required | Default | What it's for |
| --- | --- | --- | --- |
| `FOOD_DETECTOR` | No | `grubwatch` | `grubwatch` uses the cloud models; `local` runs models on this machine. See [backends](how-it-works.md#food-detection-backends) |
| `PURDUE_GENAI_API_KEY` | For `grubwatch`, this or `GEMINI_API_KEY` | none | Purdue GenAI Studio: log in to [genai.rcac.purdue.edu](https://genai.rcac.purdue.edu/) with Purdue SSO, then avatar → Settings → Account → API Keys |
| `PURDUE_GENAI_MODEL` | No | `llama4:latest` | Purdue primary model |
| `PURDUE_GENAI_FALLBACK_MODEL` | No | `gemma4:26b-a4b` | Purdue fallback model |
| `GEMINI_API_KEY` | Recommended | none | Used when both Purdue models fail. Free key, no credit card: [Google AI Studio](https://aistudio.google.com/) → Get API Key. Consider a separate key for local testing so testing can't use up production's daily quota |
| `GEMINI_MODEL` | No | `gemini-flash-latest` | Kept as an alias on purpose; see [backends](how-it-works.md#grubwatch-default) |
| `LOCAL_MODEL_ID` | No | `onnx-community/swin-finetuned-food101-ONNX` | Photo classifier for `local` |
| `WHISPER_MODEL` | No | `onnx-community/whisper-base` | Voice transcription. `onnx-community/whisper-tiny` uses less memory, with lower accuracy |
| `WOLFRAM_APP_ID` | Yes | none | The shared key behind everyone's free daily lookups. From the [Wolfram Alpha Developer Portal](https://developer.wolframalpha.com/); free tier allows 2,000 non-commercial calls a month |
| `WOLFRAM_DAILY_FREE_LOOKUPS` | No | `5` | Free lookups per user per UTC day on the shared key |
| `SUPABASE_URL` | Yes | none | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | none | Verifies sessions and reads/writes Wolfram data; also the source of the [tag-signing key](how-it-works.md#2-the-server-enforces-the-ais-decision-signed-tags). Bypasses Row Level Security, so keep it server-side only |
| `NETLIFY_ORIGIN` | No | `https://grubwatch.netlify.app` | The one origin allowed to call this API cross-origin |
| `PORT` | No | unset | Leave unset locally so `npm run dev` picks a free port; set it only to pin one. Render sets its own |

### Frontend (`frontend/.env`)

| Variable | Local dev | What it's for |
| --- | --- | --- |
| `VITE_API_BASE` | **Leave empty** | The API server's URL. Empty means relative `/api` paths, which the dev server forwards to the local API |
| `VITE_SUPABASE_URL` | Your project URL | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your anon key | Supabase public key; safe in the browser, since access is enforced by Row Level Security and auth |

`VITE_*` values are built into the JavaScript at build time, so restart `npm run dev` after changing them.

## Supabase setup

Accounts and per-user Wolfram data live in [Supabase](https://supabase.com/) (Postgres + Auth), free tier. The schema is in [`supabase/migrations/`](../supabase/migrations) as versioned [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) migrations, so the same history can be replayed against any new project with one command.

1. Create a Supabase project.
2. **Authentication → Providers** → enable **Anonymous Sign-Ins** (off by default). This is what lets the installed PWA sign in with no password. Because anonymous sign-in needs no verification, a script could otherwise create unlimited accounts to collect fresh free-lookup allowances on the shared `WOLFRAM_APP_ID`. Also enable invisible CAPTCHA or Cloudflare Turnstile there ([Supabase's recommendation](https://supabase.com/docs/guides/auth/auth-anonymous#abuse-prevention-and-rate-limits) for this risk), on top of the default 30-requests-per-hour IP limit.
3. **Authentication → URL Configuration** → add every address the app runs at to **Redirect URLs**: the Netlify URL, the Render URL and `http://localhost:5173`. Confirmation emails (from **Sign up**, and from a guest's **Create account** in Settings) link back to the address the person was using, and Supabase only sends people back to listed addresses; an unlisted one falls back to the **Site URL**.
4. Apply the migrations (no global install needed; `npx` fetches the CLI):

   ```bash
   npx supabase login
   npx supabase link --project-ref your-project-ref   # in the dashboard URL, or Settings → General
   npx supabase db push
   ```

   - `login` authenticates the CLI to your Supabase account, once per machine.
   - `link` connects this repo to one project and asks for its database password (Settings → Database → Database password). Without it, `db push` fails with "Cannot find project ref. Have you run supabase link?".
   - `db push` may warn `failed to cache migrations catalog: ... failed to inspect docker image` if Docker isn't running. That's harmless; look for `Finished supabase db push.` and check that `user_wolfram_keys` and `wolfram_usage` appear in the Table Editor.

   This creates both tables, their Row Level Security policies, and the `increment_wolfram_usage` / `decrement_wolfram_usage` functions that count free lookups atomically. The comments in the migration explain why its `revoke`/`grant` lines matter.
5. **Project Settings → API** → copy the Project URL, the `anon` public key and the `service_role` secret key.
6. Put the URL and `service_role` key in `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), and the URL and `anon` key in `frontend/.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

**Changing the schema later:**

```bash
npx supabase migration new <description>   # new timestamped file in supabase/migrations/
# write the SQL in that file
npx supabase db push                        # applies only migrations not yet applied
```

`link` is needed again only on a different machine or clone (it's stored locally, not committed) or for a different project.

## Running

```bash
npm run dev
```

This runs [`scripts/dev.js`](../scripts/dev.js), which starts the API server and the frontend together. Open the URL Vite prints, usually `http://localhost:5173`.

- **Port:** if `PORT` isn't set, the API uses the first free port from 3000 up and says so when 3000 is taken (for example by a Docker container). If `PORT` is set, it uses exactly that and stops with an error when something else has it. Either way the frontend is pointed at the same port, so they can't disagree.
- **Stopping:** Ctrl+C, or either half crashing, stops both.
- **Reloading:** the frontend reloads changes instantly; **the API server doesn't**. Restart `npm run dev` after editing `server.js` or `.env`. Otherwise the browser runs new frontend code against the old server.
- **`npm start`** runs only the API server, on `PORT` or 3000. It's what Render runs. It never changes port: if its port is taken, it exits with a clear error.
- **The production build locally:** `npm run build` at the repo root builds `frontend/dist`, which the API server then serves itself, the same as visiting the Render URL directly.

**Voice input** needs `localhost` or https. Opening the dev server by its network IP (for example from a phone) blocks the microphone without a permission prompt, and the mic button says so. The first voice clip after starting the server downloads and loads Whisper, so it takes noticeably longer.

**Trying `local` mode:** set `FOOD_DETECTOR=local` in `.env` and restart. The first photo or description downloads the models (about 1.1–1.5 GB) and is slow; later ones are faster.

## Tests

### Unit tests (run these before every push)

```bash
npm test                    # API server: Node's built-in test runner, test/*.test.js
npm test --prefix frontend  # frontend: Vitest + jsdom, frontend/src/**/*.test.{js,jsx}
```

Neither suite calls Supabase, any AI model or Wolfram Alpha; all of them are stubbed, so the tests are fast, free and work offline.

- **API server** ([`test/server.test.js`](../test/server.test.js)), one file with a shared setup: a single test server, fake Supabase, and one fake for every outside service (models and Wolfram) that each test configures, defaulting to "unreachable" so a test only reaches a service it set up itself. Sections: tag cleanup (comma lists, length cap, dangling "and"); `/api/detect-food-text` (input checks, model failures, login); `/api/transcribe` input checks and the 20-second limit; food and drink only (every way a model says "not food", unsigned and forged tags, one user's signature not working for another, no shortened retry); free-lookup refunds on every failure path; and user-facing error messages (below).
- **Frontend**, one test file next to each module it tests: [`DescribeFood.test.jsx`](../frontend/src/components/DescribeFood.test.jsx) (submitting text; recording, transcribing and filling the box without submitting; silent clips, naming the mic; a blocked mic; undecodable recordings; hiding the mic where recording isn't supported), [`UploadForm.test.jsx`](../frontend/src/components/UploadForm.test.jsx) (the confirm step never looking anything up before confirmation; edits going through the text path; non-food messages; unreadable photos), [`api.test.js`](../frontend/src/lib/api.test.js) and [`useAuth.test.js`](../frontend/src/hooks/useAuth.test.js) (error messages, below).

### Error-message tests

Users should only ever see plain-language messages, never raw ones like "Failed to fetch", a stack trace or "Unexpected token '<'". Two suites enforce it, with matching lists of what a raw message looks like:

- **API server** (the "user-facing error messages" section of [`test/server.test.js`](../test/server.test.js), part of `npm test`): broken JSON, oversized photos and clips, an unknown route, Supabase unreachable during the sign-in check, every model failing with technical text in its reply, and Supabase errors while counting usage or saving a key. Each must come back as JSON with a friendly message.
- **Frontend** ([`frontend/src/test/rawErrors.js`](../frontend/src/test/rawErrors.js) is the shared check): [`api.test.js`](../frontend/src/lib/api.test.js) runs every API function with the server unreachable (each browser's own wording), an HTML error page, and a server message that must pass through unchanged; [`useAuth.test.js`](../frontend/src/hooks/useAuth.test.js) covers Supabase sign-in errors; the component tests cover undecodable recordings and unreadable photos.

How the app keeps to this: the API client throws only `FriendlyError`s, and components show an error's message only if it's a `FriendlyError` (see [`frontend/src/lib/errors.js`](../frontend/src/lib/errors.js)); anything else gets a plain fallback. When adding an error message, write it for users, and add a case to these suites.

### Live tests (real models)

```bash
npm run test:live                      # models chosen by FOOD_DETECTOR in .env
FOOD_DETECTOR=local npm run test:live  # the local model
```

[`test/live/outliers.live.test.js`](../test/live/outliers.live.test.js) sends real-world outliers to the real models through the real routes: things that must be refused (chemicals, medicine, objects, an animal, questions, prompt-injection attempts) and foods that must still pass. Run it after changing any prompt or model.

- It uses model quota (Gemini's free daily quota in `grubwatch` mode) but never Wolfram Alpha.
- Cases are **skipped, not failed,** when the models are unavailable, so check the skip count before trusting a pass.
- It isn't part of `npm test`, because it depends on outside services being up.
- To add a case, add a line to the `NOT_FOOD` or `FOOD` list. Keep cases different from the worked examples in the prompts, so the suite tests generalization rather than recall.

### Lint

```bash
npm run lint --prefix frontend   # oxlint
```

## Project layout

| Path | What it is |
| --- | --- |
| [`server.js`](../server.js) | The API server: auth, food detection, transcription, the food-only check, Wolfram lookups and usage, and serving the built frontend |
| [`scripts/dev.js`](../scripts/dev.js) | `npm run dev`: picks the API port and starts the server and frontend together |
| [`test/`](../test) | API server tests: `server.test.js` (unit), `live/` (real models) |
| [`frontend/src/App.jsx`](../frontend/src/App.jsx) | App shell: login gate, header with usage, Home and Settings tabs (bottom bar on phones, top nav on desktop) |
| [`frontend/src/components/UploadForm.jsx`](../frontend/src/components/UploadForm.jsx) | Photo upload, the describe box, the confirm step and the result panel |
| [`frontend/src/components/DescribeFood.jsx`](../frontend/src/components/DescribeFood.jsx) | Text box with mic: recording, transcription and voice errors |
| [`frontend/src/components/`](../frontend/src/components) | Also `AuthPanel` (login), `SettingsPanel` (the Settings tab: usage, personal Wolfram key, Appearance, sign out), `NutritionResult`, `Lightbox` and `Dialog` (native `<dialog>` modals), `ui.jsx` (shared Tailwind buttons, cards and fields) and `icons.jsx` |
| [`frontend/src/lib/api.js`](../frontend/src/lib/api.js) | Every call to the API server |
| [`frontend/src/lib/audio.js`](../frontend/src/lib/audio.js) | Decoding recordings to 16 kHz for Whisper, and the silence check |
| [`frontend/src/hooks/`](../frontend/src/hooks) | Session (`useAuth`), Wolfram usage, light/dark choice (`useAppearance`), device type, and installed-PWA detection (`useStandalone`) |
| [`frontend/vite.config.js`](../frontend/vite.config.js) | Dev server `/api` proxy, PWA manifest and service worker, test setup |
| [`supabase/migrations/`](../supabase/migrations) | Database schema: Wolfram key and usage tables, security policies, usage functions |
| [`netlify.toml`](../netlify.toml) | Netlify build settings and Node version |
| [`.env.example`](../.env.example), [`frontend/.env.example`](../frontend/.env.example) | Templates listing every setting |
| [`overwatch-images/`](../overwatch-images) | Sample food photos, served at `/overwatch-images/`; PWA icons are in `frontend/public/overwatch-images/` |

## Customization

- **Nutrition image size:** `width` (pixels) and `fontsize` (points) in `fetchWolframImage()` in [`server.js`](../server.js). The [Simple API docs](https://products.wolframalpha.com/simple-api/documentation/) list the other parameters (`background`, `foreground`, `layout`, `units` and more).
- **Free lookups per day:** `WOLFRAM_DAILY_FREE_LOOKUPS`.
- **Items per meal and word cap:** `MAX_MEAL_ITEMS` and `MAX_TAG_WORDS` in `server.js`. The [measurements behind them](how-it-works.md#how-wolfram-queries-are-built) explain the trade-off.
- **Recording length:** `MAX_RECORDING_SECONDS` in both `server.js` and `frontend/src/lib/audio.js`; keep them equal.
- **Prompts:** `PHOTO_RULES`, `DESCRIPTION_RULES`, `NOT_FOOD_RULE` and the `LOCAL_*` examples in `server.js`. Run `npm run test:live` after any change.
