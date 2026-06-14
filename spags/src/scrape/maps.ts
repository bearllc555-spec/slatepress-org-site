import { launch, type Browser, type Page } from "@cloudflare/playwright";
import type { ScrapedPlace } from "../types";

const MAPS_HOST = "https://www.google.com";
const IGNORED_EMAILS = new Set([
  "example.com",
  "sentry.io",
  "wixpress.com",
  "schema.org",
  "google.com",
  "gstatic.com",
]);

export interface ScrapeOptions {
  query: string;
  lang?: string;
  depth?: number;
}

interface PlaceSummary extends ScrapedPlace {
  email: string | null;
}

function buildSearchUrl(query: string, lang: string): string {
  const params = new URLSearchParams({ q: query, hl: lang });
  return `${MAPS_HOST}/maps/search/${encodeURIComponent(query)}?${params.toString()}`;
}

function normalizePlaceUrl(url: string): string {
  return url.replace(/\/data=.*$/i, "").split("?")[0];
}

function pickEmail(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const email = candidate.trim().toLowerCase();
    const domain = email.split("@")[1];
    if (!domain || IGNORED_EMAILS.has(domain)) continue;
    if (email.endsWith(".png") || email.endsWith(".jpg")) continue;
    return candidate.trim();
  }
  return null;
}

async function acceptConsentIfPresent(page: Page): Promise<void> {
  const selectors = [
    'button:has-text("Accept all")',
    'button:has-text("Reject all")',
    'button:has-text("I agree")',
    'form[action*="consent"] button',
  ];

  for (const selector of selectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 1500 }).catch(() => false)) {
      await button.click().catch(() => undefined);
      await page.waitForTimeout(800);
      return;
    }
  }
}

async function scrollResultsFeed(page: Page, depth: number): Promise<void> {
  const feed = page.locator('[role="feed"]').first();
  await feed.waitFor({ state: "visible", timeout: 30000 });

  for (let i = 0; i < depth; i++) {
    await feed.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await page.waitForTimeout(1200);
  }
}

async function extractPlacesFromFeed(page: Page): Promise<PlaceSummary[]> {
  return page.evaluate(() => {
    const parseRating = (text: string): number | null => {
      const match = text.match(/(\d+(?:\.\d+)?)/);
      return match ? Number(match[1]) : null;
    };

    const parseReviewCount = (text: string): number | null => {
      const match = text.replace(/,/g, "").match(/(\d+)/);
      return match ? Number(match[1]) : null;
    };

    const seen = new Set<string>();
    const results: PlaceSummary[] = [];

    const cards = Array.from(
      document.querySelectorAll('a[href*="/maps/place/"]'),
    ) as HTMLAnchorElement[];

    for (const anchor of cards) {
      const href = anchor.href;
      if (!href || seen.has(href)) continue;
      seen.add(href);

      const card =
        anchor.closest('[jsaction*="mouseover:pane"]') ??
        anchor.closest("div[role='article']") ??
        anchor.parentElement;

      const textParts = (card?.textContent ?? anchor.textContent ?? "")
        .split("\n")
        .map((part) => part.trim())
        .filter(Boolean);

      const title = anchor.getAttribute("aria-label") ?? textParts[0] ?? null;
      const category = textParts[1] ?? null;
      const address =
        textParts.find((part) => /\d/.test(part) && part.length > 8) ?? textParts[2] ?? null;

      const ratingText =
        textParts.find((part) => part.includes("(") || /\d\.\d/.test(part)) ?? "";
      const rating = parseRating(ratingText);
      const review_count = parseReviewCount(ratingText);

      let latitude: number | null = null;
      let longitude: number | null = null;
      const coordMatch = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coordMatch) {
        latitude = Number(coordMatch[1]);
        longitude = Number(coordMatch[2]);
      }

      results.push({
        title,
        category,
        address,
        phone: null,
        website: null,
        email: null,
        rating,
        review_count,
        latitude,
        longitude,
        maps_url: href,
        raw: {
          text_parts: textParts,
          aria_label: anchor.getAttribute("aria-label"),
        },
      });
    }

    return results;
  });
}

