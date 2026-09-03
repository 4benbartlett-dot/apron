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

- **No runtime secrets.** The app serves committed JSON snapshots, so no env
  vars are required on Vercel. (Data-refresh scripts run locally and read their
  own credentials from your environment.)
- **`/admin` is dev-only.** The front office writes to the repo's data files
  and shells out to git, so it 404s in production unless `APRON_ADMIN=1` is
  set — and a Vercel filesystem is read-only, so leave it unset there. If you
  ever do expose it (a preview deployment, a tunnel to your laptop), set
  `APRON_ADMIN_PASSWORD` too: `middleware.ts` then requires it as HTTP Basic
  auth on every `/admin` request.
- To refresh the data later: `cd packages/data && node scripts/scrape-*.mjs`,
  then commit the updated JSON and push (Vercel redeploys automatically).
