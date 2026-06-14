# SPAGS — Slate Press A Google Scrape

Cloudflare Worker that scrapes Google Maps search results with [Browser Run](https://developers.cloudflare.com/browser-rendering/) (Playwright) and stores jobs + places in [Supabase](https://supabase.com/).

## Stack

| Layer | Service |
|---|---|
| Compute + browser | Cloudflare Worker + Browser Run |
| Database | Supabase Postgres |
| API | REST on the Worker |

## Prerequisites

1. **Cloudflare Workers Paid plan** (Browser Run limits)
2. **Browser Rendering enabled** on account `e0f6f68f26f8a26a75eaa793385019ef`
3. **Supabase project** — "Slate Press A Google Scrape"

## 1. Supabase setup

1. Open your [Supabase org](https://supabase.com/dashboard/org/omxubognelfagofushxn) and create/select the project.
2. In **SQL Editor**, run the full contents of [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy from **Project Settings → API**:
   - Project URL
   - `service_role` key (server only — never expose in a browser)

## 2. Local secrets

```powershell
cd spags
copy .dev.vars.example .dev.vars
# Edit .dev.vars with your Supabase URL and service role key
```

Optional: set `SCRAPE_API_KEY` to require `X-API-Key` or `Authorization: Bearer` on `/api/*` routes.

Production secrets:

```powershell
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SCRAPE_API_KEY
```

## 3. Install & dev

Browser bindings only work remotely:

```powershell
npm install
npm run dev
```

Dev server: `http://127.0.0.1:8787`

## 4. Deploy

```powershell
npm run deploy
```

Worker name: `spags` → `https://spags.<your-subdomain>.workers.dev`

## API

### `GET /`

Health / service info.

### `POST /api/jobs`

Create a scrape job. Processing runs in the background via `waitUntil`.

```json
{
  "query": "dentists in Austin TX",
  "lang": "en",
  "depth": 2
}
```

- `query` — Google Maps search text (required)
- `lang` — language code (default `en`)
- `depth` — scroll passes on the results feed, 1–10 (default `1`)

Response `202`:

```json
{
  "job": {
    "id": "uuid",
    "query": "dentists in Austin TX",
    "status": "pending",
    ...
  }
}
```

### `GET /api/jobs`

List recent jobs (newest first).

### `GET /api/jobs/:id`

Job status + scraped `places` array.

### Example

```powershell
$base = "http://127.0.0.1:8787"
$headers = @{ "Content-Type" = "application/json" }

# Create job
$job = Invoke-RestMethod -Method POST -Uri "$base/api/jobs" -Headers $headers -Body '{"query":"coffee shops in Portland OR","depth":2}'

# Poll until completed
do { Start-Sleep -Seconds 5; $result = Invoke-RestMethod -Uri "$base/api/jobs/$($job.job.id)" } while ($result.job.status -in @("pending","running"))

$result.places | Format-Table title, rating, review_count, maps_url
```

## Architecture

```
POST /api/jobs
  → insert scrape_jobs (pending)
  → ctx.waitUntil(runScrapeJob)
       → Browser Run / Playwright → Google Maps
       → upsert places
       → update job status
```

## Limits & notes

- **MVP scraper** — extracts listings from the Maps results feed (title, category, address hints, rating, URL, coords from link). It does not open each place detail page yet.
- **Google may block** headless traffic on large jobs; add delays, lower `depth`, or retry later.
- **Worker CPU time** — very large result sets may need [Queues](https://developers.cloudflare.com/queues/) in a future iteration.
- **Legal** — scrape responsibly; respect applicable laws and terms of service.

## Project layout

```
spags/
  src/
    index.ts          Worker entry
    routes.ts         HTTP handlers
    supabase.ts       DB helpers
    scrape/maps.ts    Playwright scraper
    scrape/runner.ts  Job orchestration
  supabase/schema.sql Database schema
  wrangler.jsonc
  package.json
```

## Related

- Static site: `../` (slatepress.org on Cloudflare Pages)
- Original inspiration: [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) (Go + Docker; not used directly here)
