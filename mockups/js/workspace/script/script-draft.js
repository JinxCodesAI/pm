import { createElement } from "../../utils.js";
import {
  clone,
  createActionButton,
  createSectionHeading,
  getStepBody,
  openConfirmModal,
  openModal,
  renderDefaultStepBody,
  showToast
} from "../helpers.js";
import {
  generateId,
  getActiveBoardVersion,
  getBriefAnchors,
  getConceptBoards,
  getPersonaVoices
} from "./support.js";

export function renderScriptDraft(detail, module, context) {
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

  const outlineDetail = context.ensureStepDetail(module, "scene-outline");
  const anchors = getBriefAnchors(context);
  const personas = getPersonaVoices(context);
  const boards = getConceptBoards(context);
  const selectedBoard = boards.find((board) => board.id === outlineDetail.selectedBoardId) || null;
  const activeVersion = selectedBoard ? getActiveBoardVersion(selectedBoard) : null;

  renderDraftGenerator({
    body,
    detail,
    module,
    context,
    outlineDetail,
    anchors,
    personas,
    selectedBoard,
    activeVersion
  });
  renderDraftList({
    body,
    detail,
    module,
    context
  });
  renderDraftReferencePanel({
    body,
    outlineDetail,
    anchors,
    personas,
    selectedBoard,
    activeVersion
  });
}

