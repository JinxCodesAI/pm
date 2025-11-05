import { getPortfolio, getProjects, addProject } from "./data-service.js";
import { initGlobalNav } from "./navigation.js";
import { createElement, clearChildren, formatStatus, statusToClass } from "./utils.js";

const state = {
  projects: [],
  filter: "all",
  portfolio: null
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initGlobalNav();
    await loadPortfolio();
    bindProjectFilters();
    bindNewProjectForm();
  } catch (error) {
    renderError(error);
  }
});

async function loadPortfolio() {
  const [portfolio, projects] = await Promise.all([getPortfolio(), getProjects()]);
  state.portfolio = portfolio;
  state.projects = projects;
  renderHero(portfolio, projects);
  renderProjectGrid();
}

function renderHero(portfolio, projects) {
  const overview = document.getElementById("portfolio-overview");
  if (overview) {
    overview.textContent = portfolio.summary || `Tracking ${projects.length} active creative journeys.`;
  }

  const metricsGrid = document.getElementById("portfolio-metrics");
  clearChildren(metricsGrid);

  const metrics = portfolio.metrics?.length
    ? portfolio.metrics
    : [
        { label: "Projects", value: String(projects.length) },
        {
          label: "Modules In Progress",
          value: String(
            projects.reduce(
              (total, project) => total + (project.modules || []).filter((module) => module.status === "in-progress").length,
              0
            )
          )
        }
      ];

  metrics.forEach((metric) => {
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

function bindNewProjectForm() {
  const form = document.getElementById("new-project-form");
  const modal = document.getElementById("project-modal");
  const openButton = document.getElementById("open-project-modal");
  const closeButton = document.getElementById("close-project-modal");
  const cancelButton = document.getElementById("cancel-project");
  const backdrop = document.getElementById("project-modal-backdrop");

  if (!form || !modal) {
    return;
  }

  const hideModal = () => {
    modal.classList.add("hidden");
    form.reset();
    const note = form.querySelector(".form-message");
    if (note) {
      note.remove();
    }
  };

  const showModal = () => {
    modal.classList.remove("hidden");
    const firstField = form.querySelector("input, textarea, select");
    if (firstField) {
      firstField.focus();
    }
  };

  openButton?.addEventListener("click", showModal);
  closeButton?.addEventListener("click", hideModal);
  cancelButton?.addEventListener("click", hideModal);
  backdrop?.addEventListener("click", hideModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      hideModal();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const name = formData.get("name");
    const client = formData.get("client");
    const summary = formData.get("summary");

    try {
      const project = await addProject({ name, client, summary });
      state.projects.push(project);
      if (state.portfolio) {
        renderHero(state.portfolio, state.projects);
      }
      renderProjectGrid();
      form.reset();
      hideModal();
      showToast(`Project "${project.name}" created.`);
      await initGlobalNav();
    } catch (error) {
      showFormMessage(form, error.message, true);
    }
  });
}

function showFormMessage(form, message, isError) {
  let note = form.querySelector(".form-message");
  if (!note) {
    note = document.createElement("p");
    note.className = "form-message muted";
    form.appendChild(note);
  }
  note.textContent = message;
  note.classList.toggle("error", Boolean(isError));
}

function showToast(message) {
  let container = document.querySelector(".toast");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast";
    document.body.appendChild(container);
  }
  container.textContent = message;
  container.classList.add("visible");
  setTimeout(() => {
    container.classList.remove("visible");
  }, 2600);
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

  if (!filtered.length) {
    grid.appendChild(
      createElement("div", {
        classes: "card",
        html: `<strong>No projects match this filter.</strong><p class="muted">Try a different filter or start a new project.</p>`
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
  const statusClass = statusToClass(project.status) || "status-progress";
  statusPill.classList.add(statusClass);
  statusPill.textContent = formatStatus(project.status);

  header.appendChild(titleBlock);
  header.appendChild(statusPill);

  const summary = createElement("p", { classes: "muted", text: project.summary || "No overview provided yet." });

  const moduleList = createElement("div", { classes: "project-modules" });
  (project.modules || []).forEach((module) => {
    const chip = createElement("span", { classes: ["module-chip", statusToClass(module.status)], text: module.title });
    moduleList.appendChild(chip);
  });

  const actions = createElement("div", { classes: "project-actions" });
  const link = createElement("a", { classes: "ghost-button", text: "Open Workspace" });
  link.href = `project.html?projectId=${encodeURIComponent(project.id)}`;
  actions.appendChild(link);

  [header, summary, moduleList, actions].forEach((node) => card.appendChild(node));

  return card;
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
