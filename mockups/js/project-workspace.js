import { getProjectById, getProjects } from "./data-service.js";
import { initGlobalNav } from "./navigation.js";
import { createElement, clearChildren, formatStatus, parseQuery, applyPill, statusToClass, toggleHidden } from "./utils.js";

const state = {
  project: null,
  selectedModuleId: null,
  selectedPhaseId: null,
  selectedPanel: "flow",
  selectedLoopId: null,
  feedbackCursor: 0
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadWorkspace();
  } catch (error) {
    renderError(error);
  }
});

async function loadWorkspace() {
  const query = parseQuery();
  let projectId = query.get("projectId");

  const allProjects = await getProjects();
  if (!projectId && allProjects.length) {
    projectId = allProjects[0].id;
    if (history.replaceState) {
      history.replaceState(null, "", `?projectId=${encodeURIComponent(projectId)}`);
    }
  }

  if (!projectId) {
    throw new Error("No project available to display.");
  }

  const project = await getProjectById(projectId);
  state.project = cloneProject(project);
  await initGlobalNav({ activeProjectId: project.id });

  renderProjectSummary();
  renderProjectStatus();
  renderProjectFeedback();
  renderLoopSummary();
  bindTabs();
  bindSimulation();

  const defaultModule = state.project.modules?.[0];
  if (defaultModule) {
    selectModule(defaultModule.id);
  }
}

function cloneProject(project) {
  if (typeof structuredClone === "function") {
    return structuredClone(project);
  }
  return JSON.parse(JSON.stringify(project));
}

function selectModule(moduleId) {
  state.selectedModuleId = moduleId;
  const module = currentModule();
  if (!module) {
    return;
  }

  state.selectedPhaseId = module.phases?.[0]?.id || null;
  renderModuleMenu();
  renderModuleHero();
  renderPhases();
  renderVersions();
  renderModuleFeedback();
  renderAiThread();
  highlightLoopTouchpoints();
}

function selectPhase(phaseId) {
  state.selectedPhaseId = phaseId;
  renderPhases();
}

function selectPanel(panelId) {
  state.selectedPanel = panelId;
  const panels = document.querySelectorAll(".module-panel");
  panels.forEach((panel) => {
    const matches = panel.dataset.panel === panelId;
    toggleHidden(panel, !matches);
  });

  document.querySelectorAll(".panel-tabs .tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.panel === panelId);
  });

  if (panelId === "feedback") {
    renderModuleFeedback();
    renderAiThread();
  }
}

function renderProjectSummary() {
  const { project } = state;
  const summary = document.getElementById("project-summary");
  if (!summary || !project) {
    return;
  }

  applyPill(document.getElementById("project-status-pill"), project.status);
  setText("project-code", project.projectCode);
  setText("project-name", project.name);
  setText("project-overview", project.overview);
  setText("project-next", project.nextMilestone);

  const metrics = document.getElementById("project-metrics");
  clearChildren(metrics);
  (project.metrics || []).forEach((metric) => {
    const row = createElement("span");
    row.appendChild(createElement("span", { text: metric.label }));
    row.appendChild(createElement("strong", { text: metric.value }));
    metrics.appendChild(row);
  });
}

function renderProjectStatus() {
  const container = document.getElementById("project-status");
  if (!container || !state.project) {
    return;
  }
  clearChildren(container);

  container.appendChild(
    createElement("div", {
      html: `<strong>Current Stage</strong><p class="muted">${state.project.stage}</p>`
    })
  );

  if (state.project.aiHighlights?.length) {
    const highlights = createElement("div");
    highlights.appendChild(createElement("strong", { text: "AI Highlights" }));
    const list = createElement("ul", { classes: "detail-block" });
    list.style.listStyle = "disc";
    list.style.paddingLeft = "1.2rem";
    state.project.aiHighlights.forEach((item) => {
      list.appendChild(createElement("li", { text: item }));
    });
    highlights.appendChild(list);
    container.appendChild(highlights);
  }
}

function renderProjectFeedback() {
  const container = document.getElementById("project-feedback");
  if (!container || !state.project) {
    return;
  }
  clearChildren(container);

  const stream = state.project.feedbackStream || [];
  if (!stream.length) {
    container.appendChild(createElement("p", { classes: "muted", text: "No feedback threads yet." }));
    return;
  }

  stream.forEach((entry) => {
    const article = createElement("article", { classes: "feedback-entry" });
    article.appendChild(createElement("strong", { text: entry.source }));
    article.appendChild(createElement("p", { text: entry.summary }));
    article.appendChild(
      createElement("div", {
        classes: "meta",
        text: `${entry.timestamp || "Just now"} • ${formatStatus(entry.status)}`
      })
    );
    if (entry.touchpoints?.length) {
      article.appendChild(
        createElement("div", {
          classes: "muted",
          text: `Touchpoints: ${entry.touchpoints.map((id) => resolveModuleLabel(id)).join(", ")}`
        })
      );
    }
    container.appendChild(article);
  });
}

