import { createElement } from "../../utils.js";
import {
  clone,
  createActionButton,
  createSectionHeading,
  getStepBody,
  openModal,
  renderDefaultStepBody,
  showToast,
  openConfirmModal
} from "../helpers.js";
import {
  changeBoardStatus,
  createCritiqueNotesSection,
  duplicateBoard,
  getActiveVersion,
  openBoardDetailsModal,
  openConceptBoardEditor,
  openVersionHistoryDialog,
  promoteIdeaToBoard,
  requestBoardArchive
} from "./boards.js";
import { composeIdeaSeeds } from "./generators.js";
import { generateId, getBriefAnchors, getPersonaVoices } from "./support.js";

export function renderConceptExplorer(detail, module, context) {
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

  const anchors = getBriefAnchors(context);
  const personas = getPersonaVoices(context);

  renderIdeaGenerator({ body, detail, module, context, anchors, personas });
  renderIdeaList({ body, detail, module, context });
  renderBoardList({ body, detail, module, context });
}

function renderIdeaGenerator({ body, detail, module, context, anchors, personas }) {
  const header = createSectionHeading(
    "Idea Generator",
    "Spin up differentiated loglines anchored in the approved strategy."
  );
  body.appendChild(header);

  const wrapper = createElement("div", { classes: "concept-generator" });
  const copy = createElement("div", { classes: "concept-generator-copy" });
  copy.appendChild(
    createElement("p", {
      classes: "muted",
      text: anchors.length
        ? "Weave in these brief anchors and persona motivations so concepts stay strategically tight."
        : "Add a structured brief in Discover & Brief to supercharge the generator."
    })
  );

  if (anchors.length) {
    const list = createElement("ul", { classes: "concept-anchor-list" });
    anchors.slice(0, 5).forEach((anchor) => list.appendChild(createElement("li", { text: anchor })));
    copy.appendChild(list);
  }
  if (personas.length) {
    copy.appendChild(
      createElement("p", {
        classes: "muted concept-persona-line",
        text: `Voices to honour: ${personas.join(", ")}`
      })
    );
  }
  wrapper.appendChild(copy);

  const controls = createElement("div", { classes: "concept-generator-controls" });
  const guidanceLabel = createElement("label");
  guidanceLabel.appendChild(createElement("span", { text: "Guidance for the AI (optional)" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.placeholder = "e.g. Explore humor-forward takes or lean into aspirational settings.";
  guidanceInput.value = detail.lastGuidance || "";
  guidanceLabel.appendChild(guidanceInput);
  controls.appendChild(guidanceLabel);

  const actionRow = createElement("div", { classes: "concept-generator-actions" });
  const generateBtn = document.createElement("button");
  generateBtn.className = "primary-button";
  generateBtn.type = "button";
  generateBtn.textContent = "Generate Concepts";
  generateBtn.addEventListener("click", () => {
    if (generateBtn.disabled) {
      return;
    }
    generateBtn.disabled = true;
    generateBtn.textContent = "Generating…";
    window.setTimeout(() => {
      const created = runConceptGeneration({ detail, module, context, guidance: guidanceInput.value.trim() });
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate Concepts";
      if (created) {
        renderConceptExplorer(detail, module, context);
      }
    }, 90);
  });
  actionRow.appendChild(generateBtn);

  const manualBtn = createElement("button", { classes: "ghost-button", text: "Add Concept Manually" });
  manualBtn.type = "button";
  manualBtn.addEventListener("click", () => openIdeaEditor({ detail, module, context }));
  actionRow.appendChild(manualBtn);
  controls.appendChild(actionRow);

  if (detail.lastGeneratedAt) {
    controls.appendChild(createElement("p", { classes: "muted", text: `Last AI run ${detail.lastGeneratedAt}` }));
  }

  wrapper.appendChild(controls);
  body.appendChild(wrapper);
}

function renderIdeaList({ body, detail, module, context }) {
  const header = createSectionHeading(
    "Idea Pool",
    detail.ideas?.length
      ? "Promote strong ideas to Concepts. Duplicate and explore variations; archive rejects or remove clutter."
      : "Run the generator or add a concept manually. Promote promising ideas to Concepts."
  );
  body.appendChild(header);

  const list = createElement("div", { classes: "concept-idea-list" });
  if (!detail.ideas?.length) {
    list.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No concepts captured yet. Generate directions above to start shaping boards."
      })
    );
    body.appendChild(list);
    return;
  }

  detail.ideas.forEach((idea, index) => {
    const card = createElement("article", { classes: "concept-idea-card" });

    const headerRow = createElement("div", { classes: "concept-idea-header" });
    headerRow.appendChild(createElement("h4", { text: idea.title || "Concept" }));
    const pill = createElement("span", { classes: ["pill", `status-${idea.status || "draft"}`] });
    pill.textContent = idea.status === "archived" ? "Archived" : idea.status === "shortlisted" ? "Shortlisted" : "Draft";
    headerRow.appendChild(pill);
    card.appendChild(headerRow);

    if (idea.logline) {
      card.appendChild(createElement("p", { classes: "concept-logline", text: idea.logline }));
    }
    if (idea.description) {
      card.appendChild(createElement("p", { classes: "muted", text: idea.description }));
    }

    if (idea.score) {
      const scoreRow = createElement("div", { classes: "concept-score-row" });
      [
        ["Boldness", idea.score.boldness],
        ["Clarity", idea.score.clarity],
        ["Strategic Fit", idea.score.fit]
      ].forEach(([label, value]) => {
        const badge = createElement("span", { classes: "concept-score" });
        badge.appendChild(createElement("strong", { text: label }));
        badge.appendChild(createElement("span", { text: value != null ? `${value}/5` : "—" }));
        scoreRow.appendChild(badge);
      });
      card.appendChild(scoreRow);
    }

    if (idea.tags?.length) {
      const tagRow = createElement("div", { classes: "concept-tag-row" });
      idea.tags.forEach((tag) => tagRow.appendChild(createElement("span", { classes: "tag-chip", text: tag })));
      card.appendChild(tagRow);
    }

    const actions = createElement("div", { classes: "concept-idea-actions" });
    actions.appendChild(createActionButton("View Details", () => openIdeaDetailsModal(idea)));
    actions.appendChild(createActionButton("Edit Idea", () => openIdeaEditor({ detail, module, context, index })));
    actions.appendChild(createActionButton("Duplicate", () => duplicateIdea({ detail, module, context, index })));
    if (idea.status === "archived") {
      actions.appendChild(createActionButton("Restore", () => toggleIdeaStatus({ detail, module, context, index, status: "draft" })));
    } else {
      actions.appendChild(createActionButton("Archive", () => toggleIdeaStatus({ detail, module, context, index, status: "archived" })));
    }
    actions.appendChild(createActionButton("Remove", () => removeIdea({ detail, module, context, index })));
    actions.appendChild(
      createActionButton("Promote to Concept", () => {
        promoteIdeaToBoard(detail, module, context, idea);
        // remove the idea from the pool after promotion
        detail.ideas.splice(index, 1);
        context.persistDetail(module.id, "concept-explore", detail);
        renderConceptExplorer(detail, module, context);
      })
    );
    card.appendChild(actions);

    list.appendChild(card);
  });
  body.appendChild(list);
}

