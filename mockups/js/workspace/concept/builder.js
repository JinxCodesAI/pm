import { createElement } from "../../utils.js";
import {
  createActionButton,
  createSectionHeading,
  getStepBody,
  renderDefaultStepBody,
  showToast
} from "../helpers.js";
import {
  createCritiqueNotesSection,
  getActiveVersion,
  openBoardDetailsModal,
  openVersionHistoryDialog
} from "./boards.js";
import {
  generateBoardDraft,
  suggestBoardLogline,
  suggestBoardTitle,
  suggestKeyVisualMoments,
  suggestStrategyLink,
  suggestToneKeywords
} from "./generators.js";
import { generateId, getBriefAnchors } from "./support.js";

export function renderConceptBoardBuilder(detail, module, context) {
  const body = getStepBody();
  if (!body) {
    return;
  }
  body.innerHTML = "";
  body.classList.remove("muted");

  if (!detail) {
    renderDefaultStepBody();
    return;
  }

  const conceptDetail = context.ensureStepDetail(module, "concept-explore");
  conceptDetail.boards = Array.isArray(conceptDetail.boards) ? conceptDetail.boards : [];

  if (!conceptDetail.boards.length) {
    const header = createSectionHeading(
      "Promote a concept to get started",
      "Once an idea becomes a Concept Board you can develop the full artifact here."
    );
    body.appendChild(header);
    body.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No Concept Boards yet. Shortlist an idea in Concept Explorer and promote it to unlock the builder."
      })
    );
    return;
  }

  let shouldPersist = false;
  let activeBoard = conceptDetail.boards.find((board) => board.id === detail.activeBoardId);
  if (!activeBoard) {
    activeBoard = conceptDetail.boards[0];
    detail.activeBoardId = activeBoard.id;
    shouldPersist = true;
  }

  const { draft, mutated: draftMutated } = ensureWorkingDraft(detail, activeBoard);
  if (draftMutated) {
    shouldPersist = true;
  }

  const builder = createElement("div", { classes: "concept-builder" });
  builder.appendChild(
    createSectionHeading(
      "Concept Board Builder",
      "Fine-tune every element of the Concept Board before running critique."
    )
  );

  builder.appendChild(renderBoardSelector({ detail, module, context, boards: conceptDetail.boards, activeBoard }));
  builder.appendChild(renderBoardMeta(activeBoard));

  builder.appendChild(renderTitleField({ detail, module, context, draft }));
  builder.appendChild(renderLoglineField({ detail, module, context, draft }));
  builder.appendChild(renderNarrativeField({ detail, module, context, draft }));
  builder.appendChild(renderKeyVisualsField({ detail, module, context, draft }));
  builder.appendChild(renderToneField({ detail, module, context, draft }));
  builder.appendChild(renderStrategyField({ detail, module, context, draft }));

  if (activeBoard.critiqueNotes?.length) {
    builder.appendChild(
      createCritiqueNotesSection(activeBoard.critiqueNotes, {
        emptyMessage: "No critique arguments added yet. Capture them in AI Creative Director."
      })
    );
  }

  builder.appendChild(
    renderActionRow({ detail, module, context, board: activeBoard, draft, conceptDetail })
  );

  body.appendChild(builder);

  if (shouldPersist) {
    context.persistDetail(module.id, "concept-board-builder", detail);
  }
}

function renderBoardSelector({ detail, module, context, boards, activeBoard }) {
  const container = createElement("div", { classes: "concept-builder-selector" });
  const label = createElement("label", { classes: "concept-builder-selector-label" });
  label.appendChild(createElement("span", { text: "Active Concept Board" }));
  const select = document.createElement("select");
  select.className = "concept-builder-select";

  boards.forEach((board) => {
    const option = document.createElement("option");
    option.value = board.id;
    const activeVersion = getActiveVersion(board);
    const versionLabel = activeVersion ? ` • v${activeVersion.version}` : "";
    option.textContent = `${board.title || "Concept Board"}${versionLabel}`;
    if (board.id === activeBoard.id) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    detail.activeBoardId = select.value;
    context.persistDetail(module.id, "concept-board-builder", detail);
    renderConceptBoardBuilder(detail, module, context);
  });

  label.appendChild(select);
  container.appendChild(label);

  const buttons = createElement("div", { classes: "concept-builder-selector-actions" });
  buttons.appendChild(
    createActionButton("View Concept Snapshot", () => openBoardDetailsModal(activeBoard))
  );
  buttons.appendChild(
    createActionButton("View Version History", () => openVersionHistoryDialog(activeBoard))
  );
  container.appendChild(buttons);

  return container;
}

