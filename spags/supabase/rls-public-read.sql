-- Public read access for SPAGS dashboard (password protection planned later)
drop policy if exists "spags_public_read_jobs" on scrape_jobs;
drop policy if exists "spags_public_read_places" on places;

create policy "spags_public_read_jobs"
  on scrape_jobs for select
  using (true);

create policy "spags_public_read_places"
  on places for select
  using (true);
