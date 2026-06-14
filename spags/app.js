const { supabaseUrl, supabaseAnonKey, workerApiUrl } = window.SPAGS_CONFIG;
const appVersion = window.SPAGS_VERSION ?? "v1.0";
const STALE_JOB_MS = 20 * 60 * 1000;

document.getElementById("app-version").textContent = appVersion;

const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

const state = {
  jobs: [],
  places: [],
  selectedJobId: null,
  search: "",
  healthByJob: {},
  pollTimer: null,
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
  quarryForm: document.getElementById("quarry-form"),
  quarryQuery: document.getElementById("quarry-query"),
  quarryDepth: document.getElementById("quarry-depth"),
  quarryLang: document.getElementById("quarry-lang"),
  quarrySubmit: document.getElementById("quarry-submit"),
  quarryFeedback: document.getElementById("quarry-feedback"),
  healthBanner: document.getElementById("health-banner"),
};

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function runningForMs(job) {
  const started = job.started_at ?? job.created_at;
  return Date.now() - new Date(started).getTime();
}

function isJobStale(job) {
  return job.status === "running" && runningForMs(job) > STALE_JOB_MS;
}

function displayStatus(job) {
  if (job.status === "running" && isJobStale(job)) {
    return { label: "stale", className: "status status-stale" };
  }
  return { label: job.status, className: `status status-${job.status}` };
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
    els.jobsBody.innerHTML = `<tr><td colspan="6" class="empty">No quarries yet. Submit one above.</td></tr>`;
    return;
  }

  els.jobsBody.innerHTML = state.jobs
    .map((job) => {
      const status = displayStatus(job);
      return `
      <tr data-job-id="${job.id}" class="${state.selectedJobId === job.id ? "active" : ""}">
        <td class="query-cell">${escapeHtml(job.query)}</td>
        <td><span class="${status.className}">${escapeHtml(status.label)}</span></td>
        <td>${job.places_found ?? 0}</td>
        <td>${job.depth}</td>
        <td>${formatDate(job.created_at)}</td>
        <td class="actions-cell">
          <button class="btn btn-ghost btn-small check-job-btn" type="button" data-job-id="${job.id}">Check</button>
        </td>
      </tr>`;
    })
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

  els.jobsBody.querySelectorAll(".check-job-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      checkQuarry(button.dataset.jobId, true, false).catch(showError);
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
      : "Filtered by quarry";
    els.clearFilterBtn.hidden = false;
  } else {
    els.placesFilterLabel.textContent = "All collected listings";
    els.clearFilterBtn.hidden = true;
  }
}

function showHealthBanner(message, tone = "info") {
  els.healthBanner.hidden = false;
  els.healthBanner.className = `health-banner health-banner-${tone}`;
  els.healthBanner.textContent = message;
}

function hideHealthBanner() {
  els.healthBanner.hidden = true;
}

function showQuarryFeedback(message, tone = "info") {
  els.quarryFeedback.hidden = false;
  els.quarryFeedback.className = `form-feedback form-feedback-${tone}`;
  els.quarryFeedback.textContent = message;
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

async function checkQuarry(jobId, reconcile = true, silent = false) {
  const response = await fetch(`${workerApiUrl}/api/jobs/${jobId}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reconcile }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not check quarry status");
  }

  state.healthByJob[jobId] = payload.health;

  if (!silent || payload.health.reconciled || payload.health.is_stale) {
    showHealthBanner(
      payload.health.message,
      payload.health.is_stale || payload.health.reconciled ? "warn" : "info",
    );
  }

  await loadData({ skipPollRestart: true });
  return payload;
}

async function submitQuarry(event) {
  event.preventDefault();

  const query = els.quarryQuery.value.trim();
  const depth = Number(els.quarryDepth.value) || 1;
  const lang = els.quarryLang.value.trim() || "en";

  if (!query) return;

  els.quarrySubmit.disabled = true;
  showQuarryFeedback("Starting quarry…", "info");

  try {
    const response = await fetch(`${workerApiUrl}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, depth, lang }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Could not start quarry");
    }

    state.selectedJobId = payload.job.id;
    showQuarryFeedback(`Quarry started. Tracking “${query}”.`, "success");
    hideHealthBanner();
    await loadData();
    startPolling();
  } catch (error) {
    showQuarryFeedback(error.message, "error");
  } finally {
    els.quarrySubmit.disabled = false;
  }
}

async function reconcileRunningQuarries() {
  const running = state.jobs.filter((job) => job.status === "running" && isJobStale(job));
  for (const job of running) {
    await checkQuarry(job.id, true, true);
  }
}

function startPolling() {
  clearInterval(state.pollTimer);

  const hasActive = state.jobs.some(
    (job) => job.status === "running" || job.status === "pending",
  );
  if (!hasActive) return;

  state.pollTimer = setInterval(async () => {
    await loadData({ skipPollRestart: true });
    const stillActive = state.jobs.some(
      (job) => job.status === "running" || job.status === "pending",
    );
    if (!stillActive) {
      clearInterval(state.pollTimer);
      return;
    }
    await reconcileRunningQuarries();
  }, 12000);
}

async function loadData(options = {}) {
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
  if (!options.skipPollRestart) {
    startPolling();
  }
}

els.refreshBtn.addEventListener("click", () => {
  loadData().catch(showError);
});

els.quarryForm.addEventListener("submit", (event) => {
  submitQuarry(event).catch(showError);
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
  showHealthBanner(error.message ?? "Something went wrong.", "error");
  els.refreshBtn.disabled = false;
  els.quarrySubmit.disabled = false;
}

updateFilterUi();
loadData().catch(showError);