function renderBoardMeta(board) {
  const container = createElement("div", { classes: "concept-builder-meta" });
  const status = createElement("span", { classes: ["pill", `status-${board.status || "draft"}`] });
  status.textContent =
    board.status === "client-ready"
      ? "Client Ready"
      : board.status === "in-review"
      ? "In Review"
      : board.status === "archived"
      ? "Archived"
      : "Draft";
  container.appendChild(status);

  const activeVersion = getActiveVersion(board);
  const metaText = activeVersion
    ? `Active version v${activeVersion.version} • ${activeVersion.createdAt}`
    : "No saved versions yet";
  container.appendChild(createElement("span", { classes: "muted", text: metaText }));

  return container;
}

function renderTitleField({ detail, module, context, draft }) {
  const section = createFieldShell({
    title: "Concept Title",
    description: "A memorable title the client can recall instantly.",
    guidanceKey: "title",
    detail,
    module,
    context,
    input: () => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = draft.title || "";
      input.placeholder = "e.g. Rooms that Rise with You";
      input.addEventListener("input", () => {
        draft.title = input.value;
        persistBuilderDetail(module, detail, context);
      });
      return input;
    },
    aiLabel: "Refine Title",
    aiHandler: (guidance) => {
      const suggestion = suggestBoardTitle({
        context,
        logline: draft.logline,
        guidance
      });
      if (!suggestion) {
        showToast("Need a logline or brief insight before refining the title.");
        return false;
      }
      draft.title = suggestion;
      section.querySelector("input").value = suggestion;
      persistBuilderDetail(module, detail, context);
      return true;
    }
  });
  return section;
}

function renderLoglineField({ detail, module, context, draft }) {
  const section = createFieldShell({
    title: "Logline",
    description: "One sentence that sells the concept's core idea.",
    guidanceKey: "logline",
    detail,
    module,
    context,
    input: () => {
      const textarea = document.createElement("textarea");
      textarea.rows = 2;
      textarea.value = draft.logline || "";
      textarea.placeholder = "Summarise the story in a single compelling sentence.";
      textarea.addEventListener("input", () => {
        draft.logline = textarea.value;
        persistBuilderDetail(module, detail, context);
      });
      return textarea;
    },
    aiLabel: "Refine Logline",
    aiHandler: (guidance) => {
      const suggestion = suggestBoardLogline({
        context,
        title: draft.title,
        guidance
      });
      if (!suggestion) {
        showToast("Need brief anchors before the AI can reshape the logline.");
        return false;
      }
      draft.logline = suggestion;
      section.querySelector("textarea").value = suggestion;
      persistBuilderDetail(module, detail, context);
      return true;
    }
  });
  return section;
}

function renderNarrativeField({ detail, module, context, draft }) {
  const section = createFieldShell({
    title: "Narrative",
    description: "A short paragraph that walks through the story beat-by-beat.",
    guidanceKey: "narrative",
    detail,
    module,
    context,
    input: () => {
      const textarea = document.createElement("textarea");
      textarea.rows = 5;
      textarea.value = draft.narrative || "";
      textarea.placeholder = "Describe the story arc in 3-5 sentences.";
      textarea.addEventListener("input", () => {
        draft.narrative = textarea.value;
        persistBuilderDetail(module, detail, context);
      });
      return textarea;
    },
    aiLabel: "Refine Narrative",
    aiHandler: (guidance) => {
      const draftResult = generateBoardDraft({
        context,
        title: draft.title,
        logline: draft.logline,
        guidance
      });
      if (!draftResult) {
        showToast("Need a logline and brief anchors before refining the narrative.");
        return false;
      }
      draft.narrative = draftResult.narrative;
      section.querySelector("textarea").value = draftResult.narrative;
      persistBuilderDetail(module, detail, context);
      return true;
    }
  });
  return section;
}

function renderKeyVisualsField({ detail, module, context, draft }) {
  const section = createFieldShell({
    title: "Key Visual Moments",
    description: "List 3-4 vivid images that will stick with the audience.",
    guidanceKey: "keyVisuals",
    detail,
    module,
    context,
    input: () => {
      const textarea = document.createElement("textarea");
      textarea.rows = 4;
      textarea.value = draft.keyVisualsText || "";
      textarea.placeholder = "Enter one visual beat per line.";
      textarea.addEventListener("input", () => {
        draft.keyVisualsText = textarea.value;
        persistBuilderDetail(module, detail, context);
      });
      return textarea;
    },
    aiLabel: "Refine Visuals",
    aiHandler: (guidance) => {
      const visuals = suggestKeyVisualMoments({
        context,
        title: draft.title,
        logline: draft.logline,
        guidance
      });
      if (!visuals?.length) {
        showToast("Need a logline and anchors before generating visual beats.");
        return false;
      }
      draft.keyVisualsText = visuals.join("\n");
      section.querySelector("textarea").value = draft.keyVisualsText;
      persistBuilderDetail(module, detail, context);
      return true;
    }
  });
  return section;
}

