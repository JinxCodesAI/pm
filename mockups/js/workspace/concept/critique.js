import { createElement } from "../../utils.js";
import {
  createActionButton,
  createSectionHeading,
  getStepBody,
  openModal,
  renderDefaultStepBody,
  showToast
} from "../helpers.js";
import { getActiveVersion, openBoardDetailsModal } from "./boards.js";

export function renderConceptCritique(detail, module, context, preferredSelection) {
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
  const boardField = createElement("div", { classes: "concept-critique-board-field" });
  const boardSelectLabel = createElement("label");
  boardSelectLabel.appendChild(createElement("span", { text: "Board" }));
  const boardSelect = document.createElement("select");
  const optionValues = [];
  boards.forEach((board) => {
    const activeVersion = getActiveVersion(board);
    const option = document.createElement("option");
    option.value = `${board.id}:${activeVersion?.id || ""}`;
    option.textContent = `${board.title || "Concept"} • v${activeVersion?.version || 1}`;
    boardSelect.appendChild(option);
    optionValues.push(option.value);
  });
  let selectionToUse =
    preferredSelection || detail.lastSelection || (boardSelect.options[0]?.value ?? "");
  if (selectionToUse && !optionValues.includes(selectionToUse) && optionValues.length) {
    selectionToUse = optionValues[0];
  }
  if (selectionToUse) {
    boardSelect.value = selectionToUse;
  }
  boardSelectLabel.appendChild(boardSelect);
  boardField.appendChild(boardSelectLabel);

  const guidanceLabel = createElement("label");
  guidanceLabel.appendChild(createElement("span", { text: "Focus" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.placeholder = "e.g. Challenge the stakes and flag production risks.";
  guidanceInput.value = detail.lastGuidance || "";
  guidanceLabel.appendChild(guidanceInput);

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
    const selectedValue = boardSelect.value;
    window.setTimeout(() => {
      const resolvedSelection = runConceptCritique(
        detail,
        module,
        context,
        conceptDetail,
        selectedValue,
        guidanceInput.value.trim()
      );
      runBtn.disabled = false;
      runBtn.textContent = "Run Critique";
      renderConceptCritique(
        detail,
        module,
        context,
        resolvedSelection || selectedValue
      );
    }, 120);
  });

  const viewDetailsBtn = document.createElement("button");
  viewDetailsBtn.type = "button";
  viewDetailsBtn.className = "ghost-button";
  viewDetailsBtn.textContent = "View Details";
  viewDetailsBtn.disabled = !boardSelect.value;
  viewDetailsBtn.addEventListener("click", () => {
    if (!boardSelect.value) {
      showToast("Select a board to view details.");
      return;
    }
    const [boardId] = boardSelect.value.split(":");
    const board = conceptDetail.boards?.find((item) => item.id === boardId);
    if (!board) {
      showToast("Selected board not found.");
      return;
    }
    openBoardDetailsModal(board);
  });
  boardField.appendChild(viewDetailsBtn);
  controlBar.appendChild(boardField);

  controlBar.appendChild(guidanceLabel);

  controlBar.appendChild(runBtn);

  if (detail.lastRun) {
    controlBar.appendChild(createElement("p", { classes: "muted", text: `Last critique ${detail.lastRun}` }));
  }

  body.appendChild(controlBar);

  const resultsContainer = createElement("div", { classes: "concept-critique-results" });
  body.appendChild(resultsContainer);

  const renderResults = () => {
    if (boardSelect.value) {
      detail.lastSelection = boardSelect.value;
    }
    viewDetailsBtn.disabled = !boardSelect.value;
    renderCritiqueResults({
      detail,
      module,
      context,
      conceptDetail,
      container: resultsContainer,
      selectionValue: boardSelect.value
    });
  };

  boardSelect.addEventListener("change", renderResults);

  renderResults();
}

function runConceptCritique(detail, module, context, conceptDetail, selectionValue, guidance) {
  const [boardId, versionId] = selectionValue.split(":");
  const board = conceptDetail.boards?.find((item) => item.id === boardId);
  if (!board) {
    showToast("Selected board not found.");
    return null;
  }
  let version = board.versions?.find((item) => item.id === versionId) || getActiveVersion(board);
  if (!version) {
    version = bootstrapBoardVersion(board, conceptDetail, module, context);
    if (!version) {
      showToast("Board version missing.");
      return null;
    }
  }

  const resolvedSelection = `${boardId}:${version.id}`;

  const critiqueId = `critique-${Date.now()}`;
  const critique = buildCritique(version, guidance, critiqueId);
  detail.critiques = detail.critiques || [];
  detail.critiques = detail.critiques.filter(
    (item) => !(item.boardId === boardId && item.versionId === version.id)
  );
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
  detail.lastSelection = resolvedSelection;

  context.persistDetail(module.id, "concept-critique", detail);
  showToast("Critique ready.");
  return resolvedSelection;
}

function bootstrapBoardVersion(board, conceptDetail, module, context) {
  const preparedBoard = board;
  preparedBoard.versions = Array.isArray(preparedBoard.versions) ? preparedBoard.versions : [];
  if (preparedBoard.versions.length) {
    return getActiveVersion(preparedBoard);
  }

  const generatedId = `board-version-${preparedBoard.id || "draft"}-${Date.now()}`;
  const placeholderNarrative = preparedBoard.logline
    ? `${preparedBoard.logline} (first draft captured for critique).`
    : "First draft captured for critique.";
  const version = {
    id: generatedId,
    version: 1,
    createdAt: new Date().toLocaleString(),
    logline: preparedBoard.logline || "",
    narrative: placeholderNarrative,
    keyVisuals: [],
    tone: [],
    strategyLink: "",
    aiGuidance: "",
    anchorSummary: []
  };

  preparedBoard.versions.unshift(version);
  preparedBoard.activeVersionId = version.id;
  if (preparedBoard.status === "archived") {
    preparedBoard.status = "draft";
  }

  context.persistDetail(module.id, "concept-explore", conceptDetail);
  return version;
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

  const argumentList = [];
  let index = 0;
  const register = (type, items) => {
    items.forEach((text) => {
      index += 1;
      argumentList.push({
        id: `${critiqueId || "critique"}-arg-${index}`,
        type,
        text,
        status: "open"
      });
    });
  };

  register("Strength", strengths);
  register("Risk", risks);
  register("Question", questions);
  register("Recommendation", recommendations);

  return { arguments: argumentList, strengths, risks, questions, recommendations };
}

function renderCritiqueResults({
  detail,
  module,
  context,
  conceptDetail,
  container,
  selectionValue
}) {
  container.innerHTML = "";
  if (!selectionValue) {
    container.appendChild(
      createElement("p", {
        classes: "muted",
        text: "Run a critique to populate argument cards for this board."
      })
    );
    return;
  }

  const [boardId, versionId] = selectionValue.split(":");
  const board = conceptDetail?.boards?.find((item) => item.id === boardId);
  if (!board) {
    container.appendChild(
      createElement("p", {
        classes: "muted",
        text: "Board no longer exists. Select another concept to continue."
      })
    );
    return;
  }

  container.appendChild(
    buildManualCritiqueComposer({
      board,
      module,
      context,
      onRefresh: () => renderConceptCritique(detail, module, context, selectionValue)
    })
  );

  const critique = detail.critiques?.find(
    (item) => item.boardId === boardId && item.versionId === versionId
  );
  if (!critique) {
    container.appendChild(
      createElement("p", {
        classes: "muted",
        text: "Run a critique to populate argument cards for this board."
      })
    );
    return;
  }

  const card = buildCritiqueCard({
    detail,
    module,
    context,
    conceptDetail,
    critique,
    board
  });
  container.appendChild(card);
}

function buildManualCritiqueComposer({ board, module, context, onRefresh }) {
  const section = createElement("section", { classes: "concept-critique-manual" });
  section.appendChild(createElement("h4", { text: "Add Manual Critique" }));
  section.appendChild(
    createElement("p", {
      classes: "muted",
      text: "Capture your own talking points alongside the AI results."
    })
  );

  const actions = createElement("div", { classes: "manual-critique-actions" });
  const addBtn = createActionButton("Add Critique", () =>
    openManualCritiqueModal({
      board,
      module,
      context,
      onSave: () => {
        if (onRefresh) {
          onRefresh();
        }
      }
    })
  );
  addBtn.classList.add("primary-chip");
  actions.appendChild(addBtn);
  section.appendChild(actions);

  const preview = createElement("div", { classes: "manual-critique-preview" });
  preview.appendChild(createElement("strong", { text: "Latest notes" }));
  const recentNotes = (board.critiqueNotes || []).slice(0, 3);
  if (!recentNotes.length) {
    preview.appendChild(
      createElement("p", {
        classes: "muted",
        text: "Nothing saved yet. Address arguments or add manual notes to build your critique."
      })
    );
  } else {
    const list = document.createElement("ul");
    list.className = "manual-critique-preview-list";
    recentNotes.forEach((note) => {
      const item = document.createElement("li");
      item.appendChild(
        createElement("span", { classes: "manual-critique-preview-type", text: note.type || "Note" })
      );
      item.appendChild(createElement("p", { text: note.text || "" }));
      list.appendChild(item);
    });
    preview.appendChild(list);
  }
  section.appendChild(preview);

  return section;
}

function openManualCritiqueModal({ board, module, context, onSave }) {
  const modal = openModal("Add Critique", { dialogClass: "modal-dialog-wide" });
  const form = document.createElement("form");
  form.className = "modal-form manual-critique-form";

  form.appendChild(
    createElement("p", {
      classes: "muted",
      text: "Log context or direction that the AI might have missed. These notes appear with other critique arguments."
    })
  );

  const fields = createElement("div", { classes: "manual-critique-fields" });

  const typeLabel = createElement("label");
  typeLabel.appendChild(createElement("span", { text: "Type" }));
  const typeSelect = document.createElement("select");
  ["Risk", "Recommendation", "Strength", "Question", "Observation"].forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option;
    opt.textContent = option;
    typeSelect.appendChild(opt);
  });
  typeLabel.appendChild(typeSelect);
  fields.appendChild(typeLabel);

  const noteLabel = createElement("label");
  noteLabel.appendChild(createElement("span", { text: "Note" }));
  const noteInput = document.createElement("textarea");
  noteInput.rows = 6;
  noteInput.placeholder = "Summarize the critique you want to capture.";
  noteLabel.appendChild(noteInput);
  fields.appendChild(noteLabel);

  form.appendChild(fields);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const submitBtn = createElement("button", { classes: "primary-button", text: "Save Critique" });
  submitBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = noteInput.value.trim();
    if (!text) {
      showToast("Add context before saving your critique.");
      return;
    }
    const added = addManualCritiqueNote({
      module,
      context,
      boardId: board.id,
      type: typeSelect.value,
      text
    });
    if (!added) {
      return;
    }
    modal.close();
    if (typeof onSave === "function") {
      onSave();
    }
  });

  modal.body.appendChild(form);
  noteInput.focus();
}