function renderDraftGenerator({
  body,
  detail,
  module,
  context,
  outlineDetail,
  anchors,
  personas,
  selectedBoard,
  activeVersion
}) {
  const hasScenes = Array.isArray(outlineDetail?.beats) && outlineDetail.beats.length > 0;

  const heading = createSectionHeading(
    "Draft Generator",
    hasScenes
      ? "Launch a script draft seeded with your scene outline and concept notes."
      : "Build a scene outline first to unlock the drafting workspace."
  );

  const wrapper = createElement("div", { classes: "script-generator" });

  const copy = createElement("div", { classes: "script-generator-copy" });
  copy.appendChild(
    createElement("p", {
      classes: "muted",
      text: hasScenes
        ? "The AI respects your outline beats, brief anchors, and concept visuals when drafting."
        : "Create at least one scene in the outline to seed the draft."
    })
  );
  if (anchors.length) {
    const list = createElement("ul", { classes: "script-generator-anchors" });
    anchors.slice(0, 4).forEach((anchor) => list.appendChild(createElement("li", { text: anchor })));
    copy.appendChild(list);
  }
  if (personas.length) {
    copy.appendChild(
      createElement("p", { classes: "muted", text: `Voices to honour: ${personas.join(", ")}` })
    );
  }
  if (activeVersion?.logline) {
    copy.appendChild(createElement("p", { text: `Concept Logline: ${activeVersion.logline}` }));
  }
  wrapper.appendChild(copy);

  const controls = createElement("div", { classes: "script-generator-controls" });
  const guidanceLabel = createElement("label");
  guidanceLabel.appendChild(createElement("span", { text: "Guidance for the AI (optional)" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.placeholder = "e.g. Keep dialogue punchy and include product cues in scene two.";
  guidanceInput.value = detail.lastGuidance || "";
  guidanceLabel.appendChild(guidanceInput);
  controls.appendChild(guidanceLabel);

  const actionRow = createElement("div", { classes: "script-generator-actions" });
  const generateBtn = document.createElement("button");
  generateBtn.type = "button";
  generateBtn.className = "primary-button";
  generateBtn.textContent = hasScenes ? "Start Script Draft" : "Outline Required";
  generateBtn.disabled = !hasScenes;
  generateBtn.addEventListener("click", () => {
    if (!hasScenes || generateBtn.dataset.loading === "true") {
      return;
    }
    generateBtn.dataset.loading = "true";
    generateBtn.textContent = "Generating…";
    window.setTimeout(() => {
      startDraft({
        detail,
        module,
        context,
        outlineDetail,
        guidance: guidanceInput.value.trim(),
        selectedBoard,
        activeVersion
      });
      generateBtn.dataset.loading = "false";
      generateBtn.textContent = "Start Script Draft";
    }, 120);
  });
  actionRow.appendChild(generateBtn);

  const duplicateBtn = createElement("button", { classes: "ghost-button", text: "Duplicate Active Draft" });
  duplicateBtn.type = "button";
  duplicateBtn.disabled = !detail.activeDraftId;
  duplicateBtn.addEventListener("click", () => {
    const activeDraft = detail.drafts?.find((draft) => draft.id === detail.activeDraftId);
    if (!activeDraft) {
      return;
    }
    duplicateDraft({ detail, module, context, draft: activeDraft });
  });
  actionRow.appendChild(duplicateBtn);
  controls.appendChild(actionRow);

  if (detail.lastRun) {
    controls.appendChild(createElement("p", { classes: "muted", text: `Last generation ${detail.lastRun}` }));
  }

  wrapper.appendChild(controls);
  body.appendChild(heading);
  body.appendChild(wrapper);
}

function startDraft({ detail, module, context, outlineDetail, guidance, selectedBoard, activeVersion }) {
  const beats = Array.isArray(outlineDetail?.beats) ? outlineDetail.beats : [];
  if (!beats.length) {
    showToast("Add scenes in the outline first.");
    return;
  }
  const timestamp = new Date().toLocaleString();
  const scenes = beats.map((beat, index) => ({
    id: generateId("draft-scene"),
    heading: beat.title || `Scene ${index + 1}`,
    summary: beat.purpose || beat.visualFocus || "",
    script: "",
    cues: beat.notes ? beat.notes.split(/\n+/).map((line) => line.trim()).filter(Boolean) : [],
    sourceSceneId: beat.id || ""
  }));
  const outlineSnapshot = beats.map((beat, index) => {
    const parts = [
      `Scene ${index + 1}: ${beat.title || "Untitled"}`,
      beat.purpose || beat.visualFocus || ""
    ].filter(Boolean);
    return parts.join(" — ");
  });
  const draft = {
    id: generateId("draft"),
    label: `Draft v${detail.drafts.length + 1}`,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    outlineSnapshot,
    aiGuidance: guidance,
    notes: selectedBoard ? `Based on ${selectedBoard.title}` : "",
    scenes,
    exports: [],
    conceptVersionId: activeVersion?.id || ""
  };
  detail.drafts = detail.drafts || [];
  detail.drafts.unshift(draft);
  detail.activeDraftId = draft.id;
  detail.lastGuidance = guidance;
  detail.lastRun = timestamp;
  context.persistDetail(module.id, "script-draft", detail);
  showToast("Draft created from outline.");
  renderScriptDraft(detail, module, context);
}

function renderDraftList({ body, detail, module, context }) {
  const heading = createSectionHeading(
    "Draft Versions",
    detail.drafts?.length
      ? "Track iterations, edit scenes, and mark the draft ready for client review."
      : "Generate a draft to unlock version history and revision tracking."
  );
  body.appendChild(heading);

  const list = createElement("div", { classes: "script-draft-list" });
  const drafts = detail.drafts || [];

  if (!drafts.length) {
    list.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No script drafts yet. Generate one above to start writing."
      })
    );
    body.appendChild(list);
    return;
  }

  drafts.forEach((draft) => {
    const card = createElement("article", {
      classes: ["script-draft-card", draft.status === "archived" ? "is-archived" : ""]
    });

    const header = createElement("div", { classes: "script-draft-card-header" });
    header.appendChild(createElement("h4", { text: draft.label || "Draft" }));
    const statusPill = createElement("span", { classes: ["pill", `status-${draft.status}`] });
    statusPill.textContent =
      draft.status === "client-ready"
        ? "Client Ready"
        : draft.status === "in-review"
        ? "In Review"
        : draft.status === "archived"
        ? "Archived"
        : "Draft";
    header.appendChild(statusPill);
    card.appendChild(header);

    const meta = createElement("p", {
      classes: "muted",
      text: [draft.createdAt ? `Created ${draft.createdAt}` : "", draft.updatedAt ? `Updated ${draft.updatedAt}` : ""]
        .filter(Boolean)
        .join(" · ")
    });
    card.appendChild(meta);

    if (draft.aiGuidance) {
      card.appendChild(createElement("p", { classes: "muted", text: `Guidance: ${draft.aiGuidance}` }));
    }
    if (draft.outlineSnapshot?.length) {
      const scenePreview = createElement("ul", { classes: "script-draft-scenes" });
      draft.outlineSnapshot.slice(0, 3).forEach((line) => {
        scenePreview.appendChild(createElement("li", { text: line }));
      });
      if (draft.outlineSnapshot.length > 3) {
        scenePreview.appendChild(
          createElement("li", { classes: "muted", text: `+${draft.outlineSnapshot.length - 3} more scenes` })
        );
      }
      card.appendChild(scenePreview);
    }

    if (draft.notes) {
      card.appendChild(createElement("p", { classes: "muted", text: draft.notes }));
    }

    const actions = createElement("div", { classes: "script-draft-actions" });
    actions.appendChild(createActionButton("Open Draft", () => openDraftEditor({ detail, module, context, draft })));
    actions.appendChild(
      createActionButton(
        draft.status === "client-ready" ? "Reopen" : "Mark Client Ready",
        () => toggleDraftStatus({
          detail,
          module,
          context,
          draft,
          status: draft.status === "client-ready" ? "draft" : "client-ready"
        })
      )
    );
    actions.appendChild(createActionButton("Duplicate", () => duplicateDraft({ detail, module, context, draft })));
    actions.appendChild(createActionButton("Remove", () => removeDraft({ detail, module, context, draft })));
    card.appendChild(actions);

    list.appendChild(card);
  });

  body.appendChild(list);
}