function renderLoopSummary() {
  const container = document.getElementById("loop-summary");
  if (!container || !state.project) {
    return;
  }
  clearChildren(container);

  const loops = state.project.loops || [];
  if (!loops.length) {
    container.appendChild(createElement("div", { classes: "muted", text: "No active loops right now." }));
    return;
  }

  loops.forEach((loop) => {
    const card = createElement("button", {
      classes: ["loop-card", state.selectedLoopId === loop.id ? "active" : ""],
      attrs: { type: "button", "data-loop-id": loop.id }
    });
    card.appendChild(createElement("strong", { text: loop.name }));
    card.appendChild(
      createElement("span", { classes: "muted loop-meta", text: `${formatStatus(loop.status)} • ${loop.lastUpdate}` })
    );
    card.appendChild(createElement("p", { text: loop.summary }));
    card.addEventListener("click", () => selectLoop(loop.id));
    container.appendChild(card);
  });

  renderLoopSpotlight();
}

function selectLoop(loopId) {
  state.selectedLoopId = loopId;
  renderLoopSummary();
  highlightLoopTouchpoints();
}

function renderLoopSpotlight() {
  const container = document.getElementById("loop-spotlight");
  if (!container || !state.project) {
    return;
  }

  const loop = state.project.loops?.find((item) => item.id === state.selectedLoopId);
  if (!loop) {
    container.textContent = "Select a loop to explore the ripple.";
    container.classList.add("muted");
    return;
  }

  container.classList.remove("muted");
  container.innerHTML = `
    <strong>${loop.name}</strong>
    <p>${loop.summary}</p>
    <div class="muted" style="font-size:0.8rem;">Touchpoints: ${loop.touchpoints
      .map((id) => resolveModuleLabel(id))
      .join(", ")}</div>
    <ul style="margin:0.75rem 0 0; padding-left:1.2rem;">
      ${loop.actions.map((action) => `<li>${action}</li>`).join("")}
    </ul>
  `;
}

function renderModuleMenu() {
  const container = document.getElementById("module-list");
  if (!container || !state.project) {
    return;
  }
  clearChildren(container);

  (state.project.modules || []).forEach((module) => {
    const item = createElement("button", {
      classes: [
        "module-item",
        module.id === state.selectedModuleId ? "active" : "",
        module.status === "attention" ? "attention" : "",
        module._justAlerted ? "attention-glow" : ""
      ],
      attrs: { type: "button", "data-module-id": module.id }
    });

    const header = createElement("header");
    header.appendChild(createElement("strong", { text: module.uiLabel }));
    const pill = createElement("span", { classes: ["pill", statusToClass(module.status)] });
    pill.textContent = formatStatus(module.status);
    header.appendChild(pill);

    item.appendChild(header);
    item.appendChild(createElement("p", { classes: "muted", text: module.headline }));
    item.appendChild(createElement("span", { classes: "module-status", text: module.systemLabel }));

    item.addEventListener("click", () => selectModule(module.id));
    container.appendChild(item);
    module._justAlerted = false;
  });
}

function renderModuleHero() {
  const module = currentModule();
  if (!module) {
    return;
  }

  setText("module-system-label", module.systemLabel);
  setText("module-label", module.uiLabel);
  setText("module-summary", module.summary);
  setText("module-headline", module.headline);
  applyPill(document.getElementById("module-status-pill"), module.status);

  const teamContainer = document.getElementById("module-teams");
  clearChildren(teamContainer);
  (module.teams || []).forEach((team) => {
    teamContainer.appendChild(createElement("span", { classes: "team-pill", text: team }));
  });

  const loopContainer = document.getElementById("module-loops");
  clearChildren(loopContainer);
  const loopRefs = (state.project.loops || []).filter((loop) => loop.touchpoints?.includes(module.id));
  loopRefs.forEach((loop) => {
    loopContainer.appendChild(createElement("span", { classes: "loop-chip", text: loop.name }));
  });
}

