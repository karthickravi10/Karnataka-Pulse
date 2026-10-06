# Karnataka Pulse (shared web version)
A scheduled GitHub job fetches, translates and groups the news every ~20 minutes, then publishes a static page to Cloudflare Pages.
Open that page on any phone or computer. Edit the source list at the top of `app.js` (the `S:[...]` list).
Setup steps are in the chat. The news itself is never stored in GitHub, only on your Cloudflare page.
Note: GitHub pauses scheduled jobs after 60 days with no repository activity. If that happens, open the Actions tab and re-enable it.

File `update.yml` must be created in GitHub at the path `.github/workflows/update.yml`.