function renderBoardList({ body, detail, module, context }) {
  const header = createSectionHeading(
    "Concept Boards",
    detail.boards?.length
      ? "Refine and version your best directions. Capture critique arguments in AI Creative Director before client review."
      : "Promote a promising idea to start developing a Concept Board."
  );
  body.appendChild(header);

  const list = createElement("div", { classes: "concept-board-list" });
  if (!detail.boards?.length) {
    list.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No boards created yet. Promote a shortlisted idea to start shaping the narrative."
      })
    );
    body.appendChild(list);
    return;
  }

  detail.boards.forEach((board, index) => {
    const activeVersion = getActiveVersion(board);
    const card = createElement("article", { classes: "concept-board-card" });

    const headerRow = createElement("div", { classes: "concept-board-header" });
    headerRow.appendChild(createElement("h4", { text: board.title || "Concept Board" }));
    const pill = createElement("span", { classes: ["pill", `status-${board.status || "draft"}`] });
    pill.textContent =
      board.status === "client-ready"
        ? "Client Ready"
        : board.status === "in-review"
        ? "In Review"
        : board.status === "archived"
        ? "Archived"
        : "Draft";
    headerRow.appendChild(pill);
    card.appendChild(headerRow);

    if (activeVersion) {
      card.appendChild(createElement("p", { classes: "concept-logline", text: activeVersion.logline || board.logline }));
      // compact by default; offer details modal
      if (activeVersion.tone?.length) {
        const toneRow = createElement("div", { classes: "concept-tone-row" });
        activeVersion.tone.forEach((word) => toneRow.appendChild(createElement("span", { classes: "tag-chip", text: word })));
        card.appendChild(toneRow);
      }
      if (activeVersion.strategyLink) {
        card.appendChild(
          createElement("p", { classes: "muted concept-strategy-link", text: `Link to strategy: ${activeVersion.strategyLink}` })
        );
      }
    }

    const meta = createElement("p", { classes: "muted concept-board-meta" });
    meta.textContent = activeVersion
      ? `v${activeVersion.version} • Last updated ${activeVersion.createdAt}`
      : "No version saved yet.";
    card.appendChild(meta);

    if (board.versions?.length > 1) {
      const historyBtn = createActionButton("Version History", () => openVersionHistoryDialog(board));
      historyBtn.classList.add("ghost-button");
      card.appendChild(historyBtn);
    }

    if (board.critiqueNotes?.length) {
      const noteCount = board.critiqueNotes.length;
      card.appendChild(
        createElement("p", {
          classes: "concept-board-critique-callout",
          text: `${noteCount} critique argument${noteCount === 1 ? "" : "s"} captured.`
        })
      );
    }

    const actions = createElement("div", { classes: "concept-board-actions" });
    actions.appendChild(createActionButton("View Details", () => openBoardDetailsModal(board)));
    actions.appendChild(createActionButton("Edit Concept", () => openConceptBoardEditor(detail, module, context, { index })));
    if (board.status === "archived") {
      actions.appendChild(
        createActionButton("Restore", () => {
          changeBoardStatus(detail, module, context, index, "draft");
          renderConceptExplorer(detail, module, context);
        })
      );
    } else {
      actions.appendChild(
        createActionButton("Archive", () => {
          requestBoardArchive(detail, module, context, index, () => {
            renderConceptExplorer(detail, module, context);
          });
        })
      );
    }
    actions.appendChild(
      createActionButton("Move to Ideas", () => moveBoardToIdeas({ detail, module, context, index }))
    );
    if (board.status !== "client-ready") {
      actions.appendChild(
        createActionButton("Mark Client Ready", () => {
          changeBoardStatus(detail, module, context, index, "client-ready");
          renderConceptExplorer(detail, module, context);
        })
      );
    }
    actions.appendChild(createActionButton("Remove", () => removeBoard({ detail, module, context, index })));
    card.appendChild(actions);

    list.appendChild(card);
  });

  body.appendChild(list);
}