function buildCritiqueCard({ detail, module, context, conceptDetail, critique, board }) {
  const argumentsList = normalizeCritiqueArguments(critique);
  const resolvedBoard = board || conceptDetail?.boards?.find((item) => item.id === critique.boardId);
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
    const existingNotes = resolvedBoard?.critiqueNotes || [];
    argumentsList.forEach((argument) => {
      const typeClass = argument.type.toLowerCase().replace(/\s+/g, "-");
      const argumentCard = createElement("div", {
        classes: ["concept-critique-argument-card", `argument-${typeClass}`]
      });

      const alreadyAdded = existingNotes.some((note) => note.argumentId === argument.id);
      if (alreadyAdded && argument.status !== "addressed") {
        updateArgumentStatus(detail, module, context, critique.id, argument.id, "addressed");
        argument.status = "addressed";
      }

      if (argument.status === "ignored") {
        argumentCard.classList.add("is-ignored");
      }
      if (argument.status === "addressed") {
        argumentCard.classList.add("is-addressed");
      }

      argumentCard.appendChild(
        createElement("span", {
          classes: "concept-critique-argument-type",
          text: argument.type
        })
      );
      argumentCard.appendChild(createElement("p", { text: argument.text }));

      const actions = createElement("div", { classes: "concept-critique-argument-actions" });

      const addressBtn = document.createElement("button");
      addressBtn.type = "button";
      addressBtn.className = "chip-button primary-chip";
      if (argument.status === "addressed") {
        addressBtn.textContent = "Addressed";
        addressBtn.classList.add("is-active");
      } else {
        addressBtn.textContent = "Address";
      }
      addressBtn.addEventListener("click", () => {
        if (argument.status === "addressed") {
          removeArgumentFromConceptBoard({
            module,
            context,
            boardId: critique.boardId,
            argumentId: argument.id
          });
          updateArgumentStatus(detail, module, context, critique.id, argument.id, "open");
        } else {
          const added = addArgumentToConceptBoard({
            module,
            context,
            boardId: critique.boardId,
            critiqueId: critique.id,
            argument
          });
          if (!added) {
            renderConceptCritique(detail, module, context, `${critique.boardId}:${critique.versionId}`);
            return;
          }
          updateArgumentStatus(detail, module, context, critique.id, argument.id, "addressed");
        }
        renderConceptCritique(detail, module, context, `${critique.boardId}:${critique.versionId}`);
      });
      actions.appendChild(addressBtn);

      const ignoreBtn = document.createElement("button");
      ignoreBtn.type = "button";
      ignoreBtn.className = "chip-button ghost-chip";
      if (argument.status === "ignored") {
        ignoreBtn.textContent = "Ignored";
        ignoreBtn.classList.add("is-active");
      } else {
        ignoreBtn.textContent = "Ignore";
      }
      ignoreBtn.addEventListener("click", () => {
        if (argument.status === "ignored") {
          updateArgumentStatus(detail, module, context, critique.id, argument.id, "open");
        } else {
          removeArgumentFromConceptBoard({
            module,
            context,
            boardId: critique.boardId,
            argumentId: argument.id
          });
          updateArgumentStatus(detail, module, context, critique.id, argument.id, "ignored");
        }
        renderConceptCritique(detail, module, context, `${critique.boardId}:${critique.versionId}`);
      });
      actions.appendChild(ignoreBtn);

      const explainBtn = document.createElement("button");
      explainBtn.type = "button";
      explainBtn.className = "chip-button";
      explainBtn.textContent = "Explain";
      explainBtn.addEventListener("click", () => {
        showToast("Explain prompts coming soon.");
      });
      actions.appendChild(explainBtn);

      argumentCard.appendChild(actions);
      argumentContainer.appendChild(argumentCard);
    });
    card.appendChild(argumentContainer);
  }

  const actions = createElement("div", { classes: "concept-critique-actions" });
  const critiqueIndex = detail.critiques?.indexOf(critique) ?? -1;
  if (critique.status === "open" && critiqueIndex >= 0) {
    actions.appendChild(
      createActionButton("Mark Addressed", () =>
        markCritiqueAddressed(detail, module, context, critiqueIndex)
      )
    );
  } else {
    actions.appendChild(createElement("span", { classes: "muted", text: "Archived in history." }));
  }
  card.appendChild(actions);

  return card;
}

