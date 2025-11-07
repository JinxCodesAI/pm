import { renderSceneOutline } from "./outline.js";
import { renderScriptDraft } from "./script-draft.js";

export function createScriptRenderers(context) {
  return {
    "scene-outline": (detail, module) => renderSceneOutline(detail, module, context),
    "script-draft": (detail, module) => renderScriptDraft(detail, module, context)
  };
}
