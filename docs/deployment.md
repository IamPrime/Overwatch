# Deployment

How Angalia is hosted, how a change gets to production, and what to check before and after. For local setup see [development.md](development.md).

- [Where it runs](#where-it-runs)
- [Releasing a change](#releasing-a-change)
- [Render settings](#render-settings-api-server)
- [Netlify settings](#netlify-settings-frontend)
- [Changing a setting](#changing-a-setting)
- [Free-tier limits](#free-tier-limits)
- [After a deploy](#after-a-deploy)
- [Rolling back](#rolling-back)

## Where it runs

| Service | Hosts | Deploys from |
| --- | --- | --- |
| [Render](https://render.com) (free tier) | The API server (`server.js`), plus its own copy of the frontend so the Render URL works directly | **`app-version`**, automatically on every push |
| [Netlify](https://netlify.com) | The frontend (`frontend/`), the main address users visit | **`app-version`**, automatically on every push |

Both services watch the **`app-version`** branch. Nothing is deployed from `main`: pushing or merging to `main` changes nothing in production. Which branch each one watches is set in its dashboard (Render: the service's Settings → Build & Deploy → Branch; Netlify: Site configuration → Build & deploy → Branches), not in this repo.

The Netlify frontend calls the Render API directly, cross-origin (allowed by `NETLIFY_ORIGIN`), rather than through Netlify's proxy. Netlify's proxy to an outside URL times out after about 27 seconds, which is shorter than Render's free-tier wake-up time (30–60 seconds) and slower requests such as transcription or the full model fallback chain. Calling Render directly lets the browser wait as long as the server needs.

## Releasing a change

1. **Run the unit tests** (both must pass):

   ```bash
   npm test
   npm test --prefix frontend
   ```

2. **If you changed a prompt, a model or the food-only check**, also run `npm run test:live` (and with `FOOD_DETECTOR=local` if the local path changed). Check that cases passed rather than being skipped because a model was down.
3. **If the change adds or renames an environment variable**, set it in the dashboards first; see [Changing a setting](#changing-a-setting). Code that needs a variable the service doesn't have yet fails as soon as it deploys.
4. **Commit and push to `app-version`.** Render and Netlify both start building within a minute or so. Each build takes a few minutes, and the two finish independently, so for a short time the new frontend can be talking to the old API, or the reverse. Avoid changes that only work if both halves update at exactly the same moment; for example, make the server accept both old and new request formats for one release.

   Installed PWAs and long-open tabs keep running the old frontend until they reload. When a release changes what the frontend sends, those users hit errors until they refresh. The release that added [tag signing](how-it-works.md#2-the-server-enforces-the-ais-decision-signed-tags) is one: old copies don't send a signature, so their lookups fail with "Please identify the food again..." until the app reloads.
5. **Check the deploy**; see [After a deploy](#after-a-deploy).

## Render settings (API server)

| Setting | Value |
| --- | --- |
| Branch | `app-version` |
| Build command | `npm install && npm run build` (the root `build` script also builds `frontend/dist`, which the server serves) |
| Start command | `npm start` (never `npm run dev`, which is for local development only) |

**Environment variables** (Render → the service → Environment):

| Variable | Production value |
| --- | --- |
| `FOOD_DETECTOR` | **`grubwatch`**. Not `local`: see [Free-tier limits](#free-tier-limits) |
| `PURDUE_GENAI_API_KEY`, `PURDUE_GENAI_MODEL`, `PURDUE_GENAI_FALLBACK_MODEL` | As in [development.md](development.md#environment-variables) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Strongly recommended, as the fallback when Purdue is down. Use a different key from the one you test with locally |
| `WHISPER_MODEL` | Unset (`whisper-base`), or `onnx-community/whisper-tiny` if the service runs out of memory |
| `WOLFRAM_APP_ID`, `WOLFRAM_DAILY_FREE_LOOKUPS` | The shared Wolfram key and the daily free limit |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The production Supabase project |
| `NETLIFY_ORIGIN` | The Netlify site's exact URL, e.g. `https://grubwatch.netlify.app` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Same as Netlify's. Needed because Render builds its own copy of the frontend |
| `VITE_API_BASE` | **Don't set it.** Empty means relative `/api` paths, which is right for Render's copy, since it's served by the API server itself |
| `PORT` | **Don't set it.** Render provides it |
| `LOCAL_MODEL_ID` | Not needed with `grubwatch` |

## Netlify settings (frontend)

[`netlify.toml`](../netlify.toml) in the repo sets the build: base directory `frontend`, command `npm run build`, publish directory `dist`, Node 24.

**Environment variables** (Netlify → Site configuration → Environment variables):

| Variable | Production value |
| --- | --- |
| `VITE_API_BASE` | The Render API's URL, e.g. `https://overwatch-0bic.onrender.com` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The production Supabase project |

Netlify only builds static files, so these are built into the JavaScript at build time. If the Render URL ever changes, update `VITE_API_BASE` and redeploy Netlify.

## Changing a setting

Code changes deploy on push, but **environment variables are only changed in the dashboards**:

- **Render:** saving an environment variable change offers to rebuild and redeploy; choose that so the running server picks it up.
- **Netlify:** a changed variable only takes effect in the next build. Trigger one from Deploys → Trigger deploy, or push a commit.
- **Both:** a `VITE_*` change is needed in both Render and Netlify, since each builds its own copy of the frontend.

Changes that needed **no** settings changes: the photo confirm step, text and voice input, Whisper, the food-only check and tag signing (its key comes from the existing `SUPABASE_SERVICE_ROLE_KEY`), the quantity and list rules, `npm run dev`, and the Tailwind redesign and rename to Angalia (Tailwind installs and builds with the frontend's other dependencies).

Confirmation emails (**Sign up**, and a guest's **Create account**) need one setting in **Supabase**, not Render or Netlify: Authentication → URL Configuration → **Redirect URLs** must list the Netlify URL and the Render URL, since each link returns to the address the person was using. An unlisted address sends them to the Site URL instead. See [Supabase setup](development.md#supabase-setup).

The Netlify site is still named `grubwatch` (`grubwatch.netlify.app`). Renaming it is optional; if you do, also update `NETLIFY_ORIGIN` on Render (otherwise the API rejects the frontend's requests) and the Supabase Redirect URLs.

## Free-tier limits

- **Memory (512 MB):** the server alone is about 70 MB. Whisper adds about 360 MB more once someone uses the mic (about 430 MB total with `whisper-base`), which fits with `grubwatch`. `local` would add the Food-101 and Qwen models on top and run out of memory. Render's logs don't say "out of memory": the sign is `==> Running 'npm start'` appearing again with no new deploy. If that happens after mic use, set `WHISPER_MODEL=onnx-community/whisper-tiny` (about 350 MB total). The figures were measured on Windows; Linux can differ somewhat.
- **Spin-down:** after 15 minutes without requests the service sleeps, and the next request takes 30–60 seconds while it wakes. That's slow, not failed.
- **Disk is wiped on restart:** after every deploy and every wake-up, the first voice clip downloads and loads Whisper again, so it's much slower than later ones.
- **Shared CPU:** transcription that takes about 6 seconds on a desktop is several times slower on the free tier's fraction of a CPU. A paid instance, or `whisper-tiny`, speeds it up.
- **Gemini free quota:** a daily limit shared by every request using that key. Once it's used up, Gemini answers `429` until it resets, and if Purdue is also down, identifying food fails for everyone. Testing locally with the production key uses the same quota.
- **Wolfram free tier:** 2,000 calls a month on the shared `WOLFRAM_APP_ID`, across all users. Users with their own key don't count against it.

## After a deploy

1. **Render logs** (the service → Logs) should end with:

   ```text
   Angalia server running at http://localhost:<port>
   Food detector: Purdue GenAI Studio (llama4:latest, fallback gemma4:26b-a4b), Gemini fallback (gemini-flash-latest)
   ```

   If it says `Food detector: local`, `FOOD_DETECTOR` is set wrong.
2. **Netlify:** Deploys → the latest deploy shows **Published**.
3. **In the app** (a hard refresh, Ctrl+Shift+R, makes sure the new version loads; the installed PWA updates itself on its next launch):
   - type `2 eggs and 1 slice toast` → a nutrition image appears;
   - type `hydrogen peroxide` → it's refused as not food;
   - upload a food photo → the *Looks like:* confirm box appears before any lookup;
   - tap the mic, say a food, tap again → the text box fills in (the first clip after a deploy is slow).

## Rolling back

If a deploy breaks production:

1. **Restore the last good version immediately:**
   - **Render:** the service → Events (or Deploys) → the last good deploy → **Rollback**.
   - **Netlify:** Deploys → the last good deploy → **Publish deploy**.

   Roll back both if the problem spans the frontend and API. After rolling back, check that each service's auto-deploy setting is still how you want it.
2. **Fix it in the branch.** A rollback only lasts until the next deploy, so the next push to `app-version` deploys whatever is on the branch. Either fix the problem, or undo the bad commit with `git revert <commit>` and push.
