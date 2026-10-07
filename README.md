# Angalia

## Food Analysis Web

<details>
    <summary>Food is essential to every living thing on our planet for daily survival, strength, energy and health. As a human, we usually do not keep track of the nutrition in our food, even though as a species we have technologically advanced, still it is difficult to keep track of the nutrition value of the foods we consume.
    </summary>
<p> This simple application can help you keep track of the foods you consume and give you an almost instant nutrition fact check by identifying your food photo and looking up its nutrition facts.
</p>
</details>

## What it does

- **Photo:** take or choose a photo of your meal. The app identifies it, counting items it can clearly see ("2 fried eggs and 1 tortilla"), and **asks you to confirm or edit the guess** before looking anything up, so a wrong guess never uses up a lookup.
- **Text:** type what you ate, amounts included ("200g chicken breast and 1 cup rice"). Nutrition comes back for exactly those amounts.
- **Voice:** tap the mic and say it, in any of 99 languages. The server transcribes it with Whisper, and you check the text before looking it up. Works in every current browser.
- **Food and drink only:** anything else ("hydrogen peroxide", a pet, a question) is refused with an explanation.
- **Accounts:** email/password on the web, or no-password guest sessions in the installed phone app (PWA). A guest can turn their session into an account later from Settings without losing anything. Everyone gets 5 free nutrition lookups a day; adding your own free Wolfram Alpha App ID in Settings removes the cap.
- **Phone and desktop, light and dark:** one step per screen on phones, the lookup and its result side by side on desktop. Follows the device's light/dark setting, or pick one in Settings.

Nutrition facts come from the [Wolfram Alpha](https://www.wolframalpha.com/) Simple API. Food is identified by [Purdue GenAI Studio](https://genai.rcac.purdue.edu/) with a [Gemini](https://ai.google.dev/) fallback, or by models running on the server itself. Voice uses [Whisper](https://huggingface.co/onnx-community/whisper-base) on the server.

## Quick start

```bash
npm install
npm install --prefix frontend
cp .env.example .env                    # then fill in the keys - see docs/development.md
cp frontend/.env.example frontend/.env  # leave VITE_API_BASE empty for local dev
npm run dev                             # starts the API server and the frontend together
```

Then open the URL Vite prints (usually `http://localhost:5173`). Accounts need a Supabase project first; see [Supabase setup](docs/development.md#supabase-setup).

## Documentation

| Guide | What's in it |
| --- | --- |
| [How it works](docs/how-it-works.md) | Request flow for photos, text and voice; food detection backends; the food-only check and tag signing; how Wolfram queries are built; accounts and usage limits; API reference |
| [Development](docs/development.md) | Setup, every environment variable, Supabase setup, running locally, tests, project layout, customization |
| [Deployment](docs/deployment.md) | Render + Netlify, auto-deploys from the `app-version` branch, production settings, free-tier limits, checking and rolling back a deploy |
| [Troubleshooting](docs/troubleshooting.md) | Every user-facing error message and common setup problems, with causes and fixes |

## License

MIT — see [LICENSE](LICENSE).
