import {
  createSupabase,
  getJob,
  insertPlaces,
  markJobCompleted,
  markJobFailed,
  markJobRunning,
} from "../supabase";
import { scrapeGoogleMaps } from "./maps";
import type { Env } from "../types";

export async function runScrapeJob(env: Env, jobId: string): Promise<void> {
  const supabase = createSupabase(env);
  const job = await getJob(supabase, jobId);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (job.status === "completed") {
    return;
  }

  await markJobRunning(supabase, jobId);

  try {
    const places = await scrapeGoogleMaps(env.BROWSER, {
      query: job.query,
      lang: job.lang,
      depth: job.depth,
    });

    const inserted = await insertPlaces(supabase, jobId, places);
    await markJobCompleted(supabase, jobId, inserted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scrape error";
    await markJobFailed(supabase, jobId, message);
    throw error;
  }
}