function runConceptGeneration({ detail, module, context, guidance }) {
  const { seeds } = composeIdeaSeeds(context, guidance);
  if (!seeds.length) {
    showToast("Add more strategic inputs in Discover & Brief before generating concepts.");
    return false;
  }

  detail.ideas = Array.isArray(detail.ideas) ? detail.ideas : [];
  seeds.forEach((seed) => {
    const exists = detail.ideas.some((idea) => idea.title === seed.title);
    if (exists) {
      return;
    }
    detail.ideas.unshift({
      id: generateId("idea"),
      status: "draft",
      createdAt: new Date().toLocaleString(),
      ...seed
    });
  });

  detail.lastGuidance = guidance;
  detail.lastGeneratedAt = new Date().toLocaleString();
  context.persistDetail(module.id, "concept-explore", detail);
  showToast(`${seeds.length} concept${seeds.length === 1 ? "" : "s"} generated.`);
  return true;
}

function toggleIdeaStatus({ detail, module, context, index, status }) {
  const idea = detail.ideas?.[index];
  if (!idea) {
    return;
  }
  idea.status = status;
  context.persistDetail(module.id, "concept-explore", detail);
  renderConceptExplorer(detail, module, context);
}

function openIdeaEditor({ detail, module, context, index }) {
  const isEdit = typeof index === "number";
  const existing = isEdit ? detail.ideas?.[index] : null;
  const current = existing
    ? clone(existing)
    : {
        id: generateId("idea"),
        title: "",
        logline: "",
        description: "",
        status: "draft",
        score: { boldness: 3, clarity: 3, fit: 3 },
        tags: []
      };

  const modal = openModal(isEdit ? "Edit Concept" : "New Concept");
  const form = document.createElement("form");
  form.className = "modal-form";

  const titleField = createElement("label");
  titleField.appendChild(createElement("span", { text: "Title" }));
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.required = true;
  titleInput.value = current.title || "";
  titleField.appendChild(titleInput);
  form.appendChild(titleField);

  const loglineField = createElement("label");
  loglineField.appendChild(createElement("span", { text: "Logline" }));
  const loglineInput = document.createElement("textarea");
  loglineInput.rows = 3;
  loglineInput.value = current.logline || "";
  loglineField.appendChild(loglineInput);
  form.appendChild(loglineField);

  const descField = createElement("label");
  descField.appendChild(createElement("span", { text: "Narrative Snapshot" }));
  const descInput = document.createElement("textarea");
  descInput.rows = 3;
  descInput.value = current.description || "";
  descField.appendChild(descInput);
  form.appendChild(descField);

  const tagField = createElement("label");
  tagField.appendChild(createElement("span", { text: "Tags" }));
  const tagInput = document.createElement("input");
  tagInput.type = "text";
  tagInput.placeholder = "Comma separated";
  tagInput.value = (current.tags || []).join(", ");
  tagField.appendChild(tagInput);
  form.appendChild(tagField);

  const scoreRow = createElement("div", { classes: "concept-score-input" });
  ["boldness", "clarity", "fit"].forEach((key) => {
    const scoreLabel = createElement("label");
    scoreLabel.appendChild(createElement("span", { text: key[0].toUpperCase() + key.slice(1) }));
    const scoreInput = document.createElement("input");
    scoreInput.type = "number";
    scoreInput.min = "1";
    scoreInput.max = "5";
    scoreInput.value = current.score?.[key] ?? 3;
    scoreInput.addEventListener("change", () => {
      current.score[key] = Number(scoreInput.value || 3);
    });
    scoreLabel.appendChild(scoreInput);
    scoreRow.appendChild(scoreLabel);
  });
  form.appendChild(scoreRow);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const saveBtn = createElement("button", { classes: "primary-button", text: isEdit ? "Save" : "Add" });
  saveBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      ...current,
      title: titleInput.value.trim(),
      logline: loglineInput.value.trim(),
      description: descInput.value.trim(),
      tags: tagInput.value
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean)
    };

    if (!payload.title) {
      showToast("Give the concept a title.");
      return;
    }

    if (isEdit) {
      detail.ideas[index] = payload;
    } else {
      detail.ideas = Array.isArray(detail.ideas) ? detail.ideas : [];
      detail.ideas.unshift(payload);
    }

    context.persistDetail(module.id, "concept-explore", detail);
    modal.close();
    renderConceptExplorer(detail, module, context);
  });

  modal.body.appendChild(form);
  titleInput.focus();
}

