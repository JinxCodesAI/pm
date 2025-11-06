import { createElement } from "../../utils.js";
import {
  clone,
  createActionButton,
  openConfirmModal,
  openModal,
  showToast
} from "../helpers.js";
import { generateBoardDraft } from "./generators.js";
import { generateId, getBriefAnchors } from "./support.js";

export function promoteIdeaToBoard(detail, module, context, idea) {
  detail.boards = Array.isArray(detail.boards) ? detail.boards : [];
  const draft = {
    id: generateId("board"),
    ideaId: idea.id,
    title: idea.title,
    logline: idea.logline,
    status: "draft",
    versions: [],
    activeVersionId: ""
  };
  detail.boards.unshift(draft);
  context.persistDetail(module.id, "concept-explore", detail);
  showToast("Board created from concept.");
}

export function openConceptBoardEditor(detail, module, context, options = {}) {
  const board = detail.boards?.[options.index];
  if (!board) {
    return;
  }

  const modal = openModal("Develop Concept Board", { dialogClass: "modal-dialog-wide" });
  const form = document.createElement("form");
  form.className = "modal-form concept-board-form";

  const titleField = createElement("label");
  titleField.appendChild(createElement("span", { text: "Title" }));
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.required = true;
  titleInput.value = board.title || "";
  titleField.appendChild(titleInput);
  form.appendChild(titleField);

  const loglineField = createElement("label");
  loglineField.appendChild(createElement("span", { text: "Logline" }));
  const loglineInput = document.createElement("textarea");
  loglineInput.rows = 3;
  loglineInput.value = board.logline || "";
  loglineField.appendChild(loglineInput);
  form.appendChild(loglineField);

  const narrativeField = createElement("label");
  narrativeField.appendChild(createElement("span", { text: "Narrative" }));
  const narrativeInput = document.createElement("textarea");
  narrativeInput.rows = 5;
  narrativeInput.value = getActiveVersion(board)?.narrative || "";
  narrativeField.appendChild(narrativeInput);
  form.appendChild(narrativeField);

  const visualsField = createElement("label");
  visualsField.appendChild(createElement("span", { text: "Key Visual Moments" }));
  const visualsInput = document.createElement("textarea");
  visualsInput.rows = 4;
  visualsInput.value = (getActiveVersion(board)?.keyVisuals || []).join("\n");
  visualsField.appendChild(visualsInput);
  form.appendChild(visualsField);

  const toneField = createElement("label");
  toneField.appendChild(createElement("span", { text: "Tone & Style" }));
  const toneInput = document.createElement("input");
  toneInput.type = "text";
  toneInput.placeholder = "Comma separated";
  toneInput.value = (getActiveVersion(board)?.tone || []).join(", ");
  toneField.appendChild(toneInput);
  form.appendChild(toneField);

  const strategyField = createElement("label");
  strategyField.appendChild(createElement("span", { text: "Link to Strategy" }));
  const strategyInput = document.createElement("input");
  strategyInput.type = "text";
  strategyInput.value = getActiveVersion(board)?.strategyLink || "";
  strategyField.appendChild(strategyInput);
  form.appendChild(strategyField);

  const assistRow = createElement("div", { classes: "concept-board-assist" });
  const feedbackLabel = createElement("label");
  feedbackLabel.appendChild(createElement("span", { text: "Feedback for AI (optional)" }));
  const feedbackInput = document.createElement("textarea");
  feedbackInput.rows = 2;
  feedbackInput.placeholder = "e.g. Tighten pacing, emphasize humor, avoid sci-fi.";
  feedbackLabel.appendChild(feedbackInput);
  assistRow.appendChild(feedbackLabel);
  const assistBtn = createElement("button", { classes: "ghost-button", text: "Refine with AI" });
  assistBtn.type = "button";
  assistBtn.addEventListener("click", () => {
    const draft = generateBoardDraft({
      context,
      title: titleInput.value.trim(),
      logline: loglineInput.value.trim() || board.logline,
      guidance: feedbackInput.value.trim()
    });
    if (!draft) {
      showToast("Need a logline and strategic anchors first.");
      return;
    }
    narrativeInput.value = draft.narrative;
    visualsInput.value = draft.keyVisuals.join("\n");
    toneInput.value = draft.tone.join(", ");
    strategyInput.value = draft.strategyLink;
    assistBtn.textContent = "Refined";
    setTimeout(() => (assistBtn.textContent = "Refine with AI"), 1200);
  });
  assistRow.appendChild(assistBtn);
  form.appendChild(assistRow);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const saveBtn = createElement("button", { classes: "primary-button", text: "Save Version" });
  saveBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      id: generateId("board-version"),
      version: (board.versions?.[0]?.version || 0) + 1,
      createdAt: new Date().toLocaleString(),
      logline: loglineInput.value.trim(),
      narrative: narrativeInput.value.trim(),
      keyVisuals: visualsInput.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      tone: toneInput.value
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean),
      strategyLink: strategyInput.value.trim(),
      aiGuidance: detail.lastGuidance || "",
      anchorSummary: getBriefAnchors(context).slice(0, 3)
    };

    board.title = titleInput.value.trim() || board.title;
    board.logline = payload.logline;
    board.versions = board.versions || [];
    board.versions.unshift(payload);
    board.activeVersionId = payload.id;
    if (board.status === "archived") {
      board.status = "draft";
    }

    context.persistDetail(module.id, "concept-explore", detail);
    showToast("Board version saved.");
    modal.close();
  });

  modal.body.appendChild(form);
  titleInput.focus();
}