function markCritiqueAddressed(detail, module, context, index) {
  const critique = detail.critiques?.[index];
  if (!critique) {
    return;
  }
  critique.status = "closed";
  context.persistDetail(module.id, "concept-critique", detail);
  showToast("Critique marked as addressed.");
  renderConceptCritique(detail, module, context, `${critique.boardId}:${critique.versionId}`);
}

function addManualCritiqueNote({ module, context, boardId, type, text }) {
  const conceptDetail = context.ensureStepDetail(module, "concept-explore");
  const board = conceptDetail?.boards?.find((item) => item.id === boardId);
  if (!board) {
    showToast("Board not found for manual critique.");
    return false;
  }
  board.critiqueNotes = Array.isArray(board.critiqueNotes) ? board.critiqueNotes : [];
  board.critiqueNotes.unshift({
    argumentId: `manual-${Date.now()}`,
    critiqueId: "manual",
    type: type || "Note",
    text,
    createdAt: new Date().toLocaleString()
  });
  context.persistDetail(module.id, "concept-explore", conceptDetail);
  showToast("Manual critique saved to concept board.");
  return true;
}

function removeArgumentFromConceptBoard({ module, context, boardId, argumentId }) {
  if (!argumentId) {
    return false;
  }
  const conceptDetail = context.ensureStepDetail(module, "concept-explore");
  const board = conceptDetail?.boards?.find((item) => item.id === boardId);
  if (!board?.critiqueNotes?.length) {
    return false;
  }
  const nextNotes = board.critiqueNotes.filter((note) => note.argumentId !== argumentId);
  if (nextNotes.length === board.critiqueNotes.length) {
    return false;
  }
  board.critiqueNotes = nextNotes;
  context.persistDetail(module.id, "concept-explore", conceptDetail);
  showToast("Argument removed from concept critique.");
  return true;
}