function openIdeaDetailsModal(idea) {
  const modal = openModal(idea.title || "Concept Idea");
  const content = document.createElement("div");
  if (idea.logline) {
    content.appendChild(createElement("p", { classes: "concept-logline", text: idea.logline }));
  }
  if (idea.description) {
    content.appendChild(createElement("p", { text: idea.description }));
  }
  if (idea.tags?.length) {
    const row = createElement("div", { classes: "concept-tag-row" });
    idea.tags.forEach((tag) => row.appendChild(createElement("span", { classes: "tag-chip", text: tag })));
    content.appendChild(row);
  }
  if (idea.score) {
    const scoreRow = createElement("div", { classes: "concept-score-row" });
    [["Boldness", idea.score.boldness],["Clarity", idea.score.clarity],["Strategic Fit", idea.score.fit]].forEach(([label, value]) => {
      const badge = createElement("span", { classes: "concept-score" });
      badge.appendChild(createElement("strong", { text: label }));
      badge.appendChild(createElement("span", { text: value != null ? `${value}/5` : "—" }));
      scoreRow.appendChild(badge);
    });
    content.appendChild(scoreRow);
  }
  modal.body.appendChild(content);
}

// Idea utilities
function duplicateIdea({ detail, module, context, index }) {
  const idea = detail.ideas?.[index];
  if (!idea) {
    return;
  }
  const copy = clone(idea);
  copy.id = generateId("idea");
  copy.title = `${idea.title || "Concept"} Copy`;
  detail.ideas.splice(index + 1, 0, copy);
  context.persistDetail(module.id, "concept-explore", detail);
  showToast("Idea duplicated.");
}