export function duplicateBoard(detail, module, context, index) {
  const board = detail.boards?.[index];
  if (!board) {
    return;
  }
  const copy = clone(board);
  copy.id = generateId("board");
  copy.title = `${board.title || "Concept"} Copy`;
  copy.versions = (copy.versions || []).map((version) => ({ ...version, id: generateId("board-version") }));
  copy.activeVersionId = copy.versions[0]?.id || "";
  detail.boards.splice(index + 1, 0, copy);
  context.persistDetail(module.id, "concept-explore", detail);
  showToast("Board duplicated.");
}

export function changeBoardStatus(detail, module, context, index, status) {
  const board = detail.boards?.[index];
  if (!board) {
    return;
  }
  board.status = status;
  context.persistDetail(module.id, "concept-explore", detail);
  const message =
    status === "client-ready"
      ? "Marked client ready."
      : status === "archived"
      ? "Board archived."
      : "Board updated.";
  showToast(message);
}

export function requestBoardArchive(detail, module, context, index, onComplete) {
  const board = detail.boards?.[index];
  if (!board) {
    return;
  }
  openConfirmModal({
    title: "Archive concept board?",
    message: "You can restore archived boards anytime from this list.",
    confirmLabel: "Archive",
    onConfirm: () => {
      changeBoardStatus(detail, module, context, index, "archived");
      if (typeof onComplete === "function") {
        onComplete();
      }
    }
  });
}

export function openVersionHistoryDialog(board) {
  const modal = openModal("Version History", { dialogClass: "modal-dialog-wide" });
  if (!board.versions?.length) {
    modal.body.appendChild(createElement("p", { text: "No versions captured yet." }));
    return;
  }
  const list = createElement("div", { classes: "concept-history" });
  board.versions.forEach((version) => {
    const card = createElement("article", { classes: "concept-history-card" });
    card.appendChild(createElement("h4", { text: `v${version.version} • ${version.createdAt}` }));
    card.appendChild(createElement("p", { classes: "concept-logline", text: version.logline }));
    if (version.narrative) {
      card.appendChild(createElement("p", { text: version.narrative }));
    }
    if (version.keyVisuals?.length) {
      const visuals = createElement("ul", { classes: "concept-visual-list" });
      version.keyVisuals.forEach((visual) => visuals.appendChild(createElement("li", { text: visual })));
      card.appendChild(visuals);
    }
    list.appendChild(card);
  });
  modal.body.appendChild(list);
}

export function getActiveVersion(board) {
  if (!board?.versions?.length) {
    return null;
  }
  return board.versions.find((version) => version.id === board.activeVersionId) || board.versions[0];
}