function openDraftEditor({ detail, module, context, draft }) {
  const modal = openModal("Edit Script Draft", { dialogClass: "modal-dialog-wide" });
  const form = document.createElement("form");
  form.className = "modal-form";

  const labelField = createElement("label");
  labelField.appendChild(createElement("span", { text: "Draft Label" }));
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.value = draft.label || "";
  labelField.appendChild(labelInput);
  form.appendChild(labelField);

  const statusField = createElement("label");
  statusField.appendChild(createElement("span", { text: "Status" }));
  const statusSelect = document.createElement("select");
  [
    ["draft", "Draft"],
    ["in-review", "In Review"],
    ["client-ready", "Client Ready"],
    ["archived", "Archived"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (draft.status === value) {
      option.selected = true;
    }
    statusSelect.appendChild(option);
  });
  statusField.appendChild(statusSelect);
  form.appendChild(statusField);

  const notesField = createElement("label");
  notesField.appendChild(createElement("span", { text: "Production Notes" }));
  const notesInput = document.createElement("textarea");
  notesInput.rows = 3;
  notesInput.value = draft.notes || "";
  notesInput.placeholder = "Log approvals, client feedback, or revision rationale.";
  notesField.appendChild(notesInput);
  form.appendChild(notesField);

  const scenesWrapper = createElement("div", { classes: "script-draft-editor-scenes" });
  scenesWrapper.appendChild(createElement("h4", { text: "Scene Scripts" }));

  (draft.scenes || []).forEach((scene) => {
    const sceneBlock = createElement("section", { classes: "script-draft-scene" });
    sceneBlock.dataset.sceneId = scene.id;
    sceneBlock.appendChild(createElement("h5", { text: scene.heading || "Scene" }));
    if (scene.summary) {
      sceneBlock.appendChild(createElement("p", { classes: "muted", text: scene.summary }));
    }

    const scriptLabel = createElement("label");
    scriptLabel.appendChild(createElement("span", { text: "Script" }));
    const scriptArea = document.createElement("textarea");
    scriptArea.rows = 6;
    scriptArea.value = scene.script || "";
    scriptArea.placeholder = "Write the action and dialogue for this beat.";
    scriptArea.dataset.sceneId = scene.id;
    scriptArea.dataset.field = "script";
    scriptLabel.appendChild(scriptArea);
    sceneBlock.appendChild(scriptLabel);

    const cueLabel = createElement("label");
    cueLabel.appendChild(createElement("span", { text: "Production Cues" }));
    const cueArea = document.createElement("textarea");
    cueArea.rows = 3;
    cueArea.value = (scene.cues || []).join("\n");
    cueArea.placeholder = "Add CAMERA, VFX, SFX, or MUSIC notes.";
    cueArea.dataset.sceneId = scene.id;
    cueArea.dataset.field = "cues";
    cueLabel.appendChild(cueArea);
    sceneBlock.appendChild(cueLabel);

    scenesWrapper.appendChild(sceneBlock);
  });

  form.appendChild(scenesWrapper);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const saveBtn = createElement("button", { classes: "primary-button", text: "Save Draft" });
  saveBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    draft.label = labelInput.value.trim() || draft.label || "Draft";
    draft.status = statusSelect.value;
    draft.notes = notesInput.value.trim();

    const updatedScenes = (draft.scenes || []).map((scene) => {
      const scriptArea = form.querySelector(
        `textarea[data-field="script"][data-scene-id="${scene.id}"]`
      );
      const cueArea = form.querySelector(
        `textarea[data-field="cues"][data-scene-id="${scene.id}"]`
      );
      return {
        ...scene,
        script: scriptArea ? scriptArea.value.trim() : scene.script || "",
        cues: cueArea
          ? cueArea.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
          : Array.isArray(scene.cues)
          ? scene.cues.filter(Boolean)
          : []
      };
    });

    draft.scenes = updatedScenes;
    draft.updatedAt = new Date().toLocaleString();
    detail.activeDraftId = draft.id;
    context.persistDetail(module.id, "script-draft", detail);
    showToast("Draft saved.");
    modal.close();
    renderScriptDraft(detail, module, context);
  });

  modal.body.appendChild(form);
  labelInput.focus();
}