function renderPhases() {
  const module = currentModule();
  const list = document.getElementById("phase-list");
  const detail = document.getElementById("phase-detail");
  if (!module || !list || !detail) {
    return;
  }

  clearChildren(list);
  (module.phases || []).forEach((phase) => {
    const card = createElement("button", {
      classes: ["phase-card", phase.id === state.selectedPhaseId ? "active" : ""],
      attrs: { type: "button", "data-phase-id": phase.id }
    });
    const meta = createElement("div", { classes: "phase-meta" });
    meta.appendChild(createElement("span", { text: phase.timestamp }));
    const pill = createElement("span", { classes: ["pill", statusToClass(phase.status)] });
    pill.textContent = formatStatus(phase.status);
    meta.appendChild(pill);
    card.appendChild(meta);
    card.appendChild(createElement("strong", { text: phase.title }));
    card.appendChild(createElement("p", { classes: "muted", text: phase.preview }));
    card.addEventListener("click", () => selectPhase(phase.id));
    list.appendChild(card);
  });

  const phase = module.phases?.find((item) => item.id === state.selectedPhaseId);
  if (!phase) {
    detail.innerHTML = `<p class="muted">Select a phase to see the collaborative loop.</p>`;
    return;
  }

  detail.innerHTML = "";
  detail.appendChild(
    createElement("div", {
      html: `<strong>${phase.title}</strong><p class="muted">${phase.description}</p>`
    })
  );

  const tagList = createElement("div", { classes: "tag-list" });
  (phase.loopRefs || []).forEach((loopId) => {
    tagList.appendChild(createElement("span", { classes: "tag", text: resolveLoopName(loopId) }));
  });
  detail.appendChild(tagList);

  const grid = createElement("div", { classes: "detail-grid" });
  grid.appendChild(renderListBlock("AI Moves", phase.ai));
  grid.appendChild(renderListBlock("Human Moves", phase.human));
  grid.appendChild(renderListBlock("Feedback Loop", phase.feedback));
  grid.appendChild(renderListBlock("Next Actions", phase.next));
  detail.appendChild(grid);

  if (phase.flags?.length) {
    const alert = createElement("div", { classes: "detail-block" });
    alert.appendChild(createElement("h4", { text: "Flags" }));
    const list = createElement("ul");
    phase.flags.forEach((flag) => list.appendChild(createElement("li", { text: flag })));
    alert.appendChild(list);
    alert.classList.add("status-attention-text");
    detail.appendChild(alert);
  }
}

function renderListBlock(title, items = []) {
  const block = createElement("div", { classes: "detail-block" });
  block.appendChild(createElement("h4", { text: title }));
  if (!items.length) {
    block.appendChild(createElement("p", { classes: "muted", text: "—" }));
    return block;
  }
  const list = createElement("ul");
  items.forEach((item) => list.appendChild(createElement("li", { text: item })));
  block.appendChild(list);
  return block;
}

function renderVersions() {
  const module = currentModule();
  const timeline = document.getElementById("version-timeline");
  const detail = document.getElementById("version-detail");
  if (!timeline || !detail || !module) {
    return;
  }
  clearChildren(timeline);
  clearChildren(detail);

  const versions = module.versions || [];
  if (!versions.length) {
    detail.innerHTML = `<p class="muted">No saved versions yet.</p>`;
    return;
  }

  const currentVersionId = detail.dataset.versionId || versions[0].id;
  versions.forEach((version) => {
    const pill = createElement("button", {
      classes: ["version-pill", version.id === currentVersionId ? "active" : ""],
      attrs: { type: "button", "data-version-id": version.id }
    });
    pill.appendChild(createElement("strong", { text: version.label }));
    pill.appendChild(createElement("span", { classes: "muted", text: version.date }));
    pill.addEventListener("click", () => {
      detail.dataset.versionId = version.id;
      renderVersions();
    });
    timeline.appendChild(pill);
  });

  const selected = versions.find((version) => version.id === (detail.dataset.versionId || versions[0].id)) || versions[0];
  detail.dataset.versionId = selected.id;
  detail.appendChild(createElement("strong", { text: selected.label }));
  detail.appendChild(createElement("span", { classes: "muted", text: selected.date }));
  detail.appendChild(createElement("div", { html: "<strong>Notes</strong>" }));
  detail.appendChild(renderListElement(selected.notes));
  if (selected.impacts?.length) {
    detail.appendChild(createElement("div", { html: "<strong>Ripple Impacts</strong>" }));
    detail.appendChild(renderListElement(selected.impacts));
  }
}

function renderListElement(items = []) {
  const list = createElement("ul");
  items.forEach((item) => list.appendChild(createElement("li", { text: item })));
  return list;
}

