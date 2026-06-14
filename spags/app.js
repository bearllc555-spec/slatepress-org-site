const { supabaseUrl, supabaseAnonKey } = window.SPAGS_CONFIG;

const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

const state = {
  jobs: [],
  places: [],
  selectedJobId: null,
  search: "",
};

const els = {
  stats: {
    jobs: document.querySelector('[data-stat="jobs"]'),
    completed: document.querySelector('[data-stat="completed"]'),
    places: document.querySelector('[data-stat="places"]'),
    latest: document.querySelector('[data-stat="latest"]'),
  },
  jobsBody: document.getElementById("jobs-body"),
  placesGrid: document.getElementById("places-grid"),
  placesFilterLabel: document.getElementById("places-filter-label"),
  placesSearch: document.getElementById("places-search"),
  clearFilterBtn: document.getElementById("clear-filter-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
};

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status) {
  return `status status-${status}`;
}

function renderStats() {
  const completed = state.jobs.filter((job) => job.status === "completed").length;
  const latest = state.jobs[0];

  els.stats.jobs.textContent = String(state.jobs.length);
  els.stats.completed.textContent = String(completed);
  els.stats.places.textContent = String(state.places.length);
  els.stats.latest.textContent = latest
    ? `${latest.query} · ${formatDate(latest.created_at)}`
    : "No scrapes yet";
}

function renderJobs() {
  if (state.jobs.length === 0) {
    els.jobsBody.innerHTML = `<tr><td colspan="5" class="empty">No jobs yet. Run a scrape via the SPAGS API.</td></tr>`;
    return;
  }

  els.jobsBody.innerHTML = state.jobs
    .map(
      (job) => `
      <tr data-job-id="${job.id}" class="${state.selectedJobId === job.id ? "active" : ""}">
        <td class="query-cell">${escapeHtml(job.query)}</td>
        <td><span class="${statusClass(job.status)}">${escapeHtml(job.status)}</span></td>
        <td>${job.places_found ?? 0}</td>
        <td>${job.depth}</td>
        <td>${formatDate(job.created_at)}</td>
      </tr>`,
    )
    .join("");

  els.jobsBody.querySelectorAll("tr[data-job-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const jobId = row.dataset.jobId;
      state.selectedJobId = state.selectedJobId === jobId ? null : jobId;
      updateFilterUi();
      renderJobs();
      renderPlaces();
    });
  });
}

function filteredPlaces() {
  let places = state.places;

  if (state.selectedJobId) {
    places = places.filter((place) => place.job_id === state.selectedJobId);
  }

  const q = state.search.trim().toLowerCase();
  if (!q) return places;

  return places.filter((place) => {
    const haystack = [
      place.title,
      place.category,
      place.address,
      place.phone,
      place.email,
      place.website,
      place.maps_url,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function contactRow(label, value, href = null) {
  if (!value) {
    return `<div class="contact-row contact-row-empty"><span class="contact-label">${label}</span><span class="contact-value muted">Not found</span></div>`;
  }

  const content = href
    ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`
    : escapeHtml(value);

  return `<div class="contact-row"><span class="contact-label">${label}</span><span class="contact-value">${content}</span></div>`;
}

function renderPlaces() {
  const places = filteredPlaces();

  if (places.length === 0) {
    els.placesGrid.innerHTML = `<div class="empty-state">No places match this view.</div>`;
    return;
  }

  els.placesGrid.innerHTML = places
    .map((place) => {
      const rating =
        place.rating != null
          ? `<span class="chip">★ ${Number(place.rating).toFixed(1)}</span>`
          : "";
      const reviews =
        place.review_count != null
          ? `<span class="chip">${place.review_count} reviews</span>`
          : "";
      const category = place.category
        ? `<span class="chip">${escapeHtml(place.category)}</span>`
        : "";

      const websiteDisplay = place.website
        ? place.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
        : null;

      return `
        <article class="place-card">
          <h3>${escapeHtml(place.title || "Untitled place")}</h3>
          <div class="place-meta">${rating}${reviews}${category}</div>
          <div class="contact-list">
            ${contactRow("Address", place.address)}
            ${contactRow("Phone", place.phone, place.phone ? `tel:${place.phone.replace(/\s+/g, "")}` : null)}
            ${contactRow("Email", place.email, place.email ? `mailto:${place.email}` : null)}
            ${contactRow("Website", websiteDisplay, place.website)}
          </div>
          <a class="place-link" href="${escapeAttr(place.maps_url)}" target="_blank" rel="noopener noreferrer">Open in Google Maps →</a>
        </article>`;
    })
    .join("");
}

function updateFilterUi() {
  if (state.selectedJobId) {
    const job = state.jobs.find((item) => item.id === state.selectedJobId);
    els.placesFilterLabel.textContent = job
      ? `Filtered to “${job.query}”`
      : "Filtered by job";
    els.clearFilterBtn.hidden = false;
  } else {
    els.placesFilterLabel.textContent = "All collected listings";
    els.clearFilterBtn.hidden = true;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

async function loadData() {
  els.refreshBtn.disabled = true;

  const [{ data: jobs, error: jobsError }, { data: places, error: placesError }] =
    await Promise.all([
      supabase.from("scrape_jobs").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("places").select("*").order("created_at", { ascending: false }).limit(500),
    ]);

  if (jobsError) throw jobsError;
  if (placesError) throw placesError;

  state.jobs = jobs ?? [];
  state.places = places ?? [];

  renderStats();
  renderJobs();
  renderPlaces();
  els.refreshBtn.disabled = false;
}

els.refreshBtn.addEventListener("click", () => {
  loadData().catch(showError);
});

els.placesSearch.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderPlaces();
});

els.clearFilterBtn.addEventListener("click", () => {
  state.selectedJobId = null;
  updateFilterUi();
  renderJobs();
  renderPlaces();
});

function showError(error) {
  console.error(error);
  els.placesGrid.innerHTML = `<div class="empty-state">Could not load data. Check Supabase connection.</div>`;
  els.refreshBtn.disabled = false;
}

updateFilterUi();
loadData().catch(showError);
