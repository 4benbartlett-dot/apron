# Deploying Apron

Apron is a pnpm monorepo. The web app lives in `apps/web` and imports two
workspace packages (`@apron/cba-engine`, `@apron/data`). The only thing to get
right on any host is: **install from the repo root, build `apps/web`.**

## Vercel (recommended — ~2 minutes)

The code is already on GitHub. To put it live:

1. Go to **https://vercel.com/new** and sign in with GitHub.
2. **Import** the `apron` repository.
3. Set **Root Directory → `apps/web`** (the one setting that matters — click
   "Edit" next to Root Directory and pick `apps/web`). Vercel auto-detects
   Next.js and installs the whole pnpm workspace from the repo root.
4. Click **Deploy.**

That's it — it'll be live at `apron-<something>.vercel.app` in about a minute.
Share links (`?gm=…&board=…`) and the OG card at `/api/og` work automatically.

## Or the CLI

```bash
npm i -g vercel          # once
cd apps/web && vercel    # log in via browser, accept the defaults
```

## Notes

- **No secrets are in the repo.** The scrapers read `FIRECRAWL_API_KEY` from
  your local `~/.env` at scrape time; nothing is needed at runtime, so no env
  vars are required on Vercel.
- To refresh the data later: `cd packages/data && node scripts/scrape-*.mjs`,
  then commit the updated JSON and push (Vercel redeploys automatically).
