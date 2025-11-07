import { renderConceptExplorer } from "./ideation.js";
import { renderConceptBoardBuilder } from "./builder.js";
import { renderConceptCritique } from "./critique.js";

export function createConceptRenderers(context) {
  return {
    "concept-explore": (detail, module) => renderConceptExplorer(detail, module, context),
    "concept-board-builder": (detail, module) => renderConceptBoardBuilder(detail, module, context),
    "concept-critique": (detail, module) => renderConceptCritique(detail, module, context)
  };
}
