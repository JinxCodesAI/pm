import { getProjects } from "./data-service.js";
import { formatStatus } from "./utils.js";

const THEME_STORAGE_KEY = "creative-copilot-theme";

export async function initGlobalNav(options = {}) {
  const nav = document.querySelector("[data-role='global-nav']");
  if (!nav) {
    return;
  }

  const projects = await getProjects();
  const activeProject = projects.find((project) => project.id === options.activeProjectId);

  nav.innerHTML = `
    <div class="nav-brand">
      <div class="brand-mark"><span></span></div>
      <div class="brand-text">
        <span class="brand-title">Creative Co-Pilot</span>
        <span class="brand-subtitle">Workflow Navigator</span>
      </div>
    </div>
    <div class="nav-actions">
      <div class="project-switcher" data-role="project-switcher">
        <button class="nav-button" data-action="toggle-project-menu" type="button">
          ${activeProject ? `<strong>${activeProject.menuLabel}</strong>` : "Select project"}
        </button>
        <div class="project-menu hidden" data-role="project-menu"></div>
      </div>
      <a class="ghost-button" href="index.html">Portfolio View</a>
      <button class="ghost-button" data-action="toggle-theme" type="button">Switch to Dark</button>
    </div>
  `;

  populateProjectMenu(nav, projects, activeProject);
  setupProjectMenu(nav);
  setupTheme(nav);
}

function populateProjectMenu(nav, projects, activeProject) {
  const menu = nav.querySelector("[data-role='project-menu']");
  if (!menu) {
    return;
  }

  menu.innerHTML = "";
  projects.forEach((project) => {
    const link = document.createElement("a");
    link.href = `project.html?projectId=${encodeURIComponent(project.id)}`;
    link.className = project.id === (activeProject && activeProject.id) ? "active" : "";
    link.innerHTML = `
      <strong>${project.menuLabel}</strong>
      <div class="muted" style="font-size:0.75rem; margin-top:0.25rem;">
        ${formatStatus(project.status)} • ${project.stage}
      </div>
    `;
    menu.appendChild(link);
  });
}

function setupProjectMenu(nav) {
  const switcher = nav.querySelector("[data-action='toggle-project-menu']");
  const menu = nav.querySelector("[data-role='project-menu']");
  if (!switcher || !menu) {
    return;
  }

  switcher.addEventListener("click", (event) => {
    event.stopPropagation();
    menu.classList.toggle("hidden");
  });

  document.addEventListener("click", () => {
    menu.classList.add("hidden");
  });

  menu.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

function setupTheme(nav) {
  const button = nav.querySelector("[data-action='toggle-theme']");
  if (!button) {
    return;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "dark") {
    document.body.classList.add("dark");
  }

  updateThemeLabel(button);

  button.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
    updateThemeLabel(button);
  });
}

function updateThemeLabel(button) {
  const isDark = document.body.classList.contains("dark");
  button.textContent = isDark ? "Switch to Light" : "Switch to Dark";
}