function renderModuleFeedback() {
  const module = currentModule();
  const container = document.getElementById("module-feedback");
  if (!container) {
    return;
  }
  clearChildren(container);
  container.appendChild(createElement("h3", { text: "Feedback Feed" }));

  if (!module?.feedbackFeed?.length) {
    container.appendChild(createElement("p", { classes: "muted", text: "No feedback recorded yet." }));
    return;
  }

  module.feedbackFeed.forEach((entry) => {
    const article = createElement("article", { classes: "feedback-entry" });
    article.appendChild(createElement("strong", { text: entry.source }));
    article.appendChild(createElement("p", { text: entry.note }));
    article.appendChild(createElement("div", { classes: "meta", text: entry.timestamp }));
    if (entry.touchpoints?.length) {
      article.appendChild(
        createElement("div", {
          classes: "muted",
          text: `Impacts: ${entry.touchpoints.map((id) => resolveModuleLabel(id)).join(", ")}`
        })
      );
    }
    container.appendChild(article);
  });
}

function renderAiThread() {
  const module = currentModule();
  const container = document.getElementById("module-ai-log");
  if (!container) {
    return;
  }
  clearChildren(container);
  container.appendChild(createElement("h3", { text: "AI Collaboration Log" }));

  if (!module?.aiThread?.length) {
    container.appendChild(createElement("p", { classes: "muted", text: "No AI dialogue for this module yet." }));
    return;
  }

  const thread = createElement("div", { classes: "ai-thread" });
  const template = document.getElementById("ai-message-template");
  module.aiThread.forEach((message) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.role = message.role;
    node.querySelector(".role").textContent = roleLabel(message.role);
    node.querySelector(".time").textContent = message.timestamp || "";
    node.querySelector(".body").textContent = message.content;
    thread.appendChild(node);
  });
  container.appendChild(thread);
}

function roleLabel(role) {
  switch (role) {
    case "assistant":
      return "Creative Co-Pilot";
    case "user":
      return "You";
    case "client":
      return "Client";
    default:
      return role;
  }
}

function bindTabs() {
  document.querySelectorAll(".panel-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => selectPanel(tab.dataset.panel));
  });
}

function bindSimulation() {
  const button = document.getElementById("simulate-feedback");
  if (!button) {
    return;
  }
  button.addEventListener("click", () => {
    const future = state.project.futureFeedback || [];
    if (!future.length) {
      button.disabled = true;
      button.textContent = "All predicted feedback processed";
      return;
    }

    const event = future.shift();
    if (!event) {
      return;
    }

    const stream = state.project.feedbackStream || [];
    stream.unshift({
      ...event,
      timestamp: "Just now",
      status: "open"
    });
    state.project.feedbackStream = stream;

    (event.touchpoints || []).forEach((moduleId) => {
      const module = findModule(moduleId);
      if (module) {
        module.status = "attention";
        module._justAlerted = true;
      }
    });

    renderProjectFeedback();
    renderModuleMenu();
    renderLoopSummary();
    highlightLoopTouchpoints();

    if (event.touchpoints?.includes(state.selectedModuleId)) {
      renderModuleHero();
      renderPhases();
      if (state.selectedPanel === "feedback") {
        renderModuleFeedback();
        renderAiThread();
      }
    }

    if (future.length === 0) {
      button.textContent = "All predicted feedback processed";
      button.disabled = true;
    }
  });
}

function highlightLoopTouchpoints() {
  const loop = state.project.loops?.find((item) => item.id === state.selectedLoopId);
  const moduleNodes = document.querySelectorAll(".module-item");
  moduleNodes.forEach((node) => {
    const moduleId = node.dataset.moduleId;
    const touched = loop && loop.touchpoints?.includes(moduleId);
    if (touched && moduleId !== state.selectedModuleId) {
      node.classList.add("related");
    } else {
      node.classList.remove("related");
    }
  });
}

function currentModule() {
  return state.project?.modules?.find((module) => module.id === state.selectedModuleId) || null;
}

function findModule(id) {
  return state.project?.modules?.find((module) => module.id === id);
}

function resolveModuleLabel(id) {
  return state.project?.modules?.find((module) => module.id === id)?.uiLabel || id;
}

function resolveLoopName(loopId) {
  return state.project?.loops?.find((loop) => loop.id === loopId)?.name || loopId;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value ?? "—";
  }
}

function renderError(error) {
  const shell = document.querySelector(".workspace-shell");
  if (!shell) {
    return;
  }
  shell.innerHTML = `
    <section class="card" style="grid-column: 1 / -1;">
      <h2>Unable to load project</h2>
      <p class="muted">${error.message}</p>
    </section>
  `;
}
