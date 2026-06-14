import { createSupabase, getJob, markJobFailed } from "./supabase";
import type { Env, ScrapeJob } from "./types";

export const STALE_JOB_MS = 20 * 60 * 1000;

export interface JobHealth {
  is_running: boolean;
  is_stale: boolean;
  running_for_ms: number;
  message: string;
  reconciled: boolean;
}

function runningForMs(job: ScrapeJob): number {
  const started = job.started_at ?? job.created_at;
  return Date.now() - new Date(started).getTime();
}

function healthMessage(job: ScrapeJob, isStale: boolean, runningMs: number): string {
  if (job.status === "pending") {
    return "Queued and waiting to start.";
  }

  if (job.status === "completed") {
    return `Completed with ${job.places_found} place(s).`;
  }

  if (job.status === "failed") {
    return job.error ?? "Scrape failed.";
  }

  if (job.status === "running") {
    const minutes = Math.max(1, Math.round(runningMs / 60000));
    if (isStale) {
      return `Running for ${minutes} minute(s) with no completion — likely timed out.`;
    }
    return `Actively running for ${minutes} minute(s).`;
  }

  return "Unknown status.";
}

export async function checkJobHealth(
  env: Env,
  jobId: string,
  reconcile = false,
): Promise<{ job: ScrapeJob; health: JobHealth }> {
  const supabase = createSupabase(env);
  let job = await getJob(supabase, jobId);

  if (!job) {
    throw new Error("Job not found");
  }

  const runningMs = runningForMs(job);
  let isStale = job.status === "running" && runningMs > STALE_JOB_MS;
  let reconciled = false;

  if (isStale && reconcile) {
    await markJobFailed(
      supabase,
      jobId,
      "Worker timed out during scrape (reconciled from dashboard).",
    );
    reconciled = true;
    job = (await getJob(supabase, jobId))!;
    isStale = false;
  }

  const health: JobHealth = {
    is_running: job.status === "running",
    is_stale: isStale,
    running_for_ms: runningMs,
    message: healthMessage(job, isStale, runningMs),
    reconciled,
  };

  return { job, health };
}
