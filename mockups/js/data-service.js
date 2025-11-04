import { createElement } from "./utils.js";

let cachePromise = null;

export async function loadData() {
  if (!cachePromise) {
    cachePromise = fetch("data/projects.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load data (${response.status})`);
        }
        return response.json();
      })
      .catch((error) => {
        console.error(error);
        throw error;
      });
  }
  return cachePromise;
}

export async function getPortfolio() {
  const data = await loadData();
  return data.portfolio;
}

export async function getProjects() {
  const data = await loadData();
  return data.projects || [];
}

export async function getProjectById(projectId) {
  const projects = await getProjects();
  const found = projects.find((project) => project.id === projectId);
  if (!found) {
    throw new Error(`Project '${projectId}' not found`);
  }
  return found;
}

export async function getLoopsAcrossPortfolio() {
  const projects = await getProjects();
  return projects.flatMap((project) =>
    (project.loops || []).map((loop) => ({
      ...loop,
      projectId: project.id,
      projectName: project.name
    }))
  );
}

export function buildProjectLink(project) {
  const link = createElement("a", {
    classes: "ghost-button",
    text: "Open Workspace"
  });
  link.href = `project.html?projectId=${encodeURIComponent(project.id)}`;
  return link;
}
