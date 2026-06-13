# slatepress.org — deployment

**GitHub:** https://github.com/bearllc555-spec/slatepress-org-site

**Source:** `slatepress-ops/landing-pages/slatepress-org-v1/index.html` (defensive redirect lander → slatepress.co)

## Cloudflare Pages

| Environment | Git branch | Preview URL |
|-------------|------------|-------------|
| **Dev (sandbox)** | `dev` | https://dev.slatepress-org.pages.dev |
| **Production** | `main` | https://slatepress-org.pages.dev |

- **Pages project:** `slatepress-org`
- **Custom domain:** `slatepress.org` (production only)
- **Build:** static HTML — no build step; deploy repo root

Workflow: `.github/workflows/deploy.yml` — deploys on push to `main` and `dev`.

### Branch workflow

1. Day-to-day work on **`dev`** — pushes auto-deploy to the dev preview URL.
2. Merge to **`main`** when ready for production / custom domain.

### GitHub Actions secrets

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | API token with Cloudflare Pages edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | `e0f6f68f26f8a26a75eaa793385019ef` |

### Manual deploy (local)

```powershell
cd c:\Users\thede\OneDrive\Documents\001-cloudflare\slatepress.org
npx wrangler pages deploy . --project-name=slatepress-org --branch=dev
```
