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

  renderCritiqueList(detail, module, context, conceptDetail);
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

  const critiqueId = `critique-${Date.now()}`;
  const critique = buildCritique(version, guidance, critiqueId);
  detail.critiques = detail.critiques || [];
  detail.critiques.unshift({
    id: critiqueId,
    boardId,
    versionId: version.id,
    versionLabel: version.version,
    boardTitle: board.title,
    createdAt: new Date().toLocaleString(),
    focus: guidance,
    ...critique,
    status: "open"
  });
  detail.lastGuidance = guidance;
  detail.lastRun = new Date().toLocaleString();

  context.persistDetail(module.id, "concept-critique", detail);
  showToast("Critique ready.");
}

function buildCritique(version, guidance, critiqueId) {
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

  const arguments = [];
  let index = 0;
  const register = (type, items) => {
    items.forEach((text) => {
      index += 1;
      arguments.push({
        id: `${critiqueId || "critique"}-arg-${index}`,
        type,
        text
      });
    });
  };

  register("Strength", strengths);
  register("Risk", risks);
  register("Question", questions);
  register("Recommendation", recommendations);

  return { arguments, strengths, risks, questions, recommendations };
}

function renderCritiqueList(detail, module, context, conceptDetail) {
  const body = getStepBody();
  if (!body) {
    return;
  }
  const list = createElement("div", { classes: "concept-critique-list" });
  detail.critiques.forEach((critique, index) => {
    const argumentsList = normalizeCritiqueArguments(critique);
    const board = conceptDetail?.boards?.find((item) => item.id === critique.boardId);
    const card = createElement("article", { classes: "concept-critique-card" });
    const header = createElement("div", { classes: "concept-critique-header" });
    const versionLabel = critique.versionLabel || critique.versionId?.split("-").pop();
    header.appendChild(
      createElement("h4", {
        text: `${critique.boardTitle || "Concept"} • v${versionLabel || "?"}`
      })
    );
    const pill = createElement("span", {
      classes: ["pill", critique.status === "closed" ? "status-complete" : "status-attention"]
    });
    pill.textContent = critique.status === "closed" ? "Addressed" : "Open";
    header.appendChild(pill);
    card.appendChild(header);

    card.appendChild(createElement("p", { classes: "muted", text: `Ran ${critique.createdAt}` }));

    if (critique.focus) {
      card.appendChild(createElement("p", { classes: "muted", text: `Focus: ${critique.focus}` }));
    }

    if (argumentsList.length) {
      const argumentContainer = createElement("div", { classes: "concept-critique-argument-list" });
      const existingNotes = board?.critiqueNotes || [];
      argumentsList.forEach((argument) => {
        const typeClass = argument.type.toLowerCase().replace(/\s+/g, "-");
        const argumentCard = createElement("div", {
          classes: ["concept-critique-argument-card", `argument-${typeClass}`]
        });
        argumentCard.appendChild(
          createElement("span", {
            classes: "concept-critique-argument-type",
            text: argument.type
          })
        );
        argumentCard.appendChild(createElement("p", { text: argument.text }));

        const alreadyAdded = existingNotes.some((note) => note.argumentId === argument.id);
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "chip-button";
        if (alreadyAdded) {
          addBtn.textContent = "Added to Concept";
          addBtn.disabled = true;
          addBtn.classList.add("is-disabled");
        } else {
          addBtn.textContent = "Add to Concept Critique";
          addBtn.addEventListener("click", () => {
            addArgumentToConceptBoard({
              module,
              context,
              boardId: critique.boardId,
              critiqueId: critique.id,
              argument
            });
            renderConceptCritique(detail, module, context);
          });
        }
        argumentCard.appendChild(addBtn);
        argumentContainer.appendChild(argumentCard);
      });
      card.appendChild(argumentContainer);
    }

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

function addArgumentToConceptBoard({ module, context, boardId, critiqueId, argument }) {
  const conceptDetail = context.ensureStepDetail(module, "concept-explore");
  const board = conceptDetail?.boards?.find((item) => item.id === boardId);
  if (!board) {
    showToast("Board not found for critique argument.");
    return;
  }
  board.critiqueNotes = board.critiqueNotes || [];
  const exists = board.critiqueNotes.some((note) => note.argumentId === argument.id);
  if (exists) {
    showToast("Argument already added to concept.");
    return;
  }
  board.critiqueNotes.unshift({
    argumentId: argument.id,
    critiqueId,
    type: argument.type,
    text: argument.text,
    createdAt: new Date().toLocaleString()
  });
  context.persistDetail(module.id, "concept-explore", conceptDetail);
  showToast("Argument added to concept critique.");
}

function normalizeCritiqueArguments(critique) {
  if (Array.isArray(critique.arguments) && critique.arguments.length) {
    critique.arguments = critique.arguments.map((argument, index) => ({
      ...argument,
      id: argument.id || `${critique.id || "critique"}-arg-${index + 1}`
    }));
    return critique.arguments;
  }

  const legacy = [];
  const groups = [
    ["Strength", critique.strengths],
    ["Risk", critique.risks],
    ["Question", critique.questions],
    ["Recommendation", critique.recommendations]
  ];
  let counter = 0;
  groups.forEach(([type, items]) => {
    items?.forEach((text) => {
      counter += 1;
      legacy.push({
        id: `${critique.id || "critique"}-arg-${counter}`,
        type,
        text
      });
    });
  });

  critique.arguments = legacy;
  return legacy;
}
