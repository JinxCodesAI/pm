import { createElement } from "../../utils.js";
import {
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
import { generateSceneBeatDraft } from "./ai.js";

export function renderSceneOutline(detail, module, context) {
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

  const boards = getConceptBoards(context);
  const anchors = getBriefAnchors(context);
  const personas = getPersonaVoices(context);

  if (!detail.selectedBoardId && boards.length) {
    detail.selectedBoardId = boards[0].id;
    context.persistDetail(module.id, "scene-outline", detail);
  }

  const selectedBoard = boards.find((board) => board.id === detail.selectedBoardId) || boards[0] || null;
  const activeVersion = selectedBoard ? getActiveBoardVersion(selectedBoard) : null;

  renderConceptBridge({ body, detail, module, context, boards, selectedBoard, activeVersion, anchors });
  renderSceneBlueprint({ body, detail, module, context, selectedBoard, activeVersion });
  renderReferencePanel({ body, anchors, personas, activeVersion });
}

function renderConceptBridge({
  body,
  detail,
  module,
  context,
  boards,
  selectedBoard,
  activeVersion,
  anchors
}) {
  const heading = createSectionHeading(
    "Concept Bridge",
    "Carry the approved concept into a scene-by-scene roadmap."
  );

  const wrapper = createElement("div", { classes: "script-bridge" });

  if (!boards.length) {
    const empty = createElement("div", {
      classes: "empty-card",
      text: "No concept boards available. Finalize a concept in Concept Studio to unlock the outline."
    });
    wrapper.appendChild(empty);
    body.appendChild(heading);
    body.appendChild(wrapper);
    return;
  }

  const picker = createElement("div", { classes: "script-bridge-picker" });
  const pickerLabel = createElement("label");
  pickerLabel.appendChild(createElement("span", { text: "Concept Board" }));
  const select = document.createElement("select");
  boards.forEach((board) => {
    const option = document.createElement("option");
    option.value = board.id;
    option.textContent = board.title || "Concept Board";
    if (board.id === detail.selectedBoardId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    detail.selectedBoardId = select.value;
    context.persistDetail(module.id, "scene-outline", detail);
    renderSceneOutline(detail, module, context);
  });
  pickerLabel.appendChild(select);
  picker.appendChild(pickerLabel);

  if (activeVersion?.keyVisuals?.length) {
    const syncBtn = createActionButton("Pull Key Visuals", () => {
      populateScenesFromKeyVisuals({ detail, module, context, board: selectedBoard, version: activeVersion });
    });
    syncBtn.classList.add("primary-chip");
    picker.appendChild(syncBtn);
  }

  wrapper.appendChild(picker);

  const boardSummary = createElement("div", { classes: "script-bridge-summary" });
  if (selectedBoard) {
    boardSummary.appendChild(
      createElement("h4", { text: selectedBoard.title || "Concept Board" })
    );
    if (selectedBoard.status) {
      boardSummary.appendChild(
        createElement("p", { classes: "muted", text: `Status: ${selectedBoard.status}` })
      );
    }
    if (activeVersion?.logline) {
      boardSummary.appendChild(createElement("p", { text: activeVersion.logline }));
    }
    if (activeVersion?.strategyLink) {
      boardSummary.appendChild(
        createElement("p", { classes: "muted", text: `Strategy Link: ${activeVersion.strategyLink}` })
      );
    }
    if (activeVersion?.anchorSummary?.length || anchors.length) {
      const anchorList = createElement("ul", { classes: "script-anchor-list" });
      const mergedAnchors = new Map();
      (activeVersion?.anchorSummary || []).forEach((line) => {
        mergedAnchors.set(line, "From Concept Studio");
      });
      anchors.forEach((line) => {
        if (!mergedAnchors.has(line)) {
          mergedAnchors.set(line, "From Discover & Brief");
        }
      });
      mergedAnchors.forEach((source, line) => {
        const item = createElement("li");
        item.appendChild(createElement("span", { text: line }));
        item.appendChild(createElement("small", { classes: "muted", text: source }));
        anchorList.appendChild(item);
      });
      boardSummary.appendChild(anchorList);
    }
    if (activeVersion?.keyVisuals?.length) {
      const visuals = createElement("div", { classes: "script-visual-grid" });
      activeVersion.keyVisuals.slice(0, 4).forEach((visual) => {
        visuals.appendChild(createElement("span", { classes: "tag-chip", text: visual }));
      });
      if (activeVersion.keyVisuals.length > 4) {
        visuals.appendChild(
          createElement("span", {
            classes: "tag-chip muted",
            text: `+${activeVersion.keyVisuals.length - 4} more`
          })
        );
      }
      boardSummary.appendChild(visuals);
    }
  }
  wrapper.appendChild(boardSummary);

  body.appendChild(heading);
  body.appendChild(wrapper);
}

function renderSceneBlueprint({ body, detail, module, context, selectedBoard, activeVersion }) {
  const heading = createSectionHeading(
    "Scene Blueprint",
    detail.beats?.length
      ? "Refine each beat with purpose, visuals, and production notes."
      : "Start laying out beats. Pull key visuals from the concept or add scenes manually."
  );

  const addSceneBtn = createActionButton("Add Scene", () => openSceneEditor({ detail, module, context }));
  addSceneBtn.classList.add("primary-chip");
  heading.appendChild(addSceneBtn);

  if (selectedBoard && activeVersion?.keyVisuals?.length) {
    const addFromConceptBtn = createActionButton("Add Key Visual Scenes", () => {
      populateScenesFromKeyVisuals({ detail, module, context, board: selectedBoard, version: activeVersion });
    });
    heading.appendChild(addFromConceptBtn);
  }

  body.appendChild(heading);

  const list = createElement("div", { classes: "scene-outline-list" });
  const scenes = detail.beats || [];

  if (!scenes.length) {
    list.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No scenes mapped yet. Add beats to show how the concept unfolds frame by frame."
      })
    );
    body.appendChild(list);
    return;
  }

  scenes.forEach((scene, index) => {
    const card = createElement("article", { classes: "scene-card" });
    card.appendChild(createElement("h4", { text: scene.title || `Scene ${index + 1}` }));

    const meta = createElement("div", { classes: "scene-card-meta" });
    meta.appendChild(createElement("span", { classes: "tag-chip", text: `#${index + 1}` }));
    if (scene.duration) {
      meta.appendChild(createElement("span", { classes: "tag-chip", text: scene.duration }));
    }
    if (scene.source?.keyVisual) {
      meta.appendChild(
        createElement("span", { classes: "tag-chip", text: `Concept: ${scene.source.keyVisual}` })
      );
    }
    card.appendChild(meta);

    if (scene.purpose) {
      card.appendChild(createElement("p", { classes: "muted", text: scene.purpose }));
    }
    if (scene.visualFocus) {
      card.appendChild(createElement("p", { text: scene.visualFocus }));
    }
    if (scene.notes) {
      card.appendChild(createElement("p", { classes: "muted", text: `Notes: ${scene.notes}` }));
    }
    if (scene.aiGuidance) {
      card.appendChild(
        createElement("p", { classes: ["muted", "ai-guidance"], text: `AI Guidance: ${scene.aiGuidance}` })
      );
    }
    if (scene.anchors?.length) {
      const anchorsList = createElement("ul", { classes: "scene-anchor-list" });
      scene.anchors.slice(0, 3).forEach((anchor) => {
        anchorsList.appendChild(createElement("li", { text: anchor }));
      });
      if (scene.anchors.length > 3) {
        anchorsList.appendChild(
          createElement("li", { classes: "muted", text: `+${scene.anchors.length - 3} more anchors` })
        );
      }
      card.appendChild(anchorsList);
    }

    const actions = createElement("div", { classes: "scene-card-actions" });
    actions.appendChild(
      createActionButton("Edit", () => openSceneEditor({ detail, module, context, scene, index }))
    );
    actions.appendChild(
      createActionButton("Remove", () => removeScene({ detail, module, context, index }))
    );
    card.appendChild(actions);

    list.appendChild(card);
  });

  body.appendChild(list);
}