function addArgumentToConceptBoard({ module, context, boardId, critiqueId, argument }) {
  const conceptDetail = context.ensureStepDetail(module, "concept-explore");
  const board = conceptDetail?.boards?.find((item) => item.id === boardId);
  if (!board) {
    showToast("Board not found for critique argument.");
    return false;
  }
  board.critiqueNotes = Array.isArray(board.critiqueNotes) ? board.critiqueNotes : [];
  const exists = board.critiqueNotes.some((note) => note.argumentId === argument.id);
  if (exists) {
    return true;
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
  return true;
}

function normalizeCritiqueArguments(critique) {
  if (Array.isArray(critique.arguments) && critique.arguments.length) {
    critique.arguments = critique.arguments.map((argument, index) => ({
      ...argument,
      id: argument.id || `${critique.id || "critique"}-arg-${index + 1}`,
      status: argument.status || "open"
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
        text,
        status: "open"
      });
    });
  });

  critique.arguments = legacy;
  return legacy;
}

function updateArgumentStatus(detail, module, context, critiqueId, argumentId, status) {
  const critique = detail.critiques?.find((item) => item.id === critiqueId);
  if (!critique) {
    return;
  }
  const argumentsList = normalizeCritiqueArguments(critique);
  const argument = argumentsList.find((item) => item.id === argumentId);
  if (!argument) {
    return;
  }
  argument.status = status;
  if (status === "addressed") {
    critique.status = critique.status === "closed" ? "closed" : "open";
  }
  context.persistDetail(module.id, "concept-critique", detail);
}