function removeIdea({ detail, module, context, index }) {
  const idea = detail.ideas?.[index];
  if (!idea) {
    return;
  }
  openConfirmModal({
    title: "Remove idea?",
    message: "This will permanently delete the idea. It won't inform the AI like Archive does.",
    confirmLabel: "Remove",
    onConfirm: () => {
      detail.ideas.splice(index, 1);
      context.persistDetail(module.id, "concept-explore", detail);
      renderConceptExplorer(detail, module, context);
    }
  });
}

function moveBoardToIdeas({ detail, module, context, index }) {
  const board = detail.boards?.[index];
  if (!board) {
    return;
  }
  const modal = openModal("Move to Ideas");
  const form = document.createElement("form");
  form.className = "modal-form";
  const label = createElement("label");
  label.appendChild(createElement("span", { text: "Reason / comment (optional)" }));
  const input = document.createElement("textarea");
  input.rows = 3;
  input.placeholder = "Why is this moving back to ideas?";
  label.appendChild(input);
  form.appendChild(label);
  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const confirmBtn = createElement("button", { classes: "primary-button", text: "Move" });
  confirmBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  form.appendChild(actions);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const activeVersion = getActiveVersion(board) || {};
    detail.ideas = Array.isArray(detail.ideas) ? detail.ideas : [];
    detail.ideas.unshift({
      id: generateId("idea"),
      title: board.title || "Concept",
      logline: activeVersion.logline || board.logline || "",
      description: activeVersion.narrative || "",
      status: "draft",
      tags: ["From Concept"],
      demoteReason: input.value.trim()
    });
    detail.boards.splice(index, 1);
    context.persistDetail(module.id, "concept-explore", detail);
    modal.close();
    renderConceptExplorer(detail, module, context);
  });
  modal.body.appendChild(form);
}

function removeBoard({ detail, module, context, index }) {
  const board = detail.boards?.[index];
  if (!board) {
    return;
  }
  openConfirmModal({
    title: "Remove concept board?",
    message: "This will permanently delete the board and its versions.",
    confirmLabel: "Remove",
    onConfirm: () => {
      detail.boards.splice(index, 1);
      context.persistDetail(module.id, "concept-explore", detail);
      renderConceptExplorer(detail, module, context);
    }
  });
}
