import { launch, type Browser, type Page } from "@cloudflare/playwright";
import type { ScrapedPlace } from "../types";

const MAPS_HOST = "https://www.google.com";

export interface ScrapeOptions {
  query: string;
  lang?: string;
  depth?: number;
}

function buildSearchUrl(query: string, lang: string): string {
  const params = new URLSearchParams({
    q: query,
    hl: lang,
  });
  return `${MAPS_HOST}/maps/search/${encodeURIComponent(query)}?${params.toString()}`;
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

async function extractPlaces(page: Page): Promise<ScrapedPlace[]> {
  return page.evaluate(() => {
    type RawPlace = {
      title: string | null;
      category: string | null;
      address: string | null;
      phone: string | null;
      website: string | null;
      rating: number | null;
      review_count: number | null;
      latitude: number | null;
      longitude: number | null;
      maps_url: string;
      raw: Record<string, unknown>;
    };

    const parseRating = (text: string): number | null => {
      const match = text.match(/(\d+(?:\.\d+)?)/);
      return match ? Number(match[1]) : null;
    };

    const parseReviewCount = (text: string): number | null => {
      const match = text.replace(/,/g, "").match(/(\d+)/);
      return match ? Number(match[1]) : null;
    };

    const seen = new Set<string>();
    const results: RawPlace[] = [];

    const cards = Array.from(document.querySelectorAll('a[href*="/maps/place/"]')) as HTMLAnchorElement[];

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

      const title =
        anchor.getAttribute("aria-label") ??
        textParts[0] ??
        null;

      const category = textParts[1] ?? null;
      const address = textParts.find((part) => /\d/.test(part) && part.length > 8) ?? textParts[2] ?? null;

      const ratingText = textParts.find((part) => part.includes("(") || /\d\.\d/.test(part)) ?? "";
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

export async function scrapeGoogleMaps(
  browserBinding: Fetcher,
  options: ScrapeOptions,
): Promise<ScrapedPlace[]> {
  const lang = options.lang ?? "en";
  const depth = Math.min(Math.max(options.depth ?? 1, 1), 10);
  const url = buildSearchUrl(options.query, lang);

  let browser: Browser | undefined;

  try {
    browser = await launch(browserBinding);
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await acceptConsentIfPresent(page);
    await scrollResultsFeed(page, depth);

    const places = await extractPlaces(page);
    return places;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
