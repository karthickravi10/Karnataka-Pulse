# Karnataka Pulse (shared web version)
A scheduled GitHub job fetches, translates and groups the news every ~20 minutes, then publishes a static page to Cloudflare Pages.
Open that page on any phone or computer. Edit the source list at the top of `app.js` (the `S:[...]` list).
Setup steps are in the chat. The news itself is never stored in GitHub, only on your Cloudflare page.
Note: GitHub pauses scheduled jobs after 60 days with no repository activity. If that happens, open the Actions tab and re-enable it.

File `update.yml` must be created in GitHub at the path `.github/workflows/update.yml`.

## Daily leader sheet
The sheet lists all 39 leaders (27 INC, 12 NDA) in the original order. It is written when someone clicks "Write the report" in the sheet panel (about 3 minutes, once or twice a day is plenty); nothing writes it automatically. The finished report is saved for the whole team (needs the KV binding BRIEFS).
The AI that writes it runs in the Pages Function `functions/api/sheet.js`. It tries, in order: GitHub Models (secret `GH_MODELS_TOKEN`), Gemini (secret `GEMINI_KEY`), then Cloudflare AI (the binding `AI`, which shares the daily allowance used for headlines).
Add the secrets in Cloudflare: Workers and Pages, your project, Settings, Variables and Secrets. Keep the keys private.
