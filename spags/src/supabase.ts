import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Env, PlaceRow, ScrapeJob, ScrapedPlace } from "./types";

export function createSupabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createJob(
  supabase: SupabaseClient,
  query: string,
  lang: string,
  depth: number,
): Promise<ScrapeJob> {
  const { data, error } = await supabase
    .from("scrape_jobs")
    .insert({ query, lang, depth, status: "pending" })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create job");
  }

  return data as ScrapeJob;
}

export async function getJob(supabase: SupabaseClient, id: string): Promise<ScrapeJob | null> {
  const { data, error } = await supabase.from("scrape_jobs").select().eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ScrapeJob | null) ?? null;
}

export async function listJobs(supabase: SupabaseClient, limit = 20): Promise<ScrapeJob[]> {
  const { data, error } = await supabase
    .from("scrape_jobs")
    .select()
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data as ScrapeJob[] | null) ?? [];
}

export async function getPlacesForJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<PlaceRow[]> {
  const { data, error } = await supabase
    .from("places")
    .select()
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as PlaceRow[] | null) ?? [];
}

export async function markJobRunning(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("scrape_jobs")
    .update({ status: "running", started_at: new Date().toISOString(), error: null })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function markJobCompleted(
  supabase: SupabaseClient,
  id: string,
  placesFound: number,
): Promise<void> {
  const { error } = await supabase
    .from("scrape_jobs")
    .update({
      status: "completed",
      places_found: placesFound,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function markJobFailed(
  supabase: SupabaseClient,
  id: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from("scrape_jobs")
    .update({
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function insertPlaces(
  supabase: SupabaseClient,
  jobId: string,
  places: ScrapedPlace[],
): Promise<number> {
  if (places.length === 0) return 0;

  const rows = places.map((place) => ({
    job_id: jobId,
    title: place.title,
    category: place.category,
    address: place.address,
    phone: place.phone,
    website: place.website,
    rating: place.rating,
    review_count: place.review_count,
    latitude: place.latitude,
    longitude: place.longitude,
    maps_url: place.maps_url,
    raw: place.raw,
  }));

  const { data, error } = await supabase
    .from("places")
    .upsert(rows, { onConflict: "job_id,maps_url" })
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
