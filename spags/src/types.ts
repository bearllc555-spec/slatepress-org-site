export interface Env {
  BROWSER: Fetcher;
  APP_NAME: string;
  APP_FULL_NAME: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SCRAPE_API_KEY?: string;
}

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface ScrapeJob {
  id: string;
  query: string;
  lang: string;
  depth: number;
  status: JobStatus;
  places_found: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface PlaceRow {
  id: string;
  job_id: string;
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
  raw: Record<string, unknown> | null;
  created_at: string;
}

export interface ScrapedPlace {
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
}

export interface CreateJobBody {
  query: string;
  lang?: string;
  depth?: number;
}