function renderReferencePanel({ body, anchors, personas, activeVersion }) {
  const heading = createSectionHeading(
    "Reference Library",
    "Keep brief anchors, persona voices, and concept moments within reach."
  );
  body.appendChild(heading);

  const grid = createElement("div", { classes: "script-reference-grid" });

  const anchorCard = createElement("div", { classes: "script-reference-card" });
  anchorCard.appendChild(createElement("h5", { text: "Brief Anchors" }));
  if (anchors.length) {
    const list = createElement("ul");
    anchors.slice(0, 5).forEach((anchor) => list.appendChild(createElement("li", { text: anchor })));
    anchorCard.appendChild(list);
  } else {
    anchorCard.appendChild(createElement("p", { classes: "muted", text: "Add a summary in Discover & Brief." }));
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

  const visualCard = createElement("div", { classes: "script-reference-card" });
  visualCard.appendChild(createElement("h5", { text: "Concept Key Visuals" }));
  if (activeVersion?.keyVisuals?.length) {
    const list = createElement("ul");
    activeVersion.keyVisuals.forEach((visual) => list.appendChild(createElement("li", { text: visual })));
    visualCard.appendChild(list);
  } else {
    visualCard.appendChild(
      createElement("p", { classes: "muted", text: "Promote a concept to surface key visuals." })
    );
  }
  grid.appendChild(visualCard);

  body.appendChild(grid);
}

function openSceneEditor({ detail, module, context, scene = null, index = null }) {
  const isEdit = Boolean(scene && index !== null && index >= 0);
  const modal = openModal(isEdit ? "Edit Scene" : "Add Scene", { dialogClass: "modal-dialog-wide" });

  const beats = Array.isArray(detail.beats) ? detail.beats : [];
  const boards = getConceptBoards(context);
  const selectedBoard = boards.find((board) => board.id === detail.selectedBoardId) || boards[0] || null;
  const activeVersion = selectedBoard ? getActiveBoardVersion(selectedBoard) : null;
  const anchors = getBriefAnchors(context);
  const personas = getPersonaVoices(context);
  const beatsWithoutCurrent = isEdit
    ? beats.filter((_, beatIndex) => beatIndex !== index)
    : beats;
  const usedVisuals = new Set(
    beatsWithoutCurrent
      .map((beat) => beat.source?.keyVisual || beat.visualFocus || "")
      .filter(Boolean)
  );
  const candidateVisuals = Array.isArray(activeVersion?.keyVisuals) ? activeVersion.keyVisuals : [];
  const nextVisual =
    candidateVisuals.find((visual) => !usedVisuals.has(visual)) || scene?.source?.keyVisual || "";
  const scenePosition = isEdit && index !== null ? index : beats.length;

  const form = document.createElement("form");
  form.className = "modal-form";

  const titleLabel = createElement("label");
  titleLabel.appendChild(createElement("span", { text: "Scene Title" }));
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = scene?.title || "";
  titleInput.placeholder = "e.g. Morning Routine Montage";
  titleLabel.appendChild(titleInput);
  form.appendChild(titleLabel);

  const purposeLabel = createElement("label");
  purposeLabel.appendChild(createElement("span", { text: "Scene Purpose" }));
  const purposeInput = document.createElement("textarea");
  purposeInput.rows = 3;
  purposeInput.value = scene?.purpose || "";
  purposeInput.placeholder = "What decision or emotion does this beat drive?";
  purposeLabel.appendChild(purposeInput);
  form.appendChild(purposeLabel);

  const visualLabel = createElement("label");
  visualLabel.appendChild(createElement("span", { text: "Visual Focus" }));
  const visualInput = document.createElement("textarea");
  visualInput.rows = 3;
  visualInput.value = scene?.visualFocus || "";
  visualInput.placeholder = "Key imagery or camera moves to capture.";
  visualLabel.appendChild(visualInput);
  form.appendChild(visualLabel);

  const durationLabel = createElement("label");
  durationLabel.appendChild(createElement("span", { text: "Estimated Duration" }));
  const durationInput = document.createElement("input");
  durationInput.type = "text";
  durationInput.placeholder = "e.g. 12 seconds";
  durationInput.value = scene?.duration || "";
  durationLabel.appendChild(durationInput);
  form.appendChild(durationLabel);

  const notesLabel = createElement("label");
  notesLabel.appendChild(createElement("span", { text: "Notes & Production Cues" }));
  const notesInput = document.createElement("textarea");
  notesInput.rows = 3;
  notesInput.value = scene?.notes || "";
  notesInput.placeholder = "Add cues for camera, VFX, SFX, or performance.";
  notesLabel.appendChild(notesInput);
  form.appendChild(notesLabel);

  const anchorsLabel = createElement("label");
  anchorsLabel.appendChild(createElement("span", { text: "Anchor References (optional)" }));
  const anchorsInput = document.createElement("textarea");
  anchorsInput.rows = 3;
  anchorsInput.placeholder = "List brief insights or critique notes to honour.";
  anchorsInput.value = (scene?.anchors || []).join("\n");
  anchorsLabel.appendChild(anchorsInput);
  form.appendChild(anchorsLabel);

  const guidanceDefault = scene?.aiGuidance || detail.lastSceneGuidance || "";
  let currentSource = {
    boardId: scene?.source?.boardId || selectedBoard?.id || "",
    versionId: scene?.source?.versionId || activeVersion?.id || "",
    keyVisual: scene?.source?.keyVisual || ""
  };

  const assist = createElement("div", { classes: "scene-ai-assist" });
  assist.appendChild(
    createElement("p", {
      classes: "muted",
      text: "Let the AI draft or revise this beat using your guidance and upstream artifacts."
    })
  );

  const guidanceLabel = createElement("label");
  guidanceLabel.appendChild(
    createElement("span", {
      text: isEdit ? "Revision guidance for AI (optional)" : "Guidance for AI (optional)"
    })
  );
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.placeholder = "e.g. Increase tension before the reveal and highlight product benefits.";
  guidanceInput.value = guidanceDefault;
  guidanceLabel.appendChild(guidanceInput);
  assist.appendChild(guidanceLabel);

  const assistActions = createElement("div", { classes: "scene-ai-assist-actions" });
  const assistBtn = document.createElement("button");
  assistBtn.type = "button";
  assistBtn.className = "ghost-button";
  assistBtn.textContent = isEdit ? "Revise with AI" : "Draft with AI";
  assistBtn.addEventListener("click", () => {
    const suggestion = generateSceneBeatDraft({
      instructions: guidanceInput.value,
      anchors,
      personas,
      conceptLogline: activeVersion?.logline || "",
      keyVisual: nextVisual,
      boardTitle: selectedBoard?.title || "",
      boardId: selectedBoard?.id || "",
      versionId: activeVersion?.id || "",
      sceneIndex: scenePosition,
      existingScene: scene,
      beats: beatsWithoutCurrent
    });

    if (suggestion.title) {
      titleInput.value = suggestion.title;
    }
    if (suggestion.purpose) {
      purposeInput.value = suggestion.purpose;
    }
    if (suggestion.visualFocus) {
      visualInput.value = suggestion.visualFocus;
    }
    if (suggestion.notes !== undefined) {
      notesInput.value = suggestion.notes;
    }
    if (suggestion.duration) {
      durationInput.value = suggestion.duration;
    }
    if (Array.isArray(suggestion.anchors)) {
      anchorsInput.value = suggestion.anchors.join("\n");
    }
    if (suggestion.source) {
      currentSource = {
        boardId: suggestion.source.boardId || currentSource.boardId || selectedBoard?.id || "",
        versionId:
          suggestion.source.versionId || currentSource.versionId || activeVersion?.id || "",
        keyVisual: suggestion.source.keyVisual || currentSource.keyVisual || nextVisual || ""
      };
    }
    if (suggestion.aiGuidance) {
      guidanceInput.value = suggestion.aiGuidance;
    }

    detail.lastSceneGuidance = guidanceInput.value.trim();
    context.persistDetail(module.id, "scene-outline", detail);
    assistBtn.textContent = isEdit ? "AI revision applied" : "AI draft applied";
    setTimeout(() => {
      assistBtn.textContent = isEdit ? "Revise with AI" : "Draft with AI";
    }, 1200);
  });
  assistActions.appendChild(assistBtn);
  assist.appendChild(assistActions);
  form.appendChild(assist);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const submitBtn = createElement("button", { classes: "primary-button", text: isEdit ? "Save Scene" : "Add Scene" });
  submitBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const aiGuidance = guidanceInput.value.trim();
    detail.lastSceneGuidance = aiGuidance;
    const payload = {
      id: scene?.id || generateId("scene"),
      title: titleInput.value.trim() || (scene?.title || "Scene"),
      purpose: purposeInput.value.trim(),
      visualFocus: visualInput.value.trim(),
      duration: durationInput.value.trim(),
      notes: notesInput.value.trim(),
      anchors: anchorsInput.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      source: {
        boardId: currentSource.boardId || selectedBoard?.id || "",
        versionId: currentSource.versionId || activeVersion?.id || "",
        keyVisual: currentSource.keyVisual || ""
      },
      aiGuidance
    };

    detail.beats = detail.beats || [];
    if (isEdit) {
      detail.beats.splice(index, 1, payload);
    } else {
      detail.beats.push(payload);
    }
    detail.lastSync = new Date().toLocaleString();
    context.persistDetail(module.id, "scene-outline", detail);
    showToast(isEdit ? "Scene updated." : "Scene added.");
    modal.close();
    renderSceneOutline(detail, module, context);
  });

  modal.body.appendChild(form);
  titleInput.focus();
}