async function extractDetailPanel(page: Page): Promise<{
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
}> {
  await page
    .locator('button[data-item-id="address"], h1')
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .catch(() => undefined);

  return page.evaluate(() => {
    const aria = (selector: string) => {
      const el = document.querySelector(selector);
      return el?.getAttribute("aria-label") ?? null;
    };

    const addressLabel = aria('button[data-item-id="address"]');
    const address =
      addressLabel?.replace(/^Address:\s*/i, "") ??
      document.querySelector('button[data-item-id="address"]')?.textContent?.trim() ??
      null;

    const phoneLabel = aria('button[data-item-id*="phone"]');
    const telLink = document.querySelector('a[href^="tel:"]') as HTMLAnchorElement | null;
    const phone =
      phoneLabel?.replace(/^Phone:\s*/i, "") ??
      telLink?.href.replace(/^tel:/i, "") ??
      telLink?.textContent?.trim() ??
      null;

    const websiteLink = document.querySelector(
      'a[data-item-id="authority"]',
    ) as HTMLAnchorElement | null;
    const website =
      websiteLink?.href && !websiteLink.href.includes("google.com")
        ? websiteLink.href
        : null;

    const mailto = document.querySelector('a[href^="mailto:"]') as HTMLAnchorElement | null;
    const email = mailto?.href.replace(/^mailto:/i, "").split("?")[0] ?? null;

    return { address, phone, website, email };
  });
}

async function extractEmailFromWebsite(page: Page, websiteUrl: string): Promise<string | null> {
  try {
    await page.goto(websiteUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1200);

    const candidates = await page.evaluate(() => {
      const found: string[] = [];
      document.querySelectorAll('a[href^="mailto:"]').forEach((node) => {
        const href = (node as HTMLAnchorElement).href.replace(/^mailto:/i, "").split("?")[0];
        if (href) found.push(href);
      });

      const text = document.body?.innerText ?? "";
      const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (matches) found.push(...matches);
      return found;
    });

    return pickEmail(candidates);
  } catch {
    return null;
  }
}

async function enrichPlace(page: Page, place: PlaceSummary, searchUrl: string): Promise<PlaceSummary> {
  const placeUrl = normalizePlaceUrl(place.maps_url);

  await page.goto(placeUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await acceptConsentIfPresent(page);
  await page.waitForTimeout(1200);

  const details = await extractDetailPanel(page);

  place.address = details.address ?? place.address;
  place.phone = details.phone;
  place.website = details.website;
  place.email = details.email;

  if (place.website && !place.email) {
    place.email = await extractEmailFromWebsite(page, place.website);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => undefined);
  }

  place.raw = {
    ...place.raw,
    detail: details,
    enriched_at: new Date().toISOString(),
  };

  return place;
}

export async function scrapeGoogleMaps(
  browserBinding: Fetcher,
  options: ScrapeOptions,
): Promise<ScrapedPlace[]> {
  const lang = options.lang ?? "en";
  const depth = Math.min(Math.max(options.depth ?? 1, 1), 10);
  const searchUrl = buildSearchUrl(options.query, lang);

  let browser: Browser | undefined;

  try {
    browser = await launch(browserBinding);
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await acceptConsentIfPresent(page);
    await scrollResultsFeed(page, depth);

    const summaries = await extractPlacesFromFeed(page);
    const enriched: PlaceSummary[] = [];

    for (const summary of summaries) {
      try {
        enriched.push(await enrichPlace(page, summary, searchUrl));
      } catch (error) {
        summary.raw = {
          ...summary.raw,
          enrich_error: error instanceof Error ? error.message : "Enrichment failed",
        };
        enriched.push(summary);
      }
    }

    return enriched;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