function toggleDraftStatus({ detail, module, context, draft, status }) {
  if (!draft || draft.status === status) {
    return;
  }
  draft.status = status;
  draft.updatedAt = new Date().toLocaleString();
  detail.activeDraftId = draft.id;
  context.persistDetail(module.id, "script-draft", detail);
  showToast(status === "client-ready" ? "Marked client ready." : "Draft status updated.");
  renderScriptDraft(detail, module, context);
}

function duplicateDraft({ detail, module, context, draft }) {
  if (!draft) {
    return;
  }
  const timestamp = new Date().toLocaleString();
  const copy = clone(draft);
  copy.id = generateId("draft");
  copy.label = `${draft.label || "Draft"} Copy`;
  copy.status = "draft";
  copy.createdAt = timestamp;
  copy.updatedAt = timestamp;
  copy.aiGuidance = draft.aiGuidance || "";
  copy.scenes = (draft.scenes || []).map((scene) => ({
    ...scene,
    id: generateId("draft-scene"),
    script: scene.script || "",
    cues: Array.isArray(scene.cues) ? scene.cues.filter(Boolean) : []
  }));
  detail.drafts = detail.drafts || [];
  detail.drafts.unshift(copy);
  detail.activeDraftId = copy.id;
  context.persistDetail(module.id, "script-draft", detail);
  showToast("Draft duplicated.");
  renderScriptDraft(detail, module, context);
}

