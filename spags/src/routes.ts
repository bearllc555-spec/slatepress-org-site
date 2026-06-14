import {
  createJob,
  createSupabase,
  getJob,
  getPlacesForJob,
  listJobs,
} from "./supabase";
import { runScrapeJob } from "./scrape/runner";
import type { CreateJobBody, Env } from "./types";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-api-key",
    },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function unauthorized(): Response {
  return error("Unauthorized", 401);
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.SCRAPE_API_KEY) return true;

  const headerKey = request.headers.get("x-api-key");
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  return headerKey === env.SCRAPE_API_KEY || bearer === env.SCRAPE_API_KEY;
}

function parseCreateJobBody(body: unknown): CreateJobBody {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;
  const query = typeof record.query === "string" ? record.query.trim() : "";

  if (!query) {
    throw new Error("Field `query` is required");
  }

  const lang = typeof record.lang === "string" && record.lang.trim() ? record.lang.trim() : "en";
  const depth =
    typeof record.depth === "number" && Number.isFinite(record.depth)
      ? Math.min(Math.max(Math.trunc(record.depth), 1), 10)
      : 1;

  return { query, lang, depth };
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization, x-api-key",
      },
    });
  }

  const url = new URL(request.url);

  if (url.pathname === "/" && request.method === "GET") {
    return json({
      name: env.APP_FULL_NAME,
      code: env.APP_NAME,
      version: env.APP_VERSION,
      endpoints: {
        create_job: "POST /api/jobs",
        list_jobs: "GET /api/jobs",
        get_job: "GET /api/jobs/:id",
      },
    });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.", 503);
  }

  if (url.pathname.startsWith("/api/") && !isAuthorized(request, env)) {
    return unauthorized();
  }

  if (url.pathname === "/api/jobs" && request.method === "GET") {
    const supabase = createSupabase(env);
    const jobs = await listJobs(supabase);
    return json({ jobs });
  }

  if (url.pathname === "/api/jobs" && request.method === "POST") {
    let body: CreateJobBody;
    try {
      body = parseCreateJobBody(await request.json());
    } catch (err) {
      return error(err instanceof Error ? err.message : "Invalid request body", 400);
    }

    const supabase = createSupabase(env);
    const job = await createJob(supabase, body.query, body.lang ?? "en", body.depth ?? 1);

    ctx.waitUntil(
      runScrapeJob(env, job.id).catch((err: unknown) => {
        console.error("scrape failed", job.id, err);
      }),
    );

    return json({ job }, 202);
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})$/i);
  if (jobMatch && request.method === "GET") {
    const jobId = jobMatch[1];
    const supabase = createSupabase(env);
    const job = await getJob(supabase, jobId);

    if (!job) {
      return error("Job not found", 404);
    }

    const places = await getPlacesForJob(supabase, jobId);
    return json({ job, places });
  }

  return error("Not found", 404);
}
