import { getBriefAnchors as getConceptAnchors, getPersonaVoices as getConceptPersonaVoices } from "../concept/support.js";

export function getBriefAnchors(context) {
  return getConceptAnchors(context);
}

export function getPersonaVoices(context) {
  return getConceptPersonaVoices(context);
}

export function getConceptBoards(context) {
  const project = context.getProject?.();
  if (!project?.modules) {
    return [];
  }
  const conceptModule = project.modules.find((module) => module.id === "concept-studio");
  if (!conceptModule) {
    return [];
  }
  const detail = context.ensureStepDetail(conceptModule, "concept-explore");
  const boards = Array.isArray(detail?.boards) ? detail.boards : [];
  const clone = context.clone || ((value) => JSON.parse(JSON.stringify(value)));
  return boards.map((board) => clone(board));
}

export function getActiveBoardVersion(board) {
  if (!board) {
    return null;
  }
  if (board.activeVersionId) {
    return board.versions?.find((version) => version.id === board.activeVersionId) || board.versions?.[0] || null;
  }
  return board.versions?.[0] || null;
}

export function generateId(prefix) {
  const base = Math.random().toString(16).slice(2, 8);
  return `${prefix}-${Date.now()}-${base}`;
}
