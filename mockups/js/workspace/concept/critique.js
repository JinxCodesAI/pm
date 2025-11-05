import { createElement } from "../../utils.js";
import {
  createActionButton,
  createSectionHeading,
  getStepBody,
  renderDefaultStepBody,
  showToast
} from "../helpers.js";
import { getActiveVersion } from "./boards.js";

export function renderConceptCritique(detail, module, context) {
  const body = getStepBody();
  if (!body) {
    return;
  }
  body.innerHTML = "";
  body.classList.remove("muted");

  const conceptDetail = context.ensureStepDetail(module, "concept-explore");
  const boards = conceptDetail?.boards?.filter((board) => board.status !== "archived") || [];

  const header = createSectionHeading(
    "AI Creative Director",
    boards.length
      ? "Stress-test each board before client presentation. Capture critiques and route them into the next version."
      : "Create a concept board before running critiques."
  );
  body.appendChild(header);

  if (!boards.length) {
    renderDefaultStepBody("Build at least one concept board to unlock critique mode.");
    return;
  }

  const controlBar = createElement("div", { classes: "concept-critique-controls" });
  const boardSelectLabel = createElement("label");
  boardSelectLabel.appendChild(createElement("span", { text: "Board" }));
  const boardSelect = document.createElement("select");
  boards.forEach((board) => {
    const activeVersion = getActiveVersion(board);
    const option = document.createElement("option");
    option.value = `${board.id}:${activeVersion?.id || ""}`;
    option.textContent = `${board.title || "Concept"} • v${activeVersion?.version || 1}`;
    boardSelect.appendChild(option);
  });
  boardSelectLabel.appendChild(boardSelect);
  controlBar.appendChild(boardSelectLabel);

  const guidanceLabel = createElement("label");
  guidanceLabel.appendChild(createElement("span", { text: "Focus" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.placeholder = "e.g. Challenge the stakes and flag production risks.";
  guidanceInput.value = detail.lastGuidance || "";
  guidanceLabel.appendChild(guidanceInput);
  controlBar.appendChild(guidanceLabel);

  const runBtn = document.createElement("button");
  runBtn.className = "primary-button";
  runBtn.type = "button";
  runBtn.textContent = "Run Critique";
  runBtn.addEventListener("click", () => {
    if (!boardSelect.value) {
      showToast("Select a board to critique.");
      return;
    }
    runBtn.disabled = true;
    runBtn.textContent = "Reviewing…";
    window.setTimeout(() => {
      runConceptCritique(detail, module, context, boardSelect.value, guidanceInput.value.trim());
      runBtn.disabled = false;
      runBtn.textContent = "Run Critique";
      renderConceptCritique(detail, module, context);
    }, 120);
  });
  controlBar.appendChild(runBtn);

  if (detail.lastRun) {
    controlBar.appendChild(createElement("p", { classes: "muted", text: `Last critique ${detail.lastRun}` }));
  }

  body.appendChild(controlBar);

  if (!detail.critiques?.length) {
    body.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No critiques logged yet. Run a critique to pressure-test the board before the client sees it."
      })
    );
    return;
  }

  renderCritiqueList(detail, module, context);
}

function runConceptCritique(detail, module, context, selectionValue, guidance) {
  const [boardId, versionId] = selectionValue.split(":");
  const conceptDetail = context.ensureStepDetail(module, "concept-explore");
  const board = conceptDetail.boards?.find((item) => item.id === boardId);
  if (!board) {
    showToast("Selected board not found.");
    return;
  }
  const version = board.versions?.find((item) => item.id === versionId) || getActiveVersion(board);
  if (!version) {
    showToast("Board version missing.");
    return;
  }

  const critique = buildCritique(version, guidance);
  detail.critiques = detail.critiques || [];
  detail.critiques.unshift({
    id: `critique-${Date.now()}`,
    boardId,
    versionId: version.id,
    boardTitle: board.title,
    createdAt: new Date().toLocaleString(),
    ...critique,
    status: "open"
  });
  detail.lastGuidance = guidance;
  detail.lastRun = new Date().toLocaleString();

  context.persistDetail(module.id, "concept-critique", detail);
  showToast("Critique ready.");
}

function buildCritique(version, guidance) {
  const guidanceCue = guidance ? guidance.toLowerCase() : "";
  const strengths = [
    version.narrative
      ? "Narrative clarity: Story beats ladder from tension to resolution."
      : "Narrative clarity: Draft needs a sharper middle beat.",
    version.anchorSummary?.[0] || "Anchor alignment: Keep referencing the brief explicitly."
  ];

  const risks = [
    guidanceCue.includes("budget")
      ? "Production scale: Consider a leaner execution variant to control budget."
      : "Ensure production plan covers hero and cut-down formats.",
    "Clarify product role in the midpoint beat so value isn't lost in spectacle."
  ];

  const questions = [
    "What is the campaign-specific CTA and how will it appear on screen?",
    "Which persona insight fuels the comedic or emotional twist?"
  ];

  const recommendations = [
    "Prototype an alternate ending that reinforces the KPI.",
    "Draft a social-native cut for the versioned board before the client asks."
  ];

  return { strengths, risks, questions, recommendations };
}

function renderCritiqueList(detail, module, context) {
  const body = getStepBody();
  if (!body) {
    return;
  }
  const list = createElement("div", { classes: "concept-critique-list" });
  detail.critiques.forEach((critique, index) => {
    const card = createElement("article", { classes: "concept-critique-card" });
    const header = createElement("div", { classes: "concept-critique-header" });
    header.appendChild(createElement("h4", { text: `${critique.boardTitle} • v${critique.versionId?.split("-").pop()}` }));
    const pill = createElement("span", {
      classes: ["pill", critique.status === "closed" ? "status-complete" : "status-attention"]
    });
    pill.textContent = critique.status === "closed" ? "Addressed" : "Open";
    header.appendChild(pill);
    card.appendChild(header);

    card.appendChild(createElement("p", { classes: "muted", text: `Ran ${critique.createdAt}` }));

    const blocks = [
      ["Strengths", critique.strengths],
      ["Risks", critique.risks],
      ["Questions", critique.questions],
      ["Recommendations", critique.recommendations]
    ];
    blocks.forEach(([title, items]) => {
      if (!items?.length) {
        return;
      }
      card.appendChild(createElement("strong", { text: title }));
      const ul = createElement("ul", { classes: "concept-critique-items" });
      items.forEach((item) => ul.appendChild(createElement("li", { text: item })));
      card.appendChild(ul);
    });

    const actions = createElement("div", { classes: "concept-critique-actions" });
    if (critique.status === "open") {
      actions.appendChild(
        createActionButton("Mark Addressed", () => markCritiqueAddressed(detail, module, context, index))
      );
    } else {
      actions.appendChild(createElement("span", { classes: "muted", text: "Archived in history." }));
    }
    card.appendChild(actions);

    list.appendChild(card);
  });
  body.appendChild(list);
}

function markCritiqueAddressed(detail, module, context, index) {
  const critique = detail.critiques?.[index];
  if (!critique) {
    return;
  }
  critique.status = "closed";
  context.persistDetail(module.id, "concept-critique", detail);
  showToast("Critique marked as addressed.");
  renderConceptCritique(detail, module, context);
}
