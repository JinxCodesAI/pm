export function getBriefAnchors(context) {
  const project = context.getProject?.();
  if (!project?.modules) {
    return [];
  }
  const discoverModule = project.modules.find((item) => item.id === "discover-brief");
  if (!discoverModule) {
    return [];
  }
  const detail = context.ensureStepDetail(discoverModule, "structure-input");
  const activeSummary = context.getActiveSummaryVersion(detail);
  const summary = activeSummary?.summary?.length ? activeSummary.summary : detail.summary || [];
  return summary.filter(Boolean);
}

export function getPersonaVoices(context) {
  const project = context.getProject?.();
  if (!project?.modules) {
    return [];
  }
  const discoverModule = project.modules.find((item) => item.id === "discover-brief");
  if (!discoverModule) {
    return [];
  }
  const detail = context.ensureStepDetail(discoverModule, "persona-builder");
  return (detail.personas || []).slice(0, 2).map((persona) => persona.name || persona.role || "Persona");
}

export function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}
