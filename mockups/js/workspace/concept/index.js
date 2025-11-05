import { renderConceptExplorer } from "./ideation.js";
import { renderConceptCritique } from "./critique.js";

export function createConceptRenderers(context) {
  return {
    "concept-explore": (detail, module) => renderConceptExplorer(detail, module, context),
    "concept-critique": (detail, module) => renderConceptCritique(detail, module, context)
  };
}