function removeScene({ detail, module, context, index }) {
  openConfirmModal({
    title: "Remove Scene",
    message: "Remove this scene from the outline?",
    confirmLabel: "Remove",
    onConfirm: () => {
      detail.beats.splice(index, 1);
      detail.lastSync = new Date().toLocaleString();
      context.persistDetail(module.id, "scene-outline", detail);
      showToast("Scene removed.");
      renderSceneOutline(detail, module, context);
    }
  });
}

function populateScenesFromKeyVisuals({ detail, module, context, board, version }) {
  if (!board || !version?.keyVisuals?.length) {
    return;
  }
  const existingVisuals = new Set(
    (detail.beats || []).map((scene) => scene.source?.keyVisual || scene.visualFocus || "")
  );
  let added = 0;
  version.keyVisuals.forEach((visual) => {
    if (!visual) {
      return;
    }
    if (existingVisuals.has(visual)) {
      return;
    }
    const scene = {
      id: generateId("scene"),
      title: visual.length > 60 ? `${visual.slice(0, 57)}…` : visual,
      purpose: "",
      visualFocus: visual,
      duration: "",
      notes: "",
      anchors: version.anchorSummary || [],
      source: {
        boardId: board.id,
        versionId: version.id,
        keyVisual: visual
      }
    };
    detail.beats.push(scene);
    added += 1;
  });
  if (!added) {
    showToast("All key visuals are already represented in the outline.");
    return;
  }
  detail.lastSync = new Date().toLocaleString();
  context.persistDetail(module.id, "scene-outline", detail);
  showToast(`${added} scene${added === 1 ? "" : "s"} added from concept.`);
  renderSceneOutline(detail, module, context);
}