function renderToneField({ detail, module, context, draft }) {
  const section = createFieldShell({
    title: "Tone & Style",
    description: "Keywords that signal how the concept should feel in execution.",
    guidanceKey: "tone",
    detail,
    module,
    context,
    input: () => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = draft.toneText || "";
      input.placeholder = "Comma-separated tone cues (e.g. Warm, Cinematic)";
      input.addEventListener("input", () => {
        draft.toneText = input.value;
        persistBuilderDetail(module, detail, context);
      });
      return input;
    },
    aiLabel: "Refine Tone",
    aiHandler: (guidance) => {
      const tones = suggestToneKeywords({
        context,
        title: draft.title,
        logline: draft.logline,
        guidance
      });
      if (!tones?.length) {
        showToast("Need narrative cues before suggesting tone keywords.");
        return false;
      }
      draft.toneText = tones.join(", ");
      section.querySelector("input").value = draft.toneText;
      persistBuilderDetail(module, detail, context);
      return true;
    }
  });
  return section;
}

function renderStrategyField({ detail, module, context, draft }) {
  const section = createFieldShell({
    title: "Link to Strategy",
    description: "Tie the concept directly back to the Creative Brief.",
    guidanceKey: "strategyLink",
    detail,
    module,
    context,
    input: () => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = draft.strategyLink || "";
      input.placeholder = "Explicitly connect to the core brief insight.";
      input.addEventListener("input", () => {
        draft.strategyLink = input.value;
        persistBuilderDetail(module, detail, context);
      });
      return input;
    },
    aiLabel: "Refine Strategy Link",
    aiHandler: (guidance) => {
      const suggestion = suggestStrategyLink({
        context,
        title: draft.title,
        logline: draft.logline,
        guidance
      });
      if (!suggestion) {
        showToast("Need brief anchors to connect the concept back to strategy.");
        return false;
      }
      draft.strategyLink = suggestion;
      section.querySelector("input").value = suggestion;
      persistBuilderDetail(module, detail, context);
      return true;
    }
  });
  return section;
}