function removeDraft({ detail, module, context, draft }) {
  if (!draft) {
    return;
  }
  openConfirmModal({
    title: "Remove Draft",
    message: "Remove this script draft and its notes?",
    confirmLabel: "Remove",
    onConfirm: () => {
      detail.drafts = (detail.drafts || []).filter((item) => item.id !== draft.id);
      if (detail.activeDraftId === draft.id) {
        detail.activeDraftId = detail.drafts[0]?.id || null;
      }
      context.persistDetail(module.id, "script-draft", detail);
      showToast("Draft removed.");
      renderScriptDraft(detail, module, context);
    }
  });
}

function renderDraftReferencePanel({ body, outlineDetail, anchors, personas, selectedBoard, activeVersion }) {
  const heading = createSectionHeading(
    "Draft Reference",
    "Keep your upstream artifacts visible while writing."
  );
  body.appendChild(heading);

  const grid = createElement("div", { classes: "script-reference-grid" });

  const outlineCard = createElement("div", { classes: "script-reference-card" });
  outlineCard.appendChild(createElement("h5", { text: "Scene Outline" }));
  const beats = Array.isArray(outlineDetail?.beats) ? outlineDetail.beats : [];
  if (beats.length) {
    const list = createElement("ol");
    beats.slice(0, 5).forEach((beat, index) => {
      const label = beat.title || `Scene ${index + 1}`;
      const text = beat.purpose || beat.visualFocus || "";
      const item = createElement("li");
      item.appendChild(createElement("strong", { text: label }));
      if (text) {
        item.appendChild(createElement("span", { classes: "muted", text: ` — ${text}` }));
      }
      list.appendChild(item);
    });
    if (beats.length > 5) {
      list.appendChild(createElement("li", { classes: "muted", text: `+${beats.length - 5} more scenes` }));
    }
    outlineCard.appendChild(list);
  } else {
    outlineCard.appendChild(createElement("p", { classes: "muted", text: "Add scenes in the outline step." }));
  }
  grid.appendChild(outlineCard);

  const anchorCard = createElement("div", { classes: "script-reference-card" });
  anchorCard.appendChild(createElement("h5", { text: "Brief Anchors" }));
  if (anchors.length) {
    const list = createElement("ul");
    anchors.slice(0, 5).forEach((anchor) => list.appendChild(createElement("li", { text: anchor })));
    anchorCard.appendChild(list);
  } else {
    anchorCard.appendChild(createElement("p", { classes: "muted", text: "Sync insights from Discover & Brief." }));
  }
  grid.appendChild(anchorCard);

  const personaCard = createElement("div", { classes: "script-reference-card" });
  personaCard.appendChild(createElement("h5", { text: "Persona Voices" }));
  if (personas.length) {
    const list = createElement("ul");
    personas.forEach((persona) => list.appendChild(createElement("li", { text: persona })));
    personaCard.appendChild(list);
  } else {
    personaCard.appendChild(createElement("p", { classes: "muted", text: "Approve personas to capture tone." }));
  }
  grid.appendChild(personaCard);

  const conceptCard = createElement("div", { classes: "script-reference-card" });
  conceptCard.appendChild(createElement("h5", { text: "Concept Cues" }));
  if (selectedBoard && activeVersion) {
    conceptCard.appendChild(
      createElement("p", { classes: "muted", text: selectedBoard.title || "Concept Board" })
    );
    if (activeVersion.keyVisuals?.length) {
      const list = createElement("ul");
      activeVersion.keyVisuals.slice(0, 4).forEach((visual) => list.appendChild(createElement("li", { text: visual })));
      if (activeVersion.keyVisuals.length > 4) {
        list.appendChild(
          createElement("li", { classes: "muted", text: `+${activeVersion.keyVisuals.length - 4} more visuals` })
        );
      }
      conceptCard.appendChild(list);
    } else {
      conceptCard.appendChild(createElement("p", { classes: "muted", text: "Add key visuals to the concept board." }));
    }
  } else {
    conceptCard.appendChild(
      createElement("p", { classes: "muted", text: "Promote a concept board to feed scripting." })
    );
  }
  grid.appendChild(conceptCard);

  body.appendChild(grid);
}
