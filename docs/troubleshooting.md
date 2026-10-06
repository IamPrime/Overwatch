# Troubleshooting

Find the message you're seeing. Messages in the app are quoted exactly; for server-side problems, the **server log** is the terminal running `npm run dev` locally, or the service's Logs page on Render.

- [Identifying food](#identifying-food)
- [Nutrition lookups](#nutrition-lookups)
- [Voice input](#voice-input)
- [Signing in](#signing-in)
- [Local development](#local-development)
- [Production (Render)](#production-render)
- [Tests](#tests)

## General

### "Couldn't reach Overwatch - check your internet connection and try again."

The browser couldn't reach the API server at all. Usually the device is offline, or Render's free tier is still waking up (up to a minute after 15 idle minutes); retry. If it never works, check that Netlify's `VITE_API_BASE` points at the right Render URL and that the Render service is running.

### "Overwatch sent back something unexpected - please try again."

A request succeeded but the reply wasn't what the app expected, typically because `VITE_API_BASE` points at a site that answers with its own page instead of the API. Check `VITE_API_BASE`.

### "Something went wrong on our side - please try again."

An unexpected server error. The details are in the server log, on the line starting `Unhandled error on`.

### "That request couldn't be read - please try again." / "That isn't something Overwatch can do - try refreshing the app."

The server received a malformed request, or one for an API route that doesn't exist. From the app, that usually means an old cached copy talking to a newer server; refresh. Otherwise something is calling the API directly with a bad request.

### "That photo is too large - try a smaller one, or a lower camera resolution."

Photos are limited to about 7 MB (10 MB once encoded for upload). Use a smaller photo or a lower camera resolution.

## Identifying food

### "Could not identify the food in this image." / "Could not identify the food from that description."

Every configured model failed. The server log shows one line per model tried:

| Log line | Meaning | Fix |
| --- | --- | --- |
| `Purdue primary model failed: Unexpected token '<', "<html>...` (same for fallback) | Purdue GenAI Studio returned an HTML error page instead of an answer: an outage on Purdue's side | Wait, or check [genai.rcac.purdue.edu](https://genai.rcac.purdue.edu/). Gemini covers it if `GEMINI_API_KEY` is set |
| `Gemini model failed: ... "code":429 ... "You exceeded your current quota"` | Gemini's free daily quota is used up | Wait for the daily reset. Use a separate key for local testing so testing doesn't use production's quota |
| `Gemini model failed: ... "code":503 ... "high demand"` | Gemini is temporarily overloaded | Usually clears within minutes; retry |
| `Neither PURDUE_GENAI_API_KEY nor GEMINI_API_KEY is configured` | No cloud model key is set | Set at least one in `.env` (or on Render) and restart |

With `FOOD_DETECTOR=local`, check the log for model download errors; the first request after starting downloads the models.

### "That doesn't look like food or drink - try another photo, or describe what you're eating." / "That doesn't sound like food or drink - Overwatch can only look up nutrition for things you eat or drink."

The AI judged the input not to be food or drink. That's intended for things like cleaning products, medicine, objects, pets or questions. See [Food and drink only](how-it-works.md#food-and-drink-only).

If a **real food** is refused, describe it more plainly ("1 bowl chicken soup" rather than a brand or slang). If it keeps happening, add it to the `FOOD` list in [`test/live/outliers.live.test.js`](../test/live/outliers.live.test.js) and adjust the prompts until `npm run test:live` passes.

If **non-food gets through**, add it to the `NOT_FOOD` list the same way.

### The photo guess is wrong, or in local mode it's always a single dish

Edit the guess in the *Looks like:* box before pressing **Look up nutrition**; nothing is looked up until then. In `local` mode the photo classifier can only choose one of 101 fixed dishes, so it can't count items and gives some dish even for non-food photos.

## Nutrition lookups

### `"..." doesn't appear to be a food or drink that Overwatch can find nutrition facts for. If it is one, try describing it differently...`

Wolfram Alpha didn't understand a tag the AI had approved. Usually it isn't really a food or drink, or it was misheard or mistyped (Whisper hearing "chicken salad" as "check in salad"). Rephrasing in the box usually fixes real foods: use the common name, add an amount ("1 cup"), or split very long meals into separate lookups. These failed lookups are refunded.

The server only ever sends Wolfram the exact approved tag, never a shortened version; see [No shortened retries](how-it-works.md#no-shortened-retries).

### "Please identify the food again before looking up its nutrition."

The lookup didn't carry a valid [tag signature](how-it-works.md#2-the-server-enforces-the-ais-decision-signed-tags). Common causes:

- **An old copy of the app** (an installed PWA or a tab left open from before the signature was added) doesn't send one. Refresh the page; the installed app updates itself on its next launch.
- **`SUPABASE_SERVICE_ROLE_KEY` changed** while the user was on the confirm step. Identifying the food again fixes it.
- **Something is calling the API directly** without going through a detect route first. That's the check working as designed.

### "You've used all 5 free nutrition lookups for today. Add your own free Wolfram Alpha App ID in Settings to keep going."

Expected once a user without their own key reaches the daily limit on the shared key. Add a free personal key in Settings, or wait for the next UTC day. The limit is `WOLFRAM_DAILY_FREE_LOOKUPS`.

### "Overwatch is taking too long to respond right now - please try again."

Wolfram timed out (30 seconds). Long meals with about 5 or more items occasionally do this; retry, or split the meal. These lookups are refunded.

### "Failed to reach Overwatch's nutrition lookup service."

The server couldn't reach Wolfram at all (network problem or Wolfram outage). Retry later. These lookups are refunded.

### "Overwatch's nutrition lookup isn't configured on the server."

`WOLFRAM_APP_ID` isn't set. Set it and restart (on Render, save and redeploy).

### "Could not verify your Overwatch usage right now." / "Could not fetch your Overwatch usage right now."

The server couldn't read or update usage in Supabase. Check that the migrations are applied (the `wolfram_usage` table and `increment_wolfram_usage` function exist; see [Supabase setup](development.md#supabase-setup)) and that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` belong to the same project.

### Lookups that used to work start failing for everyone

The shared `WOLFRAM_APP_ID` may have reached Wolfram's 2,000-calls-a-month free limit. Check usage in the [Wolfram Alpha Developer Portal](https://developer.wolframalpha.com/portal/myapps/). The exact error Wolfram returns when over quota hasn't been confirmed. Users with their own key aren't affected.

### "That Wolfram Alpha App ID doesn't seem to work. Double check it and try again."

The personal App ID entered in Settings failed a test query to Wolfram. Check it was copied completely from the Developer Portal.

## Voice input

### `Didn't catch anything from "<microphone name>". If that's the wrong microphone, pick another...`

The recording was silent, which almost always means the browser is listening to the wrong microphone. A common case is a **virtual microphone** such as **Camo**, which records pure silence unless its phone app is connected.

- **Windows:** Settings → System → Sound → Input. Choose the right microphone; the level bar there should move when you talk.
- **Edge:** the lock or mic icon in the address bar → site permissions → microphone, or `edge://settings/content/microphone`. **Chrome:** `chrome://settings/content/microphone`. **Opera:** `opera://settings/content/microphone`.
- Reload the page and try again.

### "Microphone access was blocked - allow it in your browser settings, or type instead."

Microphone permission was denied for the site. Allow it in the site permissions (address bar icon). On Windows, also check Settings → Privacy & security → Microphone: "Microphone access", "Let apps access your microphone" and "Let desktop apps access your microphone" must be on.

### "No microphone was found - plug one in, or type instead."

The browser sees no microphone at all. Connect one, or check it's enabled in Windows sound settings.

### "Voice input needs a secure (https) connection - type instead."

Browsers only allow the microphone on https or `localhost`. Opening the dev server by its network IP (for example `http://192.168.x.x:5173` on a phone) is blocked without a permission prompt. Use `localhost`, or test on the deployed https site.

### "Couldn't process that recording - try again, or type instead."

The browser couldn't decode the recording (rare; usually an unusual microphone or browser audio format). Try again, or try another browser.

### "Couldn't transcribe that recording - try again, or type instead."

Whisper failed on the server. Check the server log; the first clip after a restart also downloads the model, so a download failure shows up here.

### "Recordings can be at most 20 seconds long."

The clip was too long. Recording stops itself at 20 seconds, so this means the browser and server limits differ; `MAX_RECORDING_SECONDS` in `server.js` and `frontend/src/lib/audio.js` must match.

### The mic button doesn't appear

The browser can't record audio (no `MediaRecorder`), which only happens in very old browsers. Typing still works.

### The first voice clip is very slow

Normal after starting the server or a deploy: Whisper downloads and loads on first use. Later clips are faster. On Render's free tier this happens again after every spin-down; see [Free-tier limits](deployment.md#free-tier-limits).

### The transcript is in the wrong language, or garbled

Whisper detects the language from the clip. Very short or quiet clips give it less to go on; speak a full phrase, close to the mic. The text can always be corrected in the box before looking it up.

## Signing in

### Messages on the login form

| Message | Cause |
| --- | --- |
| "That email and password don't match an account." | Wrong email or password |
| "An account with that email already exists - try signing in instead." | Signing up with an existing email |
| "Please confirm your email first - check your inbox for the link." | Email confirmation is on in Supabase and the link hasn't been clicked |
| "That password is too weak - try a longer one with a mix of letters and numbers." | The password fails Supabase's password rules |
| "Too many attempts - please wait a minute and try again." | Supabase's rate limit |
| "Continuing without an account isn't available right now - please sign in with an email and password." | Anonymous Sign-Ins is off in Supabase (Authentication → Providers) |
| "Couldn't reach the sign-in service - check your internet connection and try again." | Offline, or Supabase unreachable |
| "Something went wrong signing you in - please try again." | Any other Supabase error; check the browser console |

These are mapped from Supabase's error codes in [`frontend/src/lib/errors.js`](../frontend/src/lib/errors.js).

### "Couldn't check your sign-in right now - please try again in a moment."

The API server couldn't reach Supabase to verify the session. Usually temporary; if it persists, check Supabase's status and that `SUPABASE_URL` is right.

### "Missing Authorization header." / "Invalid or expired session." on every request

The app has no valid session, or the server can't verify it. Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set on the server and belong to the same Supabase project as the frontend's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Signing out and in again fixes a genuinely expired session.

### "Supabase credentials are not configured on the server."

`SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing on the server.

### The installed app stays on the login form instead of signing in automatically

Either **Anonymous Sign-Ins** isn't enabled in Supabase (Authentication → Providers; off by default), or the installed-app detection in `frontend/src/hooks/useStandalone.js` didn't recognize this install (it varies between browsers and iOS versions). Tap **Continue without an account**; it uses the same anonymous sign-in.

## Local development

### The app shows "Not Found" or "Payload Too Large", or usage won't load

Requests aren't reaching Overwatch: another program owns the port the frontend is forwarding to (for example a Docker container on 3000). Start everything with `npm run dev` from the repo root, which picks a free port for both halves. Starting Vite alone inside `frontend/` forwards to `PORT` from the root `.env`, or 3000.

### `[dev] PORT=3000 (from .env or your shell) is already in use`

`PORT` is pinned in `.env` and something else is using it. Remove the `PORT` line to let `npm run dev` pick a free port, or free that port.

### `Port 3000 is already in use by another program. Use npm run dev locally...`

`npm start` found its port taken; it never changes port by itself. Use `npm run dev` locally, or set a free `PORT`.

### Server changes don't seem to take effect

The API server doesn't reload code. Restart `npm run dev` after changing `server.js` or `.env`. The frontend reloads by itself, so it's easy to end up with new frontend code talking to an old server.

### `Error: UNKNOWN: unknown error, read` when starting the server

A Windows + OneDrive quirk, not an app bug: OneDrive briefly locks a file it has just synced, so Node's read fails. Run the command again. If it keeps happening, mark the project folder "Always keep on this device" in OneDrive, or move the project out of OneDrive.

### Browser console: `<meta name="apple-mobile-web-app-capable" content="yes"> is deprecated`

Harmless. `frontend/index.html` has the standard `mobile-web-app-capable` tag and keeps the Apple one for older iPhones, which only read that one.

## Production (Render)

### The service restarts by itself

The log shows `==> Running 'npm start'` again with no new `==> Deploying...`. That's Render restarting a crashed process, almost always out of memory on the free tier's 512 MB (Render doesn't log "out of memory" explicitly).

- After setting `FOOD_DETECTOR=local`: switch back to `grubwatch`. The local models don't fit, and re-download on every restart.
- After someone uses the mic: set `WHISPER_MODEL=onnx-community/whisper-tiny`.

### The first request after a while takes 30–60 seconds

The free tier sleeps after 15 minutes without requests and wakes on the next one. It's slow, not broken.

See [deployment.md](deployment.md) for production settings and rollbacks.

## Tests

### `npm run test:live` passes but shows many skipped cases

Skipped means a model was unavailable (`502`), not that the case passed. Check the server-side reasons above (Purdue outage, Gemini quota) and run it again later.

### `npm test` fails after changing a response format

The unit tests check exact responses, for example `{ tag, tagToken }` from the detect routes. Update the test along with the change.