function renderActionRow({ detail, module, context, board, draft, conceptDetail }) {
  const container = createElement("div", { classes: "concept-builder-actions" });

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "ghost-button";
  resetBtn.textContent = "Reset to Active Version";
  resetBtn.addEventListener("click", () => {
    delete detail.workingDrafts?.[board.id];
    persistBuilderDetail(module, detail, context);
    renderConceptBoardBuilder(detail, module, context);
  });
  container.appendChild(resetBtn);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "primary-button";
  saveBtn.textContent = "Save Concept Board";
  saveBtn.addEventListener("click", () => {
    if (saveBtn.disabled) {
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    window.setTimeout(() => {
      const success = saveBoardVersion({ detail, module, context, board, draft, conceptDetail });
      saveBtn.disabled = false;
      saveBtn.textContent = success ? "Saved" : "Save Concept Board";
      if (success) {
        setTimeout(() => {
          saveBtn.textContent = "Save Concept Board";
        }, 1200);
      }
    }, 90);
  });
  container.appendChild(saveBtn);

  return container;
}

function createFieldShell({ title, description, guidanceKey, detail, module, context, input, aiLabel, aiHandler }) {
  const section = createElement("section", { classes: "concept-builder-field" });
  section.appendChild(createElement("h3", { text: title }));
  if (description) {
    section.appendChild(createElement("p", { classes: "muted", text: description }));
  }

  const inputEl = input();
  inputEl.classList.add("concept-builder-input");
  section.appendChild(inputEl);

  const controls = createElement("div", { classes: "concept-builder-field-controls" });
  const guidanceWrapper = createElement("label", { classes: "concept-builder-guidance" });
  guidanceWrapper.appendChild(createElement("span", { text: "Guidance for AI (optional)" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.value = detail.fieldGuidance?.[guidanceKey] || "";
  guidanceInput.placeholder = "Add coaching notes before regenerating this element.";
  guidanceInput.addEventListener("input", () => {
    detail.fieldGuidance = detail.fieldGuidance || {};
    detail.fieldGuidance[guidanceKey] = guidanceInput.value;
    persistBuilderDetail(module, detail, context);
  });
  guidanceWrapper.appendChild(guidanceInput);
  controls.appendChild(guidanceWrapper);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost-button";
  button.textContent = aiLabel;
  button.addEventListener("click", () => {
    if (button.disabled) {
      return;
    }
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Generating…";
    window.setTimeout(() => {
      const ok = aiHandler(detail.fieldGuidance?.[guidanceKey] || "");
      button.disabled = false;
      button.textContent = ok ? "Refined" : original;
      if (ok) {
        setTimeout(() => {
          button.textContent = original;
        }, 1200);
      }
    }, 90);
  });
  controls.appendChild(button);

  section.appendChild(controls);
  return section;
}

function ensureWorkingDraft(detail, board) {
  detail.workingDrafts = detail.workingDrafts && typeof detail.workingDrafts === "object" ? detail.workingDrafts : {};
  const activeVersion = getActiveVersion(board);
  const versionKey = activeVersion?.id || "__base__";
  const existing = detail.workingDrafts[board.id];
  if (!existing || existing.sourceVersionId !== versionKey) {
    detail.workingDrafts[board.id] = {
      title: board.title || "",
      logline: activeVersion?.logline || board.logline || "",
      narrative: activeVersion?.narrative || "",
      keyVisualsText: (activeVersion?.keyVisuals || []).join("\n"),
      toneText: (activeVersion?.tone || []).join(", "),
      strategyLink: activeVersion?.strategyLink || "",
      sourceVersionId: versionKey
    };
    return { draft: detail.workingDrafts[board.id], mutated: true };
  }
  const draft = detail.workingDrafts[board.id];
  draft.title = draft.title ?? board.title ?? "";
  draft.logline = draft.logline ?? activeVersion?.logline ?? board.logline ?? "";
  draft.narrative = draft.narrative ?? "";
  draft.keyVisualsText = draft.keyVisualsText ?? (activeVersion?.keyVisuals || []).join("\n");
  draft.toneText = draft.toneText ?? (activeVersion?.tone || []).join(", ");
  draft.strategyLink = draft.strategyLink ?? activeVersion?.strategyLink ?? "";
  return { draft, mutated: false };
}

function saveBoardVersion({ detail, module, context, board, draft, conceptDetail }) {
  const trimmedLogline = (draft.logline || "").trim();
  const trimmedNarrative = (draft.narrative || "").trim();
  const visuals = (draft.keyVisualsText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tone = (draft.toneText || "")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  const strategyLink = (draft.strategyLink || "").trim();

  if (!draft.title?.trim() || !trimmedLogline || !trimmedNarrative || !visuals.length) {
    showToast("Title, logline, narrative, and at least one visual are required to save.");
    return false;
  }

  const versionId = generateId("board-version");
  const nextVersionNumber = (board.versions?.[0]?.version || 0) + 1;
  const payload = {
    id: versionId,
    version: nextVersionNumber,
    createdAt: new Date().toLocaleString(),
    logline: trimmedLogline,
    narrative: trimmedNarrative,
    keyVisuals: visuals,
    tone,
    strategyLink,
    aiGuidance: summariseFieldGuidance(detail.fieldGuidance),
    anchorSummary: getBriefAnchors(context).slice(0, 3)
  };

  board.title = draft.title.trim();
  board.logline = trimmedLogline;
  board.versions = Array.isArray(board.versions) ? board.versions : [];
  board.versions.unshift(payload);
  board.activeVersionId = versionId;
  if (board.status === "archived") {
    board.status = "draft";
  }

  conceptDetail.boards = conceptDetail.boards.map((item) => (item.id === board.id ? board : item));
  context.persistDetail(module.id, "concept-explore", conceptDetail);

  detail.workingDrafts[board.id].sourceVersionId = versionId;
  context.persistDetail(module.id, "concept-board-builder", detail);

  showToast("Concept Board saved.");
  renderConceptBoardBuilder(detail, module, context);
  return true;
}

function summariseFieldGuidance(fieldGuidance = {}) {
  const entries = Object.entries(fieldGuidance)
    .map(([key, value]) => ({ key, value: (value || "").trim() }))
    .filter((item) => item.value);
  if (!entries.length) {
    return "";
  }
  return entries
    .map(({ key, value }) => `${formatGuidanceKey(key)}: ${value}`)
    .join(" | ");
}

function formatGuidanceKey(key) {
  switch (key) {
    case "keyVisuals":
      return "Visuals";
    case "strategyLink":
      return "Strategy";
    default:
      return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

function persistBuilderDetail(module, detail, context) {
  context.persistDetail(module.id, "concept-board-builder", detail);
}
