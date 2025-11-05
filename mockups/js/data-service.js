const CUSTOM_PROJECTS_KEY = "creative-copilot.custom-projects";
const STEP_OVERRIDES_KEY = "creative-copilot.step-overrides";
const STEP_DETAIL_OVERRIDES_KEY = "creative-copilot.step-details";
const PROJECT_NOTES_KEY = "creative-copilot.project-notes";

let cachePromise = null;

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function loadJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Unable to parse localStorage key "${key}"`, error);
    return fallback;
  }
}

function saveJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .substring(0, 60) || `project-${Date.now()}`;
}

export async function loadData() {
  if (!cachePromise) {
    cachePromise = fetch("data/projects.json").then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load data (${response.status})`);
      }
      return response.json();
    });
  }
  return cachePromise;
}

export async function getPortfolio() {
  const data = await loadData();
  return clone(data.portfolio);
}

export async function getTemplates() {
  const data = await loadData();
  return clone(data.templates);
}

export async function getProjects() {
  const data = await loadData();
  const baseProjects = clone(data.projects || []);
  const customProjects = loadJson(CUSTOM_PROJECTS_KEY, []);
  const projects = [...baseProjects, ...customProjects];
  applyOverrides(projects);
  return projects;
}

export async function getProjectById(projectId) {
  const projects = await getProjects();
  const project = projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project '${projectId}' not found.`);
  }
  return project;
}

export async function addProject({ name, client, summary }) {
  const templates = await getTemplates();
  const modulesTemplate = templates.modules || [];
  let id = slugify(name);
  const existing = await getProjects();
  if (existing.some((project) => project.id === id)) {
    id = `${id}-${Date.now()}`;
  }

  const modules = modulesTemplate.map((module) => ({
    ...clone(module),
    status: "not-started",
    artifact: module.artifact
      ? { ...clone(module.artifact), status: "not-started" }
      : null,
    steps: (module.steps || []).map((step) => ({
      ...clone(step),
      status: "not-started",
      notes: "",
      next: ""
    }))
  }));

  const newProject = {
    id,
    name,
    client,
    status: "planning",
    summary: summary || "",
    modules,
    notes: []
  };

  const customProjects = loadJson(CUSTOM_PROJECTS_KEY, []);
  customProjects.push(newProject);
  saveJson(CUSTOM_PROJECTS_KEY, customProjects);

  return clone(newProject);
}

export function saveStepDetail(projectId, moduleId, stepId, updates) {
  const overrides = loadJson(STEP_DETAIL_OVERRIDES_KEY, {});
  if (!overrides[projectId]) {
    overrides[projectId] = {};
  }
  if (!overrides[projectId][moduleId]) {
    overrides[projectId][moduleId] = {};
  }
  overrides[projectId][moduleId][stepId] = {
    ...(overrides[projectId][moduleId][stepId] || {}),
    ...clone(updates)
  };
  saveJson(STEP_DETAIL_OVERRIDES_KEY, overrides);
}

export function addProjectNote(projectId, text) {
  if (!text || !text.trim()) {
    return null;
  }

  const notes = loadJson(PROJECT_NOTES_KEY, {});
  if (!notes[projectId]) {
    notes[projectId] = [];
  }
  const entry = {
    id: `note-${Date.now()}`,
    text: text.trim(),
    timestamp: new Date().toLocaleString()
  };
  notes[projectId].unshift(entry);
  saveJson(PROJECT_NOTES_KEY, notes);
  return entry;
}

function applyOverrides(projects) {
  const stepOverrides = loadJson(STEP_OVERRIDES_KEY, {});
  const detailOverrides = loadJson(STEP_DETAIL_OVERRIDES_KEY, {});
  const noteOverrides = loadJson(PROJECT_NOTES_KEY, {});

  projects.forEach((project) => {
    const moduleOverrides = stepOverrides[project.id] || {};
    const customNotes = noteOverrides[project.id] || [];

    project.modules?.forEach((module) => {
      const stepOverrideForModule = moduleOverrides[module.id] || {};
      const detailOverrideForModule = (detailOverrides[project.id] || {})[module.id] || {};
      module.steps?.forEach((step) => {
        const override = stepOverrideForModule[step.id];
        if (override) {
          Object.assign(step, override);
        }
      });

      if (module.details && Object.keys(detailOverrideForModule).length) {
        Object.entries(detailOverrideForModule).forEach(([stepId, override]) => {
          module.details[stepId] = {
            ...(module.details[stepId] || {}),
            ...clone(override)
          };
        });
      } else if (!module.details && Object.keys(detailOverrideForModule).length) {
        module.details = clone(detailOverrideForModule);
      }

      if (stepOverrideForModule.__module) {
        Object.assign(module, stepOverrideForModule.__module);
      }

      if (module.artifact && stepOverrideForModule.__artifact) {
        Object.assign(module.artifact, stepOverrideForModule.__artifact);
      }
    });

    if (customNotes.length) {
      project.notes = [...customNotes, ...(project.notes || [])];
    }
  });
}
