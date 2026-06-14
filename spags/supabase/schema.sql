-- SPAGS — Slate Press A Google Scrape
-- Run in Supabase SQL Editor (project: "Slate Press A Google Scrape")

create extension if not exists "pgcrypto";

create table if not exists scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  lang text not null default 'en',
  depth int not null default 1 check (depth between 1 and 10),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  places_found int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references scrape_jobs(id) on delete cascade,
  title text,
  category text,
  address text,
  phone text,
  website text,
  email text,
  rating numeric(3, 2),
  review_count int,
  latitude double precision,
  longitude double precision,
  maps_url text not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, maps_url)
);

create index if not exists scrape_jobs_status_idx on scrape_jobs(status);
create index if not exists scrape_jobs_created_at_idx on scrape_jobs(created_at desc);
create index if not exists places_job_id_idx on places(job_id);

alter table scrape_jobs enable row level security;
alter table places enable row level security;

-- Worker uses service_role key (bypasses RLS). No public policies by default.
