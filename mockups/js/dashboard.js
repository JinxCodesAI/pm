import { getPortfolio, getProjects, getLoopsAcrossPortfolio, buildProjectLink } from "./data-service.js";
import { initGlobalNav } from "./navigation.js";
import { createElement, clearChildren, formatStatus, statusToClass } from "./utils.js";

const state = {
  projects: [],
  filter: "all"
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initGlobalNav();
    await loadPortfolio();
  } catch (error) {
    renderError(error);
  }
});

async function loadPortfolio() {
  const [portfolio, projects, loops] = await Promise.all([
    getPortfolio(),
    getProjects(),
    getLoopsAcrossPortfolio()
  ]);

  state.projects = projects;
  renderHero(portfolio, projects);
  renderProjectGrid();
  renderSignals(portfolio.signals);
  renderLoopWatchlist(loops);
  bindProjectFilters();
}

function renderHero(portfolio, projects) {
  const overview = document.getElementById("portfolio-overview");
  if (overview) {
    overview.textContent = `Tracking ${projects.length} active creative journeys with ${portfolio.metrics?.[0]?.value || "0"} artefacts live.`;
  }

  const metricsGrid = document.getElementById("portfolio-metrics");
  clearChildren(metricsGrid);
  (portfolio.metrics || []).forEach((metric) => {
    const card = createElement("div", { classes: "metric-card" });
    card.appendChild(createElement("span", { classes: "muted", text: metric.label }));
    card.appendChild(createElement("strong", { text: metric.value }));
    metricsGrid.appendChild(card);
  });
}

function bindProjectFilters() {
  const filters = document.querySelectorAll("#project-filters .filter-chip");
  filters.forEach((chip) => {
    chip.addEventListener("click", () => {
      filters.forEach((inner) => inner.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter || "all";
      renderProjectGrid();
    });
  });
}

function renderProjectGrid() {
  const grid = document.getElementById("project-grid");
  clearChildren(grid);

  const filtered = state.projects.filter((project) => {
    if (state.filter === "all") {
      return true;
    }
    return project.status === state.filter;
  });

  if (filtered.length === 0) {
    grid.appendChild(
      createElement("div", {
        classes: "card",
        html: "<strong>No projects match this filter.</strong><p class=\"muted\">Try a different filter to see active journeys.</p>"
      })
    );
    return;
  }

  filtered.forEach((project) => {
    grid.appendChild(buildProjectCard(project));
  });
}

function buildProjectCard(project) {
  const card = createElement("article", { classes: "project-card" });

  const header = createElement("header");
  const titleBlock = createElement("div");
  titleBlock.appendChild(createElement("h3", { text: project.name }));
  titleBlock.appendChild(createElement("span", { classes: "muted", text: project.client }));

  const statusPill = createElement("span", { classes: "pill" });
  const projectStatusClass = statusToClass(project.status) || "status-progress";
  statusPill.classList.add(projectStatusClass);
  statusPill.textContent = formatStatus(project.status);

  header.appendChild(titleBlock);
  header.appendChild(statusPill);

  const overview = createElement("p", { classes: "muted", text: project.overview });

  const meta = createElement("div", { classes: "project-meta" });
  meta.appendChild(createElement("span", { text: project.stage }));
  meta.appendChild(createElement("span", { text: project.nextMilestone }));

  const loopsRow = createElement("div", { classes: "project-loops" });
  (project.loops || []).slice(0, 3).forEach((loop) => {
    const loopChip = createElement("span", { classes: "loop-chip", text: loop.name });
    loopsRow.appendChild(loopChip);
  });

  const metricsInline = createElement("div", { classes: "summary-metrics" });
  (project.metrics || []).slice(0, 2).forEach((metric) => {
    const span = createElement("span");
    span.appendChild(createElement("span", { text: metric.label }));
    span.appendChild(createElement("strong", { text: metric.value }));
    metricsInline.appendChild(span);
  });

  const footer = createElement("div", { classes: "section-header" });
  footer.appendChild(metricsInline);
  const link = buildProjectLink(project);
  footer.appendChild(link);

  [header, overview, meta, loopsRow, footer].forEach((node) => card.appendChild(node));

  return card;
}

function renderSignals(signals = []) {
  const list = document.getElementById("portfolio-signals");
  clearChildren(list);

  if (!signals.length) {
    list.appendChild(createElement("li", { classes: "muted", text: "No portfolio signals right now." }));
    return;
  }

  signals.forEach((signal) => {
    list.appendChild(createElement("li", { text: signal }));
  });
}

function renderLoopWatchlist(loops = []) {
  const list = document.getElementById("loop-watchlist");
  clearChildren(list);

  if (!loops.length) {
    list.appendChild(
      createElement("div", {
        classes: "muted",
        text: "Iteration loops will appear here once projects are in motion."
      })
    );
    return;
  }

  loops.slice(0, 6).forEach((loop) => {
    const card = createElement("article", { classes: "loop-card" });
    card.appendChild(createElement("strong", { text: loop.name }));
    card.appendChild(
      createElement("span", {
        classes: "muted loop-meta",
        text: `${loop.projectName} • ${loop.lastUpdate || "Recently updated"}`
      })
    );
    card.appendChild(createElement("p", { text: loop.summary }));
    list.appendChild(card);
  });
}

function renderError(error) {
  const shell = document.querySelector(".dashboard-shell");
  if (!shell) {
    return;
  }
  shell.innerHTML = `
    <section class="card">
      <h2>Unable to load portfolio</h2>
      <p class="muted">${error.message}</p>
    </section>
  `;
}
