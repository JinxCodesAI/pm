import { getProjectById, saveStepDetail } from "./data-service.js";
import { initGlobalNav } from "./navigation.js";
import { parseQuery, applyPill, formatStatus, statusToClass, clearChildren, createElement } from "./utils.js";
import {
  clone,
  createActionButton,
  createSectionHeading,
  getStepBody,
  openConfirmModal,
  openModal,
  renderDefaultStepBody,
  renderError,
  renderFallbackStepBody,
  setText,
  showToast
} from "./workspace/helpers.js";
import { createConceptRenderers } from "./workspace/concept/index.js";

const STEP_RENDERERS = {
  "structure-input": renderIntakeSummaryView,
  "guided-brief": renderBriefQuestionsView,
  "persona-builder": renderPersonaStudioView,
  "research-prompts": renderResearchPromptView
};

const STEP_DETAIL_FACTORIES = {
  "structure-input": () => ({
    sources: [],
    summary: [],
    lastSync: "",
    summaryVersions: [],
    activeVersionId: null,
    hideArchived: false,
    lastGuidance: ""
  }),
  "guided-brief": () => ({
    questions: [],
    lastGuidance: "",
    selectedQuestionIds: []
  }),
  "persona-builder": () => ({
    personas: [],
    updated: "",
    lastGuidance: "",
    lastInputs: {
      summary: [],
      answered: []
    }
  }),
  "research-prompts": () => ({
    prompts: [],
    watch: []
  }),
  "concept-explore": () => ({
    ideas: [],
    boards: [],
    lastGuidance: "",
    lastGeneratedAt: ""
  }),
  "concept-critique": () => ({
    critiques: [],
    lastGuidance: "",
    lastRun: ""
  })
};

const state = {
  project: null,
  selectedModuleId: null,
  selectedStepId: null
};

const conceptContext = {
  getProject: () => state.project,
  persistDetail: (moduleId, stepId, detail) => persistDetail(moduleId, stepId, detail),
  ensureStepDetail: (module, stepId) => ensureStepDetail(module, stepId),
  getActiveSummaryVersion,
  showToast,
  createSectionHeading,
  createActionButton,
  openModal,
  openConfirmModal,
  renderDefaultStepBody,
  clone
};

Object.assign(STEP_RENDERERS, createConceptRenderers(conceptContext));

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadWorkspace();
  } catch (error) {
    renderError(error);
  }
});

async function loadWorkspace() {
  const projectId = parseQuery().get("projectId");
  if (!projectId) {
    throw new Error("No project specified.");
  }

  const project = await getProjectById(projectId);
  state.project = project;

  await initGlobalNav({ activeProjectId: project.id });

  renderProjectSummary();

  const firstModule = project.modules?.[0];
  if (firstModule) {
    selectModule(firstModule.id);
  } else {
    renderModuleSwitcher();
    renderStepList();
    renderDefaultStepBody();
  }
}

function currentModule() {
  return state.project?.modules?.find((module) => module.id === state.selectedModuleId) || null;
}

function currentStep() {
  const module = currentModule();
  return module?.steps?.find((step) => step.id === state.selectedStepId) || null;
}

function renderProjectSummary() {
  const statusPill = document.getElementById("project-status-pill");
  applyPill(statusPill, state.project.status, formatStatus(state.project.status) || "Status");
  setText("project-name", state.project.name);
  const clientLabel = state.project.client ? `Client: ${state.project.client}` : "Client: —";
  setText("project-client", clientLabel);
  setText("project-overview", state.project.summary || "No overview provided yet.");
}

function renderModuleSwitcher() {
  const container = document.getElementById("module-switcher");
  if (!container) {
    return;
  }
  clearChildren(container);

  const modules = state.project.modules || [];
  if (!modules.length) {
    container.appendChild(createElement("p", { classes: "muted", text: "No workflow stages defined yet." }));
    return;
  }

  modules.forEach((module) => {
    const button = createElement("button", {
      classes: ["module-nav-button", module.id === state.selectedModuleId ? "active" : ""],
      attrs: { type: "button", "data-module-id": module.id }
    });

    button.appendChild(createElement("span", { classes: "module-name", text: module.title }));
    const pill = createElement("span", { classes: ["pill", statusToClass(module.status)] });
    pill.textContent = formatStatus(module.status);
    button.appendChild(pill);

    button.addEventListener("click", () => selectModule(module.id));
    container.appendChild(button);
  });
}

function selectModule(moduleId) {
  state.selectedModuleId = moduleId;
  const module = currentModule();

  renderModuleSwitcher();
  renderStepList();

  if (module?.steps?.length) {
    state.selectedStepId = module.steps[0].id;
  } else {
    state.selectedStepId = null;
  }

  renderStepDetail();
}

function renderStepList() {
  const container = document.getElementById("step-list");
  if (!container) {
    return;
  }
  clearChildren(container);

  const module = currentModule();
  if (!module || !module.steps?.length) {
    container.appendChild(createElement("p", { classes: "muted", text: "This stage has no defined steps yet." }));
    return;
  }

  module.steps.forEach((step) => {
    const button = createElement("button", {
      classes: ["step-card", step.id === state.selectedStepId ? "active" : ""],
      attrs: { type: "button", "data-step-id": step.id }
    });

    const meta = createElement("div", { classes: "step-meta" });
    meta.appendChild(createElement("strong", { text: step.name }));
    const pill = createElement("span", { classes: ["pill", statusToClass(step.status)] });
    pill.textContent = formatStatus(step.status);
    meta.appendChild(pill);

    button.appendChild(meta);
    button.appendChild(createElement("p", { classes: "muted", text: step.description }));
    button.addEventListener("click", () => selectStep(step.id));
    container.appendChild(button);
  });
}

function selectStep(stepId) {
  state.selectedStepId = stepId;
  renderStepList();
  renderStepDetail();
}

function renderStepDetail() {
  const module = currentModule();
  const step = currentStep();
  const description = document.getElementById("step-description");
  const statusPill = document.getElementById("step-status");

  if (!step || !module) {
    setText("step-name", "Choose a step");
    setText("step-description", "Pick a step from the left to start working.");
    applyPill(statusPill, null, "Status");
    renderDefaultStepBody();
    return;
  }

  setText("module-label", module.title);
  setText("step-name", step.name);
  if (description) {
    description.textContent = step.description;
  }
  applyPill(statusPill, step.status, formatStatus(step.status));

  const detail = ensureStepDetail(module, step.id);
  renderStepSpecific(step.id, detail, module);
}

function renderStepSpecific(stepId, detail, module) {
  const renderer = STEP_RENDERERS[stepId];
  if (renderer) {
    renderer(detail, module);
  } else {
    renderFallbackStepBody(detail);
  }
}

function ensureStepDetail(module, stepId) {
  if (!module) {
    return {};
  }
  module.details = module.details || {};
  const factory = STEP_DETAIL_FACTORIES[stepId];
  const existing = module.details[stepId];
  if (!existing) {
    const fresh = factory ? factory() : {};
    module.details[stepId] = fresh;
    return fresh;
  }
  if (!factory) {
    return existing;
  }
  const merged = { ...factory(), ...clone(existing) };
  if (stepId === "structure-input") {
    merged.sources = (merged.sources || []).map((source) => ({
      ...source,
      archived: Boolean(source?.archived),
      raw: source?.raw || source?.contentPreview || ""
    }));
    merged.summaryVersions = Array.isArray(merged.summaryVersions) ? merged.summaryVersions : [];
    merged.activeVersionId =
      merged.activeVersionId ||
      (merged.summaryVersions.length ? merged.summaryVersions[merged.summaryVersions.length - 1].id : null);
    merged.hideArchived = Boolean(merged.hideArchived);
  } else if (stepId === "guided-brief") {
    merged.questions = Array.isArray(merged.questions) ? merged.questions : [];
    merged.questions = merged.questions.map((question) => ({
      id: question.id || `q-${Date.now()}`,
      prompt: question.prompt || "",
      owner: question.owner || (question.status === "answered" ? "Client" : "Unassigned"),
      impact: Array.isArray(question.impact) ? question.impact : [],
      status: question.status === "answered" ? "answered" : "open",
      answer: question.answer || "",
      lastUpdated: question.lastUpdated || "",
      generated: Boolean(question.generated),
      rejected: Boolean(question.rejected),
      rejectionReason: question.rejectionReason || "",
      convertedToSource: Boolean(question.convertedToSource),
      convertedSourceId: question.convertedSourceId || ""
    }));
    merged.lastGuidance = merged.lastGuidance || "";
    merged.selectedQuestionIds = Array.isArray(merged.selectedQuestionIds)
      ? merged.selectedQuestionIds.filter((id) => merged.questions.some((question) => question.id === id))
      : [];
  } else if (stepId === "persona-builder") {
    merged.personas = Array.isArray(merged.personas) ? merged.personas : [];
    merged.personas = merged.personas.map((persona) => ({
      id: persona.id || `persona-${Date.now()}`,
      name: persona.name || "Audience Persona",
      age: persona.age || "",
      role: persona.role || "",
      bio: persona.bio || "",
      goals: Array.isArray(persona.goals) ? persona.goals : [],
      painPoints: Array.isArray(persona.painPoints) ? persona.painPoints : [],
      quote: persona.quote || "",
      anchors: Array.isArray(persona.anchors) ? persona.anchors : [],
      generated: Boolean(persona.generated),
      status: persona.status === "approved" ? "approved" : "draft"
    }));
    merged.lastGuidance = merged.lastGuidance || "";
    merged.lastInputs = merged.lastInputs || {};
    merged.lastInputs.summary = Array.isArray(merged.lastInputs.summary) ? merged.lastInputs.summary : [];
    merged.lastInputs.answered = Array.isArray(merged.lastInputs.answered) ? merged.lastInputs.answered : [];
  } else if (stepId === "concept-explore") {
    merged.ideas = Array.isArray(merged.ideas) ? merged.ideas : [];
    merged.ideas = merged.ideas.map((idea) => ({
      id: idea.id || `idea-${Date.now()}`,
      title: idea.title || "Concept",
      logline: idea.logline || "",
      description: idea.description || "",
      status: ["draft", "shortlisted", "archived"].includes(idea.status) ? idea.status : "draft",
      score: {
        boldness: sanitizeScore(idea.score?.boldness),
        clarity: sanitizeScore(idea.score?.clarity),
        fit: sanitizeScore(idea.score?.fit)
      },
      tags: Array.isArray(idea.tags) ? idea.tags.filter(Boolean) : [],
      createdAt: idea.createdAt || ""
    }));
    merged.boards = Array.isArray(merged.boards) ? merged.boards : [];
    merged.boards = merged.boards.map((board, index) => {
      const versions = Array.isArray(board.versions) ? board.versions : [];
      const cleanedVersions = versions.map((version, versionIndex) => {
        const generatedId = `board-version-${Date.now()}-${index}-${versionIndex}`;
        return {
          id: version.id || generatedId,
          version: Number.parseInt(version.version, 10) || versionIndex + 1,
          createdAt: version.createdAt || "",
          logline: version.logline || board.logline || "",
          narrative: version.narrative || "",
          keyVisuals: Array.isArray(version.keyVisuals) ? version.keyVisuals.filter(Boolean) : [],
          tone: Array.isArray(version.tone) ? version.tone.filter(Boolean) : [],
          strategyLink: version.strategyLink || "",
          aiGuidance: version.aiGuidance || "",
          anchorSummary: Array.isArray(version.anchorSummary) ? version.anchorSummary.filter(Boolean) : []
        };
      });
      const critiqueNotes = Array.isArray(board.critiqueNotes)
        ? board.critiqueNotes.map((note, noteIndex) => ({
            argumentId: note.argumentId || `critique-argument-${index}-${noteIndex}`,
            critiqueId: note.critiqueId || "",
            type: note.type || "Note",
            text: note.text || "",
            createdAt: note.createdAt || ""
          }))
        : [];
      const activeVersionId = cleanedVersions.find((version) => version.id === board.activeVersionId)
        ? board.activeVersionId
        : cleanedVersions[0]?.id || "";
      return {
        id: board.id || `board-${Date.now()}-${index}`,
        ideaId: board.ideaId || "",
        title: board.title || "Concept Board",
        logline: board.logline || "",
        status: ["draft", "in-review", "client-ready", "archived"].includes(board.status) ? board.status : "draft",
        versions: cleanedVersions,
        activeVersionId,
        critiqueNotes
      };
    });
    merged.lastGuidance = merged.lastGuidance || "";
    merged.lastGeneratedAt = merged.lastGeneratedAt || "";
  } else if (stepId === "concept-critique") {
    merged.critiques = Array.isArray(merged.critiques) ? merged.critiques : [];
    merged.critiques = merged.critiques.map((critique) => {
      const argumentsList = Array.isArray(critique.arguments)
        ? critique.arguments.map((argument, argumentIndex) => ({
            id: argument.id || `${critique.id || "critique"}-arg-${argumentIndex + 1}`,
            type: argument.type || "Note",
            text: argument.text || ""
          }))
        : [];
      return {
        id: critique.id || `critique-${Date.now()}`,
        boardId: critique.boardId || "",
        versionId: critique.versionId || "",
        versionLabel: critique.versionLabel || "",
        boardTitle: critique.boardTitle || "Concept Board",
        createdAt: critique.createdAt || "",
        focus: critique.focus || "",
        arguments: argumentsList,
        strengths: Array.isArray(critique.strengths) ? critique.strengths.filter(Boolean) : [],
        risks: Array.isArray(critique.risks) ? critique.risks.filter(Boolean) : [],
        questions: Array.isArray(critique.questions) ? critique.questions.filter(Boolean) : [],
        recommendations: Array.isArray(critique.recommendations) ? critique.recommendations.filter(Boolean) : [],
        status: critique.status === "closed" ? "closed" : "open"
      };
    });
    merged.lastGuidance = merged.lastGuidance || "";
    merged.lastRun = merged.lastRun || "";
  }
  module.details[stepId] = merged;
  return merged;
}

function sanitizeScore(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.min(5, Math.max(1, Math.round(numeric)));
  }
  return 3;
}

function renderIntakeSummaryView(detail, module) {
  const body = getStepBody();
  clearChildren(body);
  body.classList.remove("muted");

  const header = createSectionHeading("Source Library", "Keep every intake artifact close and traceable.");
  const addButton = createActionButton("Add Source", () => openSourceEditor(detail, module));
  addButton.classList.add("primary-chip");
  header.appendChild(addButton);
  body.appendChild(header);

  const controls = createElement("div", { classes: "source-controls" });
  const hideLabel = createElement("label", { classes: "checkbox-field" });
  const hideCheckbox = document.createElement("input");
  hideCheckbox.type = "checkbox";
  hideCheckbox.checked = detail.hideArchived;
  hideCheckbox.addEventListener("change", () => {
    detail.hideArchived = hideCheckbox.checked;
    persistDetail(module.id, "structure-input", detail);
    renderIntakeSummaryView(detail, module);
  });
  hideLabel.appendChild(hideCheckbox);
  hideLabel.appendChild(createElement("span", { text: "Hide archived" }));
  controls.appendChild(hideLabel);
  body.appendChild(controls);

  const list = createElement("div", { classes: "source-list" });
  const sources = detail.sources || [];
  const visibleSources = detail.hideArchived ? sources.filter((source) => !source.archived) : sources;
  if (!sources.length) {
    list.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No sources captured yet. Start by logging a transcript, email, or note."
      })
    );
  } else {
    visibleSources.forEach((source) => {
      const sourceIndex = detail.sources.indexOf(source);
      const card = createElement("article", { classes: "source-card" });
      const meta = createElement("div", { classes: "source-meta" });
      meta.appendChild(createElement("span", { classes: "tag-chip", text: source.type || "Source" }));
      meta.appendChild(createElement("strong", { text: source.title || "Untitled source" }));
      card.appendChild(meta);

      if (source.archived) {
        card.classList.add("archived");
        card.appendChild(createElement("span", { classes: "source-archived", text: "Archived" }));
      }

      if (source.summary) {
        card.appendChild(createElement("p", { classes: "muted", text: source.summary }));
      }
      if (source.contentPreview) {
        card.appendChild(createElement("p", { classes: "source-preview", text: source.contentPreview }));
      }

      const footer = createElement("div", { classes: "source-footer muted" });
      footer.textContent = [source.owner || "Unknown", source.timestamp || ""].filter(Boolean).join(" | ");
      card.appendChild(footer);

      const actions = createElement("div", { classes: "source-actions" });
      actions.appendChild(createActionButton("Inspect", () => openSourceEditor(detail, module, { index: sourceIndex, source })));
      const isComputed = source.type === "Approved Personas" || Boolean(source.createdFromQuestionId);
      if (!isComputed) {
        if (source.archived) {
          actions.appendChild(createActionButton("Restore", () => toggleArchiveSource(detail, module, sourceIndex, false)));
        } else {
          actions.appendChild(createActionButton("Archive", () => toggleArchiveSource(detail, module, sourceIndex, true)));
        }
      }
      actions.appendChild(createActionButton("Remove", () => removeSource(detail, module, sourceIndex)));
      card.appendChild(actions);
      list.appendChild(card);
    });

    if (visibleSources.length !== sources.length) {
      const archivedNotice = createElement("p", {
        classes: "muted",
        text: `${sources.length - visibleSources.length} archived source${
          sources.length - visibleSources.length === 1 ? "" : "s"
        } hidden.`
      });
      list.appendChild(archivedNotice);
    }
  }
  body.appendChild(list);

  // Use semantic generator classes (backed by CSS aliases)
  const generator = createElement("div", { classes: "tool-generator" });
  generator.appendChild(
    createElement("div", {
      classes: "tool-generator__intro",
      text: "Use optional guidance to steer what the analysis emphasizes."
    })
  );

  const guidanceLabel = createElement("label", { classes: "tool-generator__guidance" });
  guidanceLabel.appendChild(createElement("span", { text: "Guidance for the AI (optional)" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.placeholder = "e.g. Emphasize budget risks and stakeholder alignment.";
  guidanceInput.value = detail.lastGuidance || "";
  guidanceInput.addEventListener("change", () => {
    detail.lastGuidance = guidanceInput.value;
    persistDetail(module.id, "structure-input", detail);
  });
  guidanceLabel.appendChild(guidanceInput);
  generator.appendChild(guidanceLabel);

  const generatorActions = createElement("div", { classes: "tool-generator__actions" });
  const analyzeButton = document.createElement("button");
  analyzeButton.className = "primary-button";
  analyzeButton.type = "button";
  analyzeButton.textContent = "Analyze";
  analyzeButton.disabled = !sources.filter((source) => !source.archived).length;
  analyzeButton.addEventListener("click", () => analyzeSources(detail, module));
  generatorActions.appendChild(analyzeButton);
  generatorActions.appendChild(
    createElement("span", { classes: "muted", text: "AI references your guidance plus all active sources." })
  );
  generator.appendChild(generatorActions);
  body.appendChild(generator);

  const summaryHeader = createSectionHeading("AI Summary", "Regenerate after each update so downstream steps stay aligned.");
  body.appendChild(summaryHeader);

  const summaryToolbar = createElement("div", { classes: "summary-toolbar" });
  if (detail.summaryVersions.length) {
    const selectLabel = createElement("label", { classes: "summary-select-label" });
    selectLabel.appendChild(createElement("span", { classes: "muted", text: "Version" }));
    const select = document.createElement("select");
    select.className = "summary-version-select";
    detail.summaryVersions.forEach((version, index) => {
      const option = document.createElement("option");
      option.value = version.id;
      option.textContent = `v${index + 1} • ${version.createdAt}`;
      select.appendChild(option);
    });
    const activeId =
      detail.activeVersionId || detail.summaryVersions[detail.summaryVersions.length - 1]?.id || null;
    select.value = activeId || "";
    select.addEventListener("change", () => {
      detail.activeVersionId = select.value || null;
      const activeVersion = getActiveSummaryVersion(detail);
      if (activeVersion) {
        detail.summary = activeVersion.summary;
        detail.lastSync = activeVersion.createdAt;
      }
      persistDetail(module.id, "structure-input", detail);
      renderIntakeSummaryView(detail, module);
    });
    selectLabel.appendChild(select);
    summaryToolbar.appendChild(selectLabel);

    const activeVersion = getActiveSummaryVersion(detail);
    if (activeVersion) {
      const stale =
        sources
          .filter((source) => !source.archived)
          .map((source) => source.id)
          .sort()
          .join("|") !== (activeVersion.sourceIds || []).sort().join("|");
      const meta = createElement("span", {
        classes: ["muted", "summary-meta", stale ? "summary-stale" : ""],
        text: stale ? "Needs refresh – sources changed" : "Up to date"
      });
      summaryToolbar.appendChild(meta);
    }
  } else {
    summaryToolbar.appendChild(
      createElement("span", { classes: "muted", text: "No analysis run yet. Add sources and click Analyze." })
    );
  }
  body.appendChild(summaryToolbar);

  const summaryList = createElement("div", { classes: "summary-list" });
  const activeSummary = getActiveSummaryVersion(detail);
  if (activeSummary?.summary?.length) {
    activeSummary.summary.forEach((line) => summaryList.appendChild(createElement("p", { text: `• ${line}` })));
  } else {
    summaryList.appendChild(
      createElement("p", { classes: "muted", text: "No summary generated yet. Run an analysis to populate this area." })
    );
  }
  body.appendChild(summaryList);

  const summaryActions = createElement("div", { classes: "summary-footer" });
  summaryActions.appendChild(
    createElement("span", {
      classes: "muted",
      text: detail.lastSync ? `Last analyzed ${detail.lastSync}` : "Summary not synced yet."
    })
  );
  const editSummaryBtn = createActionButton("Edit Summary", () => openSummaryEditor(detail, module));
  summaryActions.appendChild(editSummaryBtn);
  body.appendChild(summaryActions);
}

function openSourceEditor(detail, module, options = {}) {
  const isEdit = typeof options.index === "number";
  const current = options.source ? { ...options.source } : null;

  const modal = openModal(isEdit ? "Review Source" : "Add Source", { dialogClass: "modal-dialog-wide" });
  const form = document.createElement("form");
  form.className = "modal-form source-ingest-form";

  form.appendChild(
    createElement("p", {
      classes: "muted",
      text: "Paste raw transcripts, emails, or notes, or upload a document. The assistant will structure it automatically."
    })
  );

  const uploadLabel = createElement("label");
  uploadLabel.appendChild(createElement("span", { text: "Upload document (optional)" }));
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".txt,.md,.doc,.docx,.pdf,.json,.csv";
  uploadLabel.appendChild(fileInput);
  form.appendChild(uploadLabel);

  const rawLabel = createElement("label");
  rawLabel.appendChild(createElement("span", { text: "Raw content" }));
  const rawInput = document.createElement("textarea");
  rawInput.rows = 14;
  rawInput.placeholder =
    "Paste the full transcript, email chain, or meeting notes. The AI will detect key entities and takeaways.";
  rawInput.value = current?.raw || "";
  rawLabel.appendChild(rawInput);
  form.appendChild(rawLabel);

  const statusMessage = createElement("p", { classes: ["form-message", "hidden"], text: "" });
  form.appendChild(statusMessage);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const submitBtn = createElement("button", { classes: "primary-button", text: isEdit ? "Re-run Analysis" : "Analyze Source" });
  submitBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    statusMessage.textContent = "";
    statusMessage.classList.add("hidden");

    try {
      let rawText = rawInput.value.trim();
      if (fileInput.files?.length) {
        const fileText = await readFileAsText(fileInput.files[0]);
        rawText = [rawText, fileText].filter(Boolean).join("\n\n");
      }
      if (!rawText) {
        statusMessage.textContent = "Provide raw text or upload a document before analyzing.";
        statusMessage.classList.remove("hidden");
        submitBtn.disabled = false;
        return;
      }

      const generated = generateSourceMetadata(rawText, fileInput.files?.[0]);
      const payload = {
        id: current?.id || `src-${Date.now()}`,
        archived: current?.archived || false,
        timestamp: new Date().toLocaleString(),
        raw: rawText,
        ...generated
      };

      detail.sources = detail.sources || [];
      if (isEdit) {
        detail.sources.splice(options.index, 1, payload);
      } else {
        detail.sources.unshift(payload);
      }
      persistDetail(module.id, "structure-input", detail);
      showToast(isEdit ? "Source reprocessed." : "Source ingested.");
      modal.close();
      analyzeSources(detail, module, { silent: true });
    } catch (error) {
      console.error(error);
      statusMessage.textContent = "Unable to process this content. Please try a different file or simplify the text.";
      statusMessage.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
    }
  });

  modal.body.appendChild(form);
  rawInput.focus();
}

function openSummaryEditor(detail, module) {
  const modal = openModal("Edit Intake Summary", { dialogClass: "modal-dialog-wide" });
  const form = document.createElement("form");
  form.className = "modal-form";

  const instructions = createElement("p", {
    classes: "muted",
    text: "Write one insight per line. The AI uses this list to power downstream steps."
  });
  form.appendChild(instructions);

  const activeVersion = getActiveSummaryVersion(detail);
  const label = createElement("label");
  label.appendChild(createElement("span", { text: "Summary Lines" }));
  const textarea = document.createElement("textarea");
  textarea.rows = 8;
  textarea.value = (activeVersion?.summary || detail.summary || []).join("\n");
  textarea.placeholder = "Example: Aurora wants the campaign to feel like an effortless spring refresh.";
  label.appendChild(textarea);
  form.appendChild(label);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const submitBtn = createElement("button", { classes: "primary-button", text: "Save Summary" });
  submitBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const lines = textarea.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const timestamp = new Date().toLocaleString();
    if (activeVersion) {
      activeVersion.summary = lines;
      activeVersion.createdAt = timestamp;
    } else {
      const fallbackVersion = {
        id: `summary-${Date.now()}`,
        createdAt: timestamp,
        summary: lines,
        sourceIds: (detail.sources || []).filter((source) => !source.archived).map((source) => source.id)
      };
      detail.summaryVersions = detail.summaryVersions || [];
      detail.summaryVersions.push(fallbackVersion);
      detail.activeVersionId = fallbackVersion.id;
    }
    detail.summary = lines;
    detail.lastSync = timestamp;
    persistDetail(module.id, "structure-input", detail);
    showToast("Summary updated.");
    modal.close();
    renderIntakeSummaryView(detail, module);
  });

  modal.body.appendChild(form);
  textarea.focus();
}

function removeSource(detail, module, index) {
  openConfirmModal({
    title: "Remove Source",
    message: "Remove this source from the intake library?",
    confirmLabel: "Remove",
    onConfirm: () => {
      detail.sources = detail.sources || [];
      detail.sources.splice(index, 1);
      persistDetail(module.id, "structure-input", detail);
      showToast("Source removed.");
      analyzeSources(detail, module, { silent: true });
    }
  });
}

function toggleArchiveSource(detail, module, index, shouldArchive) {
  const source = detail.sources?.[index];
  if (!source) {
    return;
  }
  if (source.type === "Approved Personas" || Boolean(source.createdFromQuestionId)) {
    showToast("This source is computed and cannot be archived. Update it via Personas or Clarify the Brief.");
    return;
  }
  source.archived = shouldArchive;
  persistDetail(module.id, "structure-input", detail);
  showToast(shouldArchive ? "Source archived." : "Source restored.");
  analyzeSources(detail, module, { silent: true });
}

function analyzeSources(detail, module, options = {}) {
  const silent = Boolean(options.silent);
  const activeSources = (detail.sources || []).filter((source) => !source.archived);
  const timestamp = new Date().toLocaleString();
  if (!activeSources.length) {
    const summary = ["No active sources were available during this analysis."];
    const version = {
      id: `summary-${Date.now()}`,
      createdAt: timestamp,
      summary,
      sourceIds: []
    };
    detail.summaryVersions = detail.summaryVersions || [];
    detail.summaryVersions.push(version);
    detail.activeVersionId = version.id;
    detail.summary = summary;
    detail.lastSync = timestamp;
    persistDetail(module.id, "structure-input", detail);
    if (!silent) {
      showToast("No active sources available for analysis.");
    }
    renderIntakeSummaryView(detail, module);
    return;
  }

  const summary = generateSummaryFromSources(activeSources, (detail.lastGuidance || "").trim());
  const version = {
    id: `summary-${Date.now()}`,
    createdAt: timestamp,
    summary,
    sourceIds: activeSources.map((source) => source.id)
  };

  detail.summaryVersions = detail.summaryVersions || [];
  detail.summaryVersions.push(version);
  detail.activeVersionId = version.id;
  detail.summary = summary;
  detail.lastSync = timestamp;
  persistDetail(module.id, "structure-input", detail);
  if (!silent) {
    showToast("Analysis completed.");
  }
  renderIntakeSummaryView(detail, module);
}

function getActiveSummaryVersion(detail) {
  if (!detail?.summaryVersions?.length) {
    return null;
  }
  if (detail.activeVersionId) {
    return detail.summaryVersions.find((version) => version.id === detail.activeVersionId) || null;
  }
  return detail.summaryVersions[detail.summaryVersions.length - 1] || null;
}

function generateSummaryFromSources(sources, guidance) {
  const bullets = new Set();
  sources.forEach((source) => {
    const candidates = [];
    if (source.summary) {
      candidates.push(source.summary);
    }
    if (source.notes?.length) {
      const notesArray = Array.isArray(source.notes) ? source.notes : [source.notes];
      notesArray.forEach((note) => candidates.push(note));
    }
    const raw = source.raw || "";
    if (raw) {
      raw
        .replace(/\r/g, "")
        .split(/[\n\.!?]+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3)
        .forEach((line) => candidates.push(line));
    }
    candidates
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .forEach((line) => bullets.add(line));
  });

  const normalizedGuidance = (guidance || "").replace(/\s+/g, " ").trim();
  if (!bullets.size) {
    if (normalizedGuidance) {
      return [
        `Focus: ${normalizedGuidance}`,
        "No key insights could be extracted from the available sources."
      ];
    }
    return ["No key insights could be extracted from the available sources."];
  }

  let list = Array.from(bullets);
  if (normalizedGuidance) {
    const prioritized = list.filter((line) => line.toLowerCase().includes(normalizedGuidance.toLowerCase()));
    const remaining = list.filter((line) => !line.toLowerCase().includes(normalizedGuidance.toLowerCase()));
    list = [`Focus: ${normalizedGuidance}`, ...prioritized, ...remaining];
  }
  return list.slice(0, 6);
}

function generateSourceMetadata(rawText, file) {
  const cleaned = rawText.replace(/\r/g, "").trim();
  const lines = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const sentences = cleaned.split(/[\.\!\?]+/).map((sentence) => sentence.trim()).filter(Boolean);
  const titleFromFile = file?.name ? file.name.replace(/\.[^/.]+$/, "") : "";
  const inferredTitle = titleFromFile || lines[0] || "AI Processed Source";
  const preview = cleaned.slice(0, 220);

  let type = "Note";
  if (/subject:|dear |regards|sincerely/i.test(cleaned)) {
    type = "Email";
  } else if (/transcript|speaker|call|meeting/i.test(cleaned)) {
    type = "Transcript";
  }

  let owner = "Client";
  const ownerMatch = cleaned.match(/from:\s*([^\n]+)/i) || cleaned.match(/speaker:\s*([^\n]+)/i);
  if (ownerMatch) {
    owner = ownerMatch[1].trim();
  }

  const highlightCandidates = sentences.length ? sentences : lines;
  const keyInsights = highlightCandidates.slice(0, 3).map((line) => line.replace(/\s+/g, " ").trim());

  return {
    type,
    title: inferredTitle.length > 80 ? `${inferredTitle.slice(0, 77)}…` : inferredTitle,
    owner,
    summary: keyInsights[0] || "AI could not derive a key takeaway.",
    contentPreview: preview,
    notes: keyInsights.slice(1),
    raw: cleaned
  };
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsText(file);
  });
}

function renderBriefQuestionsView(detail, module) {
  const body = getStepBody();
  clearChildren(body);
  body.classList.remove("muted");

  const header = createSectionHeading("Clarifying Questions", "Resolve outstanding probes before locking the brief.");
  const addButton = createActionButton("New Question", () => openQuestionComposer(detail, module));
  addButton.classList.add("primary-chip");
  header.appendChild(addButton);
  body.appendChild(header);

  const generator = createElement("div", { classes: "question-generator" });
  generator.appendChild(
    createElement("div", {
      classes: "question-generator-copy",
      text: "Use the intake summary to surface fresh follow-ups."
    })
  );

  const guidanceLabel = createElement("label", { classes: "question-guidance" });
  guidanceLabel.appendChild(createElement("span", { text: "Guidance for the AI (optional)" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.placeholder = "e.g. Prioritize budget risk or missing approvals.";
  guidanceInput.value = detail.lastGuidance || "";
  guidanceInput.addEventListener("change", () => {
    detail.lastGuidance = guidanceInput.value;
    persistDetail(module.id, "guided-brief", detail);
  });
  guidanceLabel.appendChild(guidanceInput);
  generator.appendChild(guidanceLabel);

  const generatorActions = createElement("div", { classes: "question-generator-actions" });
  const generateBtn = document.createElement("button");
  generateBtn.className = "primary-button";
  generateBtn.type = "button";
  generateBtn.textContent = "Generate Questions";
  generateBtn.addEventListener("click", () => {
    if (generateBtn.disabled) {
      return;
    }
    generateBtn.disabled = true;
    generateBtn.textContent = "Generating…";
    window.setTimeout(() => {
      const created = generateClarifyingQuestions(detail, module, guidanceInput.value.trim());
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate Questions";
      if (!created) {
        return;
      }
      renderBriefQuestionsView(detail, module);
    }, 60);
  });
  generatorActions.appendChild(generateBtn);
  const helperText = createElement("span", {
    classes: "muted",
    text: "Outputs leverage active sources from the Intake Summary."
  });
  generatorActions.appendChild(helperText);
  generator.appendChild(generatorActions);
  body.appendChild(generator);

  if (!detail.questions?.length) {
    body.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No questions logged yet. Capture gaps so the brief stays airtight."
      })
    );
    return;
  }

  const list = createElement("div", { classes: "question-list" });
  const selectionSet = new Set(detail.selectedQuestionIds || []);
  detail.questions.forEach((question, index) => {
    const card = createElement("article", { classes: "question-card" });

    const headerRow = createElement("div", { classes: "question-meta" });
    const titleWrap = createElement("div", { classes: "question-title" });
    titleWrap.appendChild(createElement("strong", { text: question.prompt || "Clarifying question" }));
    if (question.generated) {
      titleWrap.appendChild(createElement("span", { classes: "tag-chip", text: "AI suggested" }));
    }
    headerRow.appendChild(titleWrap);

    const statusPill = createElement("span", { classes: ["pill"] });
    if (question.status === "answered") {
      statusPill.classList.add(question.convertedToSource ? "status-queued" : "status-complete");
      statusPill.textContent = question.convertedToSource ? "Source logged" : "Answered";
    } else if (question.rejected) {
      statusPill.classList.add("status-muted");
      statusPill.textContent = "Rejected";
    } else {
      statusPill.classList.add("status-attention");
      statusPill.textContent = "Open";
    }
    headerRow.appendChild(statusPill);
    card.appendChild(headerRow);

    const answerBlock = createElement("div", { classes: "question-answer" });
    if (question.answer) {
      answerBlock.appendChild(createElement("p", { text: question.answer }));
    } else {
      answerBlock.appendChild(createElement("p", { classes: "muted", text: "Awaiting answer." }));
    }
    card.appendChild(answerBlock);

    if (question.rejected && question.rejectionReason) {
      card.appendChild(
        createElement("p", { classes: "question-rejection muted", text: `Rejection note: ${question.rejectionReason}` })
      );
    }

    if (question.impact?.length) {
      const impactRow = createElement("div", { classes: "question-impact" });
      question.impact.forEach((item) => impactRow.appendChild(createElement("span", { classes: "tag-chip", text: item })));
      card.appendChild(impactRow);
    }

    const metaBits = [];
    if (question.owner) {
      metaBits.push(question.owner);
    }
    if (question.lastUpdated) {
      metaBits.push(question.lastUpdated);
    }
    const footer = createElement("div", { classes: "question-footer muted" });
    footer.textContent = metaBits.join(" | " );
    card.appendChild(footer);

    if (question.status === "answered" && !question.convertedToSource) {
      const selectionLabel = createElement("label", { classes: "question-select" });
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectionSet.has(question.id);
      checkbox.addEventListener("change", () => toggleQuestionSelection(detail, module, question.id, checkbox.checked));
      selectionLabel.appendChild(checkbox);
      selectionLabel.appendChild(createElement("span", { classes: "muted", text: "Select" }));
      card.appendChild(selectionLabel);
    }

    const actions = createElement("div", { classes: "question-actions" });
    actions.appendChild(createActionButton("Edit Question", () => openQuestionComposer(detail, module, { index })));
    if (question.status === "answered") {
      actions.appendChild(createActionButton("Update Answer", () => openAnswerDialog(detail, module, index)));
      actions.appendChild(createActionButton("Reopen", () => reopenQuestion(detail, module, index)));
    } else {
      actions.appendChild(
        createActionButton("Log Answer", () => openAnswerDialog(detail, module, index, { markComplete: true }))
      );
      if (question.rejected) {
        actions.appendChild(createActionButton("Clear Rejection", () => clearQuestionRejection(detail, module, index)));
      } else {
        actions.appendChild(createActionButton("Reject", () => openRejectionDialog(detail, module, index)));
      }
    }
    actions.appendChild(createActionButton("Remove", () => removeQuestion(detail, module, index)));
    card.appendChild(actions);

    list.appendChild(card);
  });

  body.appendChild(list);

  const convertible = detail.questions.filter(
    (question) => question.status === "answered" && !question.convertedToSource
  );
  if (convertible.length) {
    const convertBar = createElement("div", { classes: "question-convert-bar" });
    convertBar.appendChild(
      createElement("span", {
        classes: "muted",
        text: detail.selectedQuestionIds?.length
          ? `${detail.selectedQuestionIds.length} selected for source capture.`
          : "Select resolved questions to log their answers as intake sources."
      })
    );
    const convertBtn = document.createElement("button");
    convertBtn.className = "primary-button";
    convertBtn.type = "button";
    convertBtn.textContent = "Convert into Source";
    convertBtn.disabled = !detail.selectedQuestionIds?.length;
    convertBtn.addEventListener("click", () => convertSelectedQuestions(detail, module));
    convertBar.appendChild(convertBtn);
    body.appendChild(convertBar);
  }
}

function generateClarifyingQuestions(detail, module, guidance) {
  const normalizedExisting = new Set(
    (detail.questions || [])
      .map((question) => (question.prompt || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const intakeDetail = ensureStepDetail(module, "structure-input");
  const activeSummary = getActiveSummaryVersion(intakeDetail);
  const summaryLines = Array.isArray(activeSummary?.summary)
    ? activeSummary.summary
    : Array.isArray(intakeDetail.summary)
    ? intakeDetail.summary
    : [];
  const activeSources = (intakeDetail.sources || []).filter((source) => !source.archived);

  const normalizedGuidance = (guidance || "").replace(/\s+/g, " ").trim();
  const suggestions = [];

  function addSuggestion(prompt) {
    const normalized = prompt.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalized) {
      return;
    }
    if (
      normalizedExisting.has(normalized) ||
      suggestions.some((item) => item.replace(/\s+/g, " ").trim().toLowerCase() === normalized)
    ) {
      return;
    }
    suggestions.push(prompt.trim());
  }

  if (normalizedGuidance) {
    addSuggestion(`What information is still missing about "${normalizedGuidance}"?`);
  }

  summaryLines.slice(0, 5).forEach((line) => {
    const focus = extractFocusFromLine(line);
    let prompt = `What clarification do we need about ${focus}?`;
    if (normalizedGuidance) {
      prompt += ` (${normalizedGuidance})`;
    }
    addSuggestion(prompt);
  });

  activeSources.slice(0, 5).forEach((source) => {
    const label = source.title || extractFocusFromLine(source.summary || source.contentPreview || "this source");
    let prompt = `What should we confirm from ${label}?`;
    if (normalizedGuidance) {
      prompt += ` (${normalizedGuidance})`;
    }
    addSuggestion(prompt);

    if (source.summary) {
      const focus = extractFocusFromLine(source.summary);
      let secondary = `What client context backs up "${focus}"?`;
      if (normalizedGuidance) {
        secondary += ` (${normalizedGuidance})`;
      }
      addSuggestion(secondary);
    }
  });

  if (!suggestions.length) {
    showToast("No new follow-up questions identified.");
    return 0;
  }

  const timestamp = new Date().toLocaleString();
  const createdQuestions = suggestions.slice(0, 4).map((prompt) => ({
    id: `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    prompt,
    owner: "Unassigned",
    impact: [],
    status: "open",
    answer: "",
    lastUpdated: timestamp,
    generated: true,
    rejected: false,
    rejectionReason: "",
    convertedToSource: false,
    convertedSourceId: ""
  }));

  detail.questions = [...createdQuestions, ...(detail.questions || [])];
  detail.lastGuidance = normalizedGuidance;
  detail.selectedQuestionIds = (detail.selectedQuestionIds || []).filter((id) =>
    detail.questions.some((question) => question.id === id && question.status === "answered" && !question.convertedToSource)
  );

  persistDetail(module.id, "guided-brief", detail);
  showToast(`${createdQuestions.length} question${createdQuestions.length === 1 ? "" : "s"} added.`);
  return createdQuestions.length;
}

function extractFocusFromLine(text) {
  if (!text) {
    return "this point";
  }
  const cleaned = String(text).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "this point";
  }
  const words = cleaned.split(" ");
  const preview = words.slice(0, 10).join(" ");
  return words.length > 10 ? `${preview}…` : preview;
}

function toggleQuestionSelection(detail, module, questionId, checked) {
  detail.selectedQuestionIds = Array.isArray(detail.selectedQuestionIds) ? detail.selectedQuestionIds : [];
  const exists = detail.selectedQuestionIds.includes(questionId);
  if (checked && !exists) {
    detail.selectedQuestionIds.push(questionId);
  } else if (!checked && exists) {
    detail.selectedQuestionIds = detail.selectedQuestionIds.filter((id) => id !== questionId);
  }
  persistDetail(module.id, "guided-brief", detail);
  renderBriefQuestionsView(detail, module);
}

function convertSelectedQuestions(detail, module) {
  const selectedIds = (detail.selectedQuestionIds || []).filter((id) => Boolean(id));
  if (!selectedIds.length) {
    return;
  }

  const structureDetail = ensureStepDetail(module, "structure-input");
  structureDetail.sources = Array.isArray(structureDetail.sources) ? structureDetail.sources : [];

  let createdCount = 0;
  const timestamp = new Date().toLocaleString();

  selectedIds.forEach((questionId) => {
    const question = detail.questions.find((item) => item.id === questionId);
    if (!question || question.status !== "answered" || !question.answer || question.convertedToSource) {
      return;
    }

    const sourceId = `source-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const answerText = question.answer.trim();
    const source = {
      id: sourceId,
      type: "Clarified Answer",
      title:
        question.prompt.length > 90 ? `${question.prompt.slice(0, 87)}…` : question.prompt || "Clarifying answer",
      summary: answerText.length > 140 ? `${answerText.slice(0, 137)}…` : answerText,
      contentPreview: answerText.slice(0, 220),
      owner: question.owner || "Unassigned",
      timestamp,
      archived: false,
      raw: answerText,
      createdFromQuestionId: question.id
    };

    structureDetail.sources.unshift(source);
    question.convertedToSource = true;
    question.convertedSourceId = sourceId;
    createdCount += 1;
  });

  detail.selectedQuestionIds = detail.selectedQuestionIds.filter((id) =>
    detail.questions.some((question) => question.id === id && question.status === "answered" && !question.convertedToSource)
  );

  if (!createdCount) {
    showToast("Selected questions must be answered before conversion.");
    persistDetail(module.id, "guided-brief", detail);
    return;
  }

  persistDetail(module.id, "structure-input", structureDetail);
  persistDetail(module.id, "guided-brief", detail);
  showToast(`${createdCount} source${createdCount === 1 ? "" : "s"} created from answers.`);
  renderBriefQuestionsView(detail, module);
}

function openRejectionDialog(detail, module, index) {
  const question = detail.questions?.[index];
  if (!question) {
    return;
  }

  const modal = openModal("Reject Question");
  modal.body.appendChild(
    createElement("p", {
      classes: "muted",
      text: "Flag this probe as irrelevant so future AI suggestions can de-prioritize it."
    })
  );

  const form = document.createElement("form");
  form.className = "modal-form";

  const label = createElement("label");
  label.appendChild(createElement("span", { text: "Reason (optional)" }));
  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.placeholder = "Why doesn't this matter for the brief?";
  label.appendChild(textarea);
  form.appendChild(label);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());

  const skipBtn = createElement("button", { classes: "ghost-button", text: "Reject without reason" });
  skipBtn.type = "button";
  skipBtn.addEventListener("click", () => {
    applyQuestionRejection(question, detail, module, "");
    modal.close();
  });

  const confirmBtn = createElement("button", { classes: "primary-button", text: "Reject" });
  confirmBtn.type = "submit";

  actions.appendChild(cancelBtn);
  actions.appendChild(skipBtn);
  actions.appendChild(confirmBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyQuestionRejection(question, detail, module, textarea.value.trim());
    modal.close();
  });

  modal.body.appendChild(form);
}

function applyQuestionRejection(question, detail, module, reason) {
  question.rejected = true;
  question.rejectionReason = reason || "";
  question.lastUpdated = new Date().toLocaleString();
  detail.selectedQuestionIds = (detail.selectedQuestionIds || []).filter((id) => id !== question.id);
  persistDetail(module.id, "guided-brief", detail);
  showToast("Question rejected.");
  renderBriefQuestionsView(detail, module);
}

function clearQuestionRejection(detail, module, index) {
  const question = detail.questions?.[index];
  if (!question) {
    return;
  }
  question.rejected = false;
  question.rejectionReason = "";
  question.lastUpdated = new Date().toLocaleString();
  persistDetail(module.id, "guided-brief", detail);
  showToast("Rejection cleared.");
  renderBriefQuestionsView(detail, module);
}

function openQuestionComposer(detail, module, options = {}) {
  const isEdit = typeof options.index === "number";
  const existing = isEdit ? detail.questions?.[options.index] : null;
  const current = existing
    ? { ...existing }
    : {
        id: `q-${Date.now()}`,
        prompt: "",
        owner: "Unassigned",
        impact: [],
        status: "open",
        answer: "",
        lastUpdated: "",
        generated: false,
        rejected: false,
        rejectionReason: "",
        convertedToSource: false,
        convertedSourceId: ""
      };

  const modal = openModal(isEdit ? "Edit Question" : "New Clarifying Question");
  const form = document.createElement("form");
  form.className = "modal-form";

  const promptLabel = createElement("label");
  promptLabel.appendChild(createElement("span", { text: "Question" }));
  const promptInput = document.createElement("textarea");
  promptInput.rows = 3;
  promptInput.required = true;
  promptInput.value = current.prompt || "";
  promptLabel.appendChild(promptInput);
  form.appendChild(promptLabel);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const submitBtn = createElement("button", { classes: "primary-button", text: isEdit ? "Save Question" : "Add Question" });
  submitBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const promptValue = promptInput.value.trim();
    if (!promptValue) {
      promptInput.focus();
      return;
    }

    const payload = {
      ...current,
      id: current.id || `q-${Date.now()}`,
      prompt: promptValue,
      lastUpdated: new Date().toLocaleString()
    };

    detail.questions = detail.questions || [];
    if (isEdit) {
      detail.questions.splice(options.index, 1, payload);
    } else {
      detail.questions.unshift(payload);
    }

    persistDetail(module.id, "guided-brief", detail);
    showToast(isEdit ? "Question updated." : "Question added.");
    modal.close();
    renderBriefQuestionsView(detail, module);
  });

  modal.body.appendChild(form);
  promptInput.focus();
}

function openAnswerDialog(detail, module, index, options = {}) {
  const question = detail.questions?.[index];
  if (!question) {
    return;
  }

  const modal = openModal("Log Answer");
  const form = document.createElement("form");
  form.className = "modal-form";

  const label = createElement("label");
  label.appendChild(createElement("span", { text: "Answer" }));
  const textarea = document.createElement("textarea");
  textarea.rows = 4;
  textarea.required = true;
  textarea.value = question.answer || "";
  label.appendChild(textarea);
  form.appendChild(label);

  const checkboxLabel = createElement("label");
  checkboxLabel.classList.add("checkbox-field");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = options.markComplete ?? question.status === "answered";
  checkboxLabel.appendChild(checkbox);
  checkboxLabel.appendChild(createElement("span", { text: "Mark as resolved" }));
  form.appendChild(checkboxLabel);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const submitBtn = createElement("button", { classes: "primary-button", text: "Save Answer" });
  submitBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const answerText = textarea.value.trim();
    if (!answerText) {
      textarea.focus();
      return;
    }

    question.answer = answerText;
    question.status = checkbox.checked ? "answered" : "open";
    question.lastUpdated = new Date().toLocaleString();
    question.rejected = false;
    question.rejectionReason = "";
    if (question.status === "answered") {
      question.convertedToSource = false;
      question.convertedSourceId = "";
    } else {
      detail.selectedQuestionIds = (detail.selectedQuestionIds || []).filter((id) => id !== question.id);
    }

    persistDetail(module.id, "guided-brief", detail);
    showToast("Answer recorded.");
    modal.close();
    renderBriefQuestionsView(detail, module);
  });

  modal.body.appendChild(form);
  textarea.focus();
}

function reopenQuestion(detail, module, index) {
  const question = detail.questions?.[index];
  if (!question) {
    return;
  }
  question.status = "open";
  question.lastUpdated = new Date().toLocaleString();
  question.convertedToSource = false;
  question.convertedSourceId = "";
  question.rejected = false;
  question.rejectionReason = "";
  detail.selectedQuestionIds = (detail.selectedQuestionIds || []).filter((id) => id !== question.id);
  persistDetail(module.id, "guided-brief", detail);
  showToast("Question reopened.");
  renderBriefQuestionsView(detail, module);
}

function removeQuestion(detail, module, index) {
  openConfirmModal({
    title: "Remove Question",
    message: "Remove this clarifying question?",
    confirmLabel: "Remove",
    onConfirm: () => {
      detail.questions = detail.questions || [];
      detail.questions.splice(index, 1);
      detail.selectedQuestionIds = (detail.selectedQuestionIds || []).filter(
        (id) => detail.questions.some((question) => question.id === id && question.status === "answered" && !question.convertedToSource)
      );
      persistDetail(module.id, "guided-brief", detail);
      showToast("Question removed.");
      renderBriefQuestionsView(detail, module);
    }
  });
}

function renderPersonaStudioView(detail, module) {
  const body = getStepBody();
  clearChildren(body);
  body.classList.remove("muted");

  const generatorHeading = createSectionHeading(
    "Persona Generator",
    "Guide the AI just like Clarify the Brief—manual edits come last."
  );
  body.appendChild(generatorHeading);

  const generator = createElement("div", { classes: "persona-generator" });
  generator.appendChild(
    createElement("div", {
      classes: "persona-generator-copy",
      text: "Use the intake summary and resolved probes to auto-draft personas before polishing manually."
    })
  );

  const checklist = createElement("ul", { classes: "persona-generator-list" });
  [
    "Pulls from the latest Intake Summary and answered clarifying questions.",
    "Add coaching notes to steer tone, motivations, or priority segments before each run.",
    "Regenerate whenever the brief shifts—manual tweaks are only for final polish."
  ].forEach((item) => checklist.appendChild(createElement("li", { text: item })));
  generator.appendChild(checklist);

  const guidanceLabel = createElement("label", { classes: "persona-guidance" });
  guidanceLabel.appendChild(createElement("span", { text: "Coaching notes for the AI (optional)" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 3;
  guidanceInput.placeholder = "e.g. Spotlight pragmatic renters and ROI proof.";
  guidanceInput.value = detail.lastGuidance || "";
  guidanceInput.addEventListener("change", () => {
    detail.lastGuidance = guidanceInput.value;
    persistDetail(module.id, "persona-builder", detail);
  });
  guidanceLabel.appendChild(guidanceInput);
  generator.appendChild(guidanceLabel);

  const actions = createElement("div", { classes: "persona-generator-actions" });
  actions.appendChild(
    createElement("span", {
      classes: "muted",
      text: "AI references Intake Summary insights and answered probes."
    })
  );

  const buttonsWrap = createElement("div", { classes: "persona-generator-buttons" });
  const generateBtn = document.createElement("button");
  generateBtn.className = "primary-button";
  generateBtn.type = "button";
  const updateGeneratorLabel = () => {
    generateBtn.textContent = detail.personas?.length ? "Regenerate with AI" : "Generate Personas";
  };
  updateGeneratorLabel();
  generateBtn.addEventListener("click", () => {
    if (generateBtn.disabled) {
      return;
    }
    const coaching = guidanceInput.value.trim();
    generateBtn.disabled = true;
    generateBtn.textContent = "Generating…";
    window.setTimeout(() => {
      const created = runPersonaGeneration(detail, module, coaching);
      generateBtn.disabled = false;
      updateGeneratorLabel();
      if (created) {
        renderPersonaStudioView(detail, module);
      }
    }, 60);
  });
  buttonsWrap.appendChild(generateBtn);

  const manualBtn = createActionButton("Add Persona Manually", () => openPersonaEditor(detail, module));
  manualBtn.classList.add("ghost-chip");
  buttonsWrap.appendChild(manualBtn);

  actions.appendChild(buttonsWrap);
  generator.appendChild(actions);

  if (
    detail.updated &&
    (detail.lastGuidance || detail.lastInputs?.summary?.length || detail.lastInputs?.answered?.length)
  ) {
    const recap = createElement("div", { classes: "persona-last-run" });
    recap.appendChild(
      createElement("p", {
        classes: "persona-last-run-title",
        text: `Last AI run ${detail.updated}`
      })
    );
    if (detail.lastGuidance) {
      recap.appendChild(
        createElement("p", {
          classes: "persona-last-run-note muted",
          text: `Coaching note: ${detail.lastGuidance}`
        })
      );
    }
    if (detail.lastInputs?.summary?.length) {
      recap.appendChild(createElement("p", { classes: "persona-last-run-label", text: "Anchored to brief:" }));
      const list = createElement("ul", { classes: "persona-last-run-list" });
      detail.lastInputs.summary.forEach((item) => list.appendChild(createElement("li", { text: item })));
      recap.appendChild(list);
    }
    if (detail.lastInputs?.answered?.length) {
      recap.appendChild(
        createElement("p", { classes: "persona-last-run-label", text: "Anchored to resolved probes:" })
      );
      const list = createElement("ul", { classes: "persona-last-run-list" });
      detail.lastInputs.answered.forEach((item) => list.appendChild(createElement("li", { text: item })));
      recap.appendChild(list);
    }
    generator.appendChild(recap);
  }

  body.appendChild(generator);

  const personasHeading = createSectionHeading(
    "Persona Set",
    detail.personas?.length
      ? "Approve or fine-tune the AI draft before sharing."
      : "Run the generator to populate personas from the brief."
  );
  body.appendChild(personasHeading);

  const grid = createElement("div", { classes: "persona-grid" });
  if (!detail.personas?.length) {
    grid.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No personas generated yet. Use the AI generator above or add one manually."
      })
    );
  } else {
    const defaultAnchors = [
      ...(detail.lastInputs?.summary || []),
      ...(detail.lastInputs?.answered || [])
    ].filter(Boolean);
    detail.personas.forEach((persona, index) => {
      const card = createElement("article", { classes: "persona-card" });

      const titleRow = createElement("div", { classes: "persona-card-header" });
      titleRow.appendChild(createElement("h4", { text: persona.name || "Persona" }));
      if (persona.generated) {
        titleRow.appendChild(createElement("span", { classes: ["tag-chip", "ai-chip"], text: "AI generated" }));
      }
      const statusPill = createElement("span", { classes: ["pill", persona.status === "approved" ? "status-complete" : "status-muted"] });
      statusPill.textContent = persona.status === "approved" ? "Approved" : "Draft";
      titleRow.appendChild(statusPill);
      card.appendChild(titleRow);

      const meta = createElement("p", { classes: "persona-meta muted" });
      meta.textContent = [persona.age || "-", persona.role || "Role unspecified"].filter(Boolean).join(" | ");
      card.appendChild(meta);

      if (persona.bio) {
        card.appendChild(createElement("p", { text: persona.bio }));
      }

      if (persona.goals?.length) {
        card.appendChild(createElement("strong", { text: "Goals" }));
        const goalList = createElement("ul", { classes: "persona-list" });
        persona.goals.forEach((goal) => goalList.appendChild(createElement("li", { text: goal })));
        card.appendChild(goalList);
      }

      if (persona.painPoints?.length) {
        card.appendChild(createElement("strong", { text: "Frustrations" }));
        const painList = createElement("ul", { classes: "persona-list" });
        persona.painPoints.forEach((pain) => painList.appendChild(createElement("li", { text: pain })));
        card.appendChild(painList);
      }

      if (persona.quote) {
        card.appendChild(createElement("blockquote", { text: `"${persona.quote}"` }));
      }

      const anchorSources = (persona.anchors && persona.anchors.length ? persona.anchors : defaultAnchors).slice(0, 2);
      if (anchorSources.length) {
        const anchorBlock = createElement("div", { classes: "persona-anchor-block" });
        anchorBlock.appendChild(createElement("span", { classes: "persona-anchor-label", text: "Anchored to" }));
        const anchorList = createElement("ul", { classes: "persona-anchor-list" });
        anchorSources.forEach((anchor) => anchorList.appendChild(createElement("li", { text: anchor })));
        anchorBlock.appendChild(anchorList);
        card.appendChild(anchorBlock);
      }

      const actions = createElement("div", { classes: "persona-actions" });
      if (persona.status !== "approved") {
        actions.appendChild(createActionButton("Edit", () => openPersonaEditor(detail, module, { index })));
        actions.appendChild(createActionButton("Duplicate", () => duplicatePersona(detail, module, index)));
        actions.appendChild(createActionButton("Remove", () => removePersona(detail, module, index)));
        actions.appendChild(createActionButton("Approve", () => togglePersonaApproval(detail, module, index, true)));
      } else {
        actions.appendChild(createActionButton("Draft", () => togglePersonaApproval(detail, module, index, false)));
      }
      card.appendChild(actions);

      grid.appendChild(card);
    });
  }
  body.appendChild(grid);

  const footer = createElement("p", {
    classes: "muted persona-footer",
    text: detail.personas?.length
      ? `AI personas last generated ${detail.updated || "—"}.`
      : "Manual personas are optional—start by running the AI generator."
  });
  body.appendChild(footer);
}

function togglePersonaApproval(detail, module, index, shouldApprove) {
  const persona = detail.personas?.[index];
  if (!persona) {
    return;
  }
  persona.status = shouldApprove ? "approved" : "draft";
  detail.updated = new Date().toLocaleString();
  persistDetail(module.id, "persona-builder", detail);
  syncApprovedPersonasSource(module);
  showToast(shouldApprove ? "Persona approved." : "Persona set to Draft.");
  renderPersonaStudioView(detail, module);
}

function syncApprovedPersonasSource(module) {
  const structureDetail = ensureStepDetail(module, "structure-input");
  structureDetail.sources = Array.isArray(structureDetail.sources) ? structureDetail.sources : [];

  const personaDetail = ensureStepDetail(module, "persona-builder");
  const approved = (personaDetail.personas || []).filter((p) => p.status === "approved");

  const sourceId = `${module.id}-approved-personas`;
  const idx = structureDetail.sources.findIndex((s) => s.id === sourceId);

  if (!approved.length) {
    if (idx >= 0) {
      structureDetail.sources.splice(idx, 1);
      persistDetail(module.id, "structure-input", structureDetail);
    }
    return;
  }

  const timestamp = new Date().toLocaleString();
  const names = approved.map((p) => p.name).filter(Boolean).join(", ");
  const summary = names ? `Approved personas: ${names}.` : "Approved personas.";
  const contentPreview = approved
    .map((p) => `${p.name}: ${p.role || ""}`.trim())
    .filter(Boolean)
    .join(" | ")
    .slice(0, 220);
  const raw = approved
    .map((p) => {
      const goals = (p.goals || []).join("; ");
      const pains = (p.painPoints || []).join("; ");
      return `${p.name}\nRole: ${p.role}\nBio: ${p.bio}\nGoals: ${goals}\nFrustrations: ${pains}\nQuote: ${p.quote}`;
    })
    .join("\n\n");

  const payload = {
    id: sourceId,
    type: "Approved Personas",
    title: "Approved Personas",
    summary: summary.length > 140 ? `${summary.slice(0, 137)}…` : summary,
    contentPreview,
    owner: "Strategist",
    timestamp,
    archived: false,
    raw
  };

  if (idx >= 0) {
    structureDetail.sources.splice(idx, 1, payload);
  } else {
    structureDetail.sources.unshift(payload);
  }
  persistDetail(module.id, "structure-input", structureDetail);
}

function runPersonaGeneration(detail, module, guidance) {
  const output = buildPersonaDrafts(module, guidance);
  if (!output) {
    showToast("Add intake summary insights or answer probes before generating personas.");
    return false;
  }

  const { personas, summaryAnchors, answeredAnchors } = output;
  if (!personas.length) {
    showToast("No personas generated. Add more context to the brief and try again.");
    return false;
  }

  detail.personas = personas.map((p) => ({ ...p, status: "draft" }));
  detail.updated = new Date().toLocaleString();
  detail.lastGuidance = guidance;
  detail.lastInputs = {
    summary: summaryAnchors,
    answered: answeredAnchors
  };

  persistDetail(module.id, "persona-builder", detail);
  showToast(`Persona${personas.length === 1 ? "" : "s"} generated.`);
  return true;
}

function buildPersonaDrafts(module, guidance) {
  const structureDetail = ensureStepDetail(module, "structure-input");
  const activeSummary = getActiveSummaryVersion(structureDetail);
  let summaryAnchors = Array.isArray(activeSummary?.summary)
    ? activeSummary.summary
    : Array.isArray(structureDetail.summary)
    ? structureDetail.summary
    : [];

  if (!summaryAnchors.length && Array.isArray(structureDetail.sources)) {
    summaryAnchors = structureDetail.sources
      .map((source) => source.summary || source.contentPreview || "")
      .filter(Boolean);
  }

  const formattedSummaryAnchors = summaryAnchors.map(formatAnchorSnippet).filter(Boolean);

  const questionDetail = ensureStepDetail(module, "guided-brief");
  const formattedAnswerAnchors = (questionDetail.questions || [])
    .filter((question) => question.status === "answered" && question.answer)
    .map((question) => formatAnchorSnippet(`${question.prompt} → ${question.answer}`))
    .filter(Boolean);

  const normalizedGuidance = (guidance || "").replace(/\s+/g, " ").trim();

  if (!formattedSummaryAnchors.length && !formattedAnswerAnchors.length) {
    return null;
  }

  const templates = composePersonaTemplates(formattedSummaryAnchors, formattedAnswerAnchors, normalizedGuidance);
  const anchorPool = [...formattedSummaryAnchors, ...formattedAnswerAnchors];
  const timestamp = Date.now();

  const personas = templates.map((template, index) => {
    const anchorSlice = anchorPool.slice(index * 2, index * 2 + 2);
    const anchors = anchorSlice.length
      ? anchorSlice
      : anchorPool.slice(0, Math.min(anchorPool.length, 2));
    return {
      id: `persona-${timestamp}-${index}`,
      name: template.name,
      age: template.age,
      role: template.role,
      bio: template.bio,
      goals: template.goals,
      painPoints: template.painPoints,
      quote: template.quote,
      anchors,
      generated: true
    };
  });

  return {
    personas,
    summaryAnchors: formattedSummaryAnchors,
    answeredAnchors: formattedAnswerAnchors
  };
}

function composePersonaTemplates(summaryAnchors, answeredAnchors, guidance) {
  const combinedText = `${summaryAnchors.join(" ")} ${answeredAnchors.join(" ")} ${guidance}`.toLowerCase();
  const guidanceLower = guidance.toLowerCase();

  const themes = {
    hook: "a refreshing customer experience",
    proof: "tangible performance wins",
    friction: "time to execute across teams",
    channel: "campaign rollouts",
    safeguard: "ROI proof",
    primaryName: "Momentum Maker",
    primaryAge: "35",
    primaryRole: "Marketing lead steering launch strategy",
    secondaryName: "Pragmatic Gatekeeper",
    secondaryAge: "41",
    secondaryRole: "Operations partner validating feasibility"
  };

  if (/season|spring|refresh|mood/.test(combinedText)) {
    themes.hook = "seasonal mood shifts";
    themes.primaryName = "Seasonal Storyteller";
    themes.primaryRole = "Homeowner curating gathering-ready spaces";
    themes.primaryAge = "34";
  }

  if (/first-time|beginner|newcomer/.test(combinedText)) {
    themes.primaryName = "Approachable Trailblazer";
    themes.primaryRole = "First-time adopter seeking confidence";
    themes.primaryAge = "29";
    themes.channel = "community storytelling";
  }

  if (/home|host|gather/.test(combinedText)) {
    themes.primaryRole = "Homeowner curating gathering-ready spaces";
    themes.primaryAge = "34";
  }

  if (/bundle|upsell|starter kit|kit/.test(combinedText)) {
    themes.proof = "bundle conversion lift";
    themes.safeguard = "bundle performance";
  }

  if (/renter|rental|apartment/.test(combinedText)) {
    themes.secondaryName = "Practical Renter";
    themes.secondaryRole = "Renter upgrading without permanent installs";
    themes.secondaryAge = "39";
  }

  if (/budget|roi|finance|cfo|pragmatic/.test(combinedText) || guidanceLower.includes("pragmatic")) {
    themes.secondaryName = "Pragmatic Evaluator";
    themes.secondaryRole = "Finance-minded stakeholder vetting spend";
    themes.secondaryAge = "42";
    themes.friction = "budget justification debates";
    themes.safeguard = "ROI proof";
  }

  if (/tech|smart|automation|integration/.test(combinedText)) {
    themes.friction = "complex smart-tech setups";
  }

  if (/voice|hands-free/.test(combinedText)) {
    themes.hook = "hands-free control";
  }

  if (/sustain|eco|green|biodegradable|energy/.test(combinedText) || guidanceLower.includes("sustain")) {
    themes.hook = "energy-efficient comfort";
    themes.safeguard = "sustainability proof";
  }

  if (/retail/.test(combinedText)) {
    themes.channel = "retail enablement";
  }

  if (/social|creator|tiktok|paid social|content/.test(combinedText)) {
    themes.channel = "social storytelling";
  }

  const guidanceFragment = toSentenceFragment(guidance);
  const safeguard = themes.safeguard || themes.proof;

  const primaryGoals = [
    `Translate ${themes.hook} into ${themes.channel} moments that feel effortless.`,
    `Lock partners that can prove ${themes.proof}.`,
    guidanceFragment ? `${guidanceFragment}.` : `Keep stakeholders aligned without slowing approvals.`
  ];

  const primary = {
    name: themes.primaryName,
    age: themes.primaryAge,
    role: themes.primaryRole,
    bio: `Champions ${themes.hook} while rallying teams around ${themes.proof}. Balances ambition with ${themes.friction}.`,
    goals: primaryGoals,
    painPoints: [
      `Momentum stalls when ${themes.friction}.`,
      `Distrusts pitches that lack a path to ${themes.proof}.`,
      `Overloaded by decks that ignore day-to-day execution.`
    ],
    quote: `"Make ${themes.hook} tangible and the team will move yesterday."`
  };

  const secondaryGoals = [
    `See a clear line from concept to ${safeguard}.`,
    `Protect bandwidth while the team experiments with ${themes.hook}.`,
    guidanceFragment ? `${guidanceFragment} without losing practicality.` : `Champion realistic rollout plans.`
  ];

  const secondary = {
    name: themes.secondaryName,
    age: themes.secondaryAge,
    role: themes.secondaryRole,
    bio: `Evaluates every pitch through the lens of ${safeguard} and team capacity.`,
    goals: secondaryGoals,
    painPoints: [
      `Skeptical when ${themes.proof} is vague or unquantified.`,
      `Frustrated by ${themes.friction}.`,
      `Rejects ideas that ignore operational constraints.`
    ],
    quote: `"Show me the path to ${safeguard} and I'm comfortable greenlighting bold creative."`
  };

  return [primary, secondary];
}

function toSentenceFragment(text) {
  if (!text) {
    return "";
  }
  const cleaned = String(text).trim();
  if (!cleaned) {
    return "";
  }
  const normalized = cleaned.replace(/[\.!?]+$/g, "");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatAnchorSnippet(text) {
  if (!text) {
    return "";
  }
  const cleaned = String(text).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  return cleaned.length > 140 ? `${cleaned.slice(0, 137)}…` : cleaned;
}

function openPersonaEditor(detail, module, options = {}) {
  const isEdit = typeof options.index === "number";
  const existing = isEdit ? detail.personas?.[options.index] : null;
  if (isEdit && existing?.status === "approved") {
    showToast("Approved personas cannot be edited. Revert to Draft first.");
    return;
  }
  const current = existing
    ? {
        ...existing,
        goals: [...(existing.goals || [])],
        painPoints: [...(existing.painPoints || [])],
        anchors: [...(existing.anchors || [])],
        generated: Boolean(existing.generated)
      }
    : {
        id: `persona-${Date.now()}`,
        name: "",
        age: "",
        role: "",
        bio: "",
        goals: [],
        painPoints: [],
        quote: "",
        anchors: [],
      generated: false,
      status: "draft"
      };

  const modal = openModal(isEdit ? "Edit Persona" : "New Persona");
  const form = document.createElement("form");
  form.className = "modal-form";

  const nameLabel = createElement("label");
  nameLabel.appendChild(createElement("span", { text: "Name" }));
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.required = true;
  nameInput.value = current.name || "";
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  const ageLabel = createElement("label");
  ageLabel.appendChild(createElement("span", { text: "Age" }));
  const ageInput = document.createElement("input");
  ageInput.type = "text";
  ageInput.placeholder = "e.g. 34";
  ageInput.value = current.age || "";
  ageLabel.appendChild(ageInput);
  form.appendChild(ageLabel);

  const roleLabel = createElement("label");
  roleLabel.appendChild(createElement("span", { text: "Role" }));
  const roleInput = document.createElement("input");
  roleInput.type = "text";
  roleInput.placeholder = "Their job or context";
  roleInput.value = current.role || "";
  roleLabel.appendChild(roleInput);
  form.appendChild(roleLabel);

  const bioLabel = createElement("label");
  bioLabel.appendChild(createElement("span", { text: "Bio" }));
  const bioInput = document.createElement("textarea");
  bioInput.rows = 3;
  bioInput.value = current.bio || "";
  bioLabel.appendChild(bioInput);
  form.appendChild(bioLabel);

  const goalsLabel = createElement("label");
  goalsLabel.appendChild(createElement("span", { text: "Goals" }));
  const goalsInput = document.createElement("textarea");
  goalsInput.rows = 4;
  goalsInput.placeholder = "One goal per line";
  goalsInput.value = (current.goals || []).join("\\n");
  goalsLabel.appendChild(goalsInput);
  form.appendChild(goalsLabel);

  const painsLabel = createElement("label");
  painsLabel.appendChild(createElement("span", { text: "Frustrations" }));
  const painsInput = document.createElement("textarea");
  painsInput.rows = 4;
  painsInput.placeholder = "One friction per line";
  painsInput.value = (current.painPoints || []).join("\\n");
  painsLabel.appendChild(painsInput);
  form.appendChild(painsLabel);

  const quoteLabel = createElement("label");
  quoteLabel.appendChild(createElement("span", { text: "Quote" }));
  const quoteInput = document.createElement("input");
  quoteInput.type = "text";
  quoteInput.placeholder = "Optional pull-quote";
  quoteInput.value = current.quote || "";
  quoteLabel.appendChild(quoteInput);
  form.appendChild(quoteLabel);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const submitBtn = createElement("button", { classes: "primary-button", text: isEdit ? "Save Persona" : "Add Persona" });
  submitBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nameValue = nameInput.value.trim();
    if (!nameValue) {
      nameInput.focus();
      return;
    }

    const payload = {
      id: current.id || `persona-${Date.now()}`,
      name: nameValue,
      age: ageInput.value.trim(),
      role: roleInput.value.trim(),
      bio: bioInput.value.trim(),
      goals: goalsInput.value
        .split("\\n")
        .map((value) => value.trim())
        .filter(Boolean),
      painPoints: painsInput.value
        .split("\\n")
        .map((value) => value.trim())
        .filter(Boolean),
      quote: quoteInput.value.trim(),
      anchors: Array.isArray(current.anchors) ? [...current.anchors] : [],
      generated: isEdit ? Boolean(existing?.generated) : false
    };

    detail.personas = detail.personas || [];
    if (isEdit) {
      detail.personas.splice(options.index, 1, payload);
    } else {
      detail.personas.push({ ...payload, status: "draft" });
    }
    detail.updated = new Date().toLocaleString();

    persistDetail(module.id, "persona-builder", detail);
    syncApprovedPersonasSource(module);
    showToast(isEdit ? "Persona updated." : "Persona added.");
    modal.close();
    renderPersonaStudioView(detail, module);
  });

  modal.body.appendChild(form);
  nameInput.focus();
}

function duplicatePersona(detail, module, index) {
  const persona = detail.personas?.[index];
  if (!persona) {
    return;
  }
  const copy = clone(persona);
  copy.id = `persona-${Date.now()}`;
  copy.name = `${persona.name} Copy`;
  copy.status = "draft";
  detail.personas.splice(index + 1, 0, copy);
  detail.updated = new Date().toLocaleString();
  persistDetail(module.id, "persona-builder", detail);
  showToast("Persona duplicated.");
  renderPersonaStudioView(detail, module);
}

function removePersona(detail, module, index) {
  openConfirmModal({
    title: "Remove Persona",
    message: "Remove this persona from the set?",
    confirmLabel: "Remove",
    onConfirm: () => {
      detail.personas = detail.personas || [];
      const persona = detail.personas[index];
      if (persona?.status === "approved") {
        showToast("Approved personas cannot be removed. Revert to Draft first.");
        return;
      }
      detail.personas.splice(index, 1);
      detail.updated = new Date().toLocaleString();
      persistDetail(module.id, "persona-builder", detail);
      showToast("Persona removed.");
      syncApprovedPersonasSource(module);
      renderPersonaStudioView(detail, module);
    }
  });
}

function renderResearchPromptView(detail, module) {
  const body = getStepBody();
  clearChildren(body);
  body.classList.remove("muted");

  const header = createSectionHeading(
    "Research Prompt Kit",
    "Generate copy-ready prompts you can run in Gemini, ChatGPT, or any external research copilot."
  );
  body.appendChild(header);

  const generator = createElement("div", { classes: "prompt-generator" });
  generator.appendChild(
    createElement("div", {
      classes: "prompt-generator-copy",
      text: "Let the AI review your living brief and spin up research prompts instead of writing them manually."
    })
  );

  const checklist = createElement("ul", { classes: "prompt-generator-list" });
  [
    "Grounds prompts in the latest Intake Summary, clarified answers, and approved personas.",
    "Tailors each draft for external tools—no placeholders or templating syntax.",
    "Regenerate whenever the brief shifts to refresh your research plan in seconds."
  ].forEach((item) => checklist.appendChild(createElement("li", { text: item })));
  generator.appendChild(checklist);

  const guidanceLabel = createElement("label", { classes: "prompt-guidance" });
  guidanceLabel.appendChild(createElement("span", { text: "Guidance for the AI (optional)" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.placeholder = "e.g. Prioritize sustainability proof or retail partner enablement.";
  guidanceInput.value = detail.lastGuidance || "";
  guidanceInput.addEventListener("change", () => {
    detail.lastGuidance = guidanceInput.value;
    persistDetail(module.id, "research-prompts", detail);
  });
  guidanceLabel.appendChild(guidanceInput);
  generator.appendChild(guidanceLabel);

  const actions = createElement("div", { classes: "prompt-generator-actions" });
  const buttonsWrap = createElement("div", { classes: "prompt-generator-buttons" });
  const generateBtn = document.createElement("button");
  generateBtn.className = "primary-button";
  generateBtn.type = "button";
  const updateGenerateLabel = () => {
    generateBtn.textContent = detail.prompts?.length ? "Regenerate with AI" : "Generate Prompts";
  };
  updateGenerateLabel();
  generateBtn.addEventListener("click", () => {
    if (generateBtn.disabled) {
      return;
    }
    generateBtn.disabled = true;
    generateBtn.textContent = "Generating…";
    window.setTimeout(() => {
      const created = generateResearchPrompts(detail, module, guidanceInput.value.trim());
      generateBtn.disabled = false;
      updateGenerateLabel();
      if (created) {
        renderResearchPromptView(detail, module);
      }
    }, 80);
  });
  buttonsWrap.appendChild(generateBtn);
  actions.appendChild(buttonsWrap);
  actions.appendChild(
    createElement("span", {
      classes: "muted",
      text: "Outputs arrive as plain text—copy them directly into your external research tools."
    })
  );
  generator.appendChild(actions);
  body.appendChild(generator);

  const prompts = detail.prompts || [];
  if (!prompts.length) {
    body.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No prompts generated yet. Run the generator to draft research starters."
      })
    );
  } else {
    const list = createElement("div", { classes: "prompt-list" });
    const selectionSet = new Set(detail.selectedPromptIds || []);

    prompts.forEach((promptItem, index) => {
      const card = createElement("article", { classes: "prompt-card" });

      const meta = createElement("div", { classes: "prompt-meta" });
      const titleWrap = createElement("div", { classes: "prompt-title" });
      titleWrap.appendChild(createElement("strong", { text: promptItem.label || "Research Prompt" }));
      if (promptItem.channel) {
        titleWrap.appendChild(createElement("span", { classes: "tag-chip prompt-channel", text: promptItem.channel }));
      }
      meta.appendChild(titleWrap);

      const statusPill = createElement("span", { classes: "pill" });
      if (promptItem.convertedToSource) {
        statusPill.classList.add("status-queued");
        statusPill.textContent = "Source logged";
      } else if (promptItem.response) {
        statusPill.classList.add("status-complete");
        statusPill.textContent = "Response logged";
      } else {
        statusPill.classList.add("status-attention");
        statusPill.textContent = "Awaiting response";
      }
      meta.appendChild(statusPill);
      card.appendChild(meta);

      if (promptItem.tags?.length) {
        const tagsRow = createElement("div", { classes: "prompt-tags" });
        promptItem.tags.forEach((tag) => tagsRow.appendChild(createElement("span", { classes: "tag-chip", text: tag })));
        card.appendChild(tagsRow);
      }

      const promptBody = createElement("div", { classes: "prompt-body" });
      promptBody.appendChild(
        createElement("p", { text: promptItem.promptText || "Prompt text will appear here once generated." })
      );
      card.appendChild(promptBody);

      const responseBlock = createElement("div", { classes: "prompt-response" });
      if (promptItem.response) {
        responseBlock.appendChild(createElement("p", { text: promptItem.response }));
      } else {
        responseBlock.appendChild(
          createElement("p", {
            classes: "muted",
            text: "Response not logged yet. Paste insights once you run this externally."
          })
        );
      }
      card.appendChild(responseBlock);

      const footerBits = [];
      if (promptItem.lastGenerated) {
        footerBits.push(`Generated ${promptItem.lastGenerated}`);
      }
      if (promptItem.lastUpdated && promptItem.lastUpdated !== promptItem.lastGenerated) {
        footerBits.push(`Edited ${promptItem.lastUpdated}`);
      }
      if (promptItem.responseLoggedAt) {
        footerBits.push(`Response logged ${promptItem.responseLoggedAt}`);
      }
      if (footerBits.length) {
        const footer = createElement("div", { classes: "prompt-footer muted" });
        footer.textContent = footerBits.join(" | ");
        card.appendChild(footer);
      }

      if (promptItem.response && !promptItem.convertedToSource) {
        const selectionLabel = createElement("label", { classes: "prompt-select" });
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectionSet.has(promptItem.id);
        checkbox.addEventListener("change", () =>
          togglePromptSelection(detail, module, promptItem.id, checkbox.checked)
        );
        selectionLabel.appendChild(checkbox);
        selectionLabel.appendChild(createElement("span", { classes: "muted", text: "Select" }));
        card.appendChild(selectionLabel);
      }

      const actions = createElement("div", { classes: "prompt-actions" });
      actions.appendChild(createActionButton("Preview", () => showPromptPreview(promptItem)));
      actions.appendChild(createActionButton("Refine Prompt", () => openPromptEditor(detail, module, { index })));
      actions.appendChild(
        createActionButton(
          promptItem.response ? "Update Response" : "Log Response",
          () => openPromptResponseDialog(detail, module, index)
        )
      );
      actions.appendChild(createActionButton("Remove", () => removePrompt(detail, module, index)));
      card.appendChild(actions);

      list.appendChild(card);
    });

    body.appendChild(list);

    const convertible = prompts.filter((prompt) => prompt.response && !prompt.convertedToSource);
    if (convertible.length) {
      const convertBar = createElement("div", { classes: "prompt-convert-bar" });
      convertBar.appendChild(
        createElement("span", {
          classes: "muted",
          text: detail.selectedPromptIds?.length
            ? `${detail.selectedPromptIds.length} selected to archive as sources.`
            : "Select logged responses to capture them in the source library."
        })
      );
      const convertBtn = document.createElement("button");
      convertBtn.className = "primary-button";
      convertBtn.type = "button";
      convertBtn.textContent = "Convert into Source";
      convertBtn.disabled = !detail.selectedPromptIds?.length;
      convertBtn.addEventListener("click", () => convertSelectedPrompts(detail, module));
      convertBar.appendChild(convertBtn);
      body.appendChild(convertBar);
    }
  }

  if (detail.watch?.length) {
    body.appendChild(createSectionHeading("Automations", "Triggers that monitor brief changes."));
    const watchList = createElement("ul", { classes: "watch-list" });
    detail.watch.forEach((item) => {
      watchList.appendChild(createElement("li", { text: `${item.label}: ${item.description}` }));
    });
    body.appendChild(watchList);
  }
}

function generateResearchPrompts(detail, module, guidance) {
  const normalizedGuidance = (guidance || "").replace(/\s+/g, " ").trim();

  const existing = new Set(
    (detail.prompts || [])
      .map((prompt) => (prompt.promptText || "").replace(/\s+/g, " ").trim().toLowerCase())
      .filter(Boolean)
  );

  const structureDetail = ensureStepDetail(module, "structure-input");
  const activeSummary = getActiveSummaryVersion(structureDetail);
  const summaryLines = Array.isArray(activeSummary?.summary)
    ? activeSummary.summary
    : Array.isArray(structureDetail.summary)
    ? structureDetail.summary
    : [];
  const summaryHighlights = summaryLines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);

  const questionDetail = ensureStepDetail(module, "guided-brief");
  const answeredQuestions = (questionDetail.questions || [])
    .filter((question) => question.status === "answered" && question.answer)
    .map((question) => ({
      prompt: question.prompt || "",
      answer: question.answer || ""
    }));

  const personaDetail = ensureStepDetail(module, "persona-builder");
  const personas = (personaDetail.personas || []).filter((persona) => persona.name || persona.bio);

  const projectName = state.project?.name || "this project";

  const suggestions = [];

  function addSuggestion(config) {
    const promptText = (config.promptText || "").replace(/\s+/g, " ").trim();
    if (!promptText) {
      return;
    }
    const normalized = promptText.toLowerCase();
    if (existing.has(normalized) || suggestions.some((item) => item.normalized === normalized)) {
      return;
    }
    suggestions.push({ ...config, promptText, normalized });
  }

  function condense(text, limit = 160) {
    if (!text) {
      return "";
    }
    const cleaned = String(text).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) {
      return "";
    }
    return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}…` : cleaned;
  }

  if (summaryHighlights.length) {
    const bulletList = summaryHighlights
      .slice(0, 4)
      .map((line) => `- ${line}`)
      .join("\n");
    const focusLine = normalizedGuidance ? `Keep the review anchored on ${normalizedGuidance}.` : "";
    addSuggestion({
      id: `prompt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      label: "Validate Brief Insights",
      channel: "ChatGPT",
      tags: ["Strategy", "Validation"],
      promptText: `You are supporting the ${projectName} brief. Review the following highlights and suggest concrete research tasks that would validate them:\n${bulletList}\nList the investigations to run, why they matter, and which sources to tap.${focusLine ? ` ${focusLine}` : ""}`
    });
  }

  if (personas.length) {
    const persona = personas[0];
    const personaDetails = [persona.bio, persona.goals?.[0], persona.painPoints?.[0]]
      .flat()
      .map((value) => condense(value, 120))
      .filter(Boolean)
      .join(" ");
    const focusLine = normalizedGuidance ? `Prioritize findings tied to ${normalizedGuidance}.` : "";
    addSuggestion({
      id: `prompt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      label: `${persona.name || "Audience"} Deep Dive`,
      channel: "Gemini",
      tags: ["Audience", persona.role || "Persona"],
      promptText: `Act as a research strategist analyzing ${persona.name || "the target audience"}. We currently believe: ${
        personaDetails || "they are evaluating solutions like ours."
      } Identify publications, communities, and data that explain how they discover and assess offers like ${projectName}. Highlight unmet needs, buying triggers, and language we should mirror.${
        focusLine ? ` ${focusLine}` : ""
      }`
    });
  }

  if (answeredQuestions.length) {
    const firstAnswer = answeredQuestions[0];
    const focusLine = normalizedGuidance ? `Focus on ${normalizedGuidance}.` : "";
    addSuggestion({
      id: `prompt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      label: "Pressure-Test Key Assumption",
      channel: "Perplexity",
      tags: ["Validation", "Risks"],
      promptText: `We captured the following during brief clarification:\nQuestion: ${condense(firstAnswer.prompt, 140)}\nAnswer: ${condense(
        firstAnswer.answer,
        180
      )}\nOutline fact-finding prompts we can run with industry tools to validate or challenge this answer. Recommend search angles, expert sources, and metrics to confirm accuracy.${
        focusLine ? ` ${focusLine}` : ""
      }`
    });
  }

  if (!suggestions.length) {
    const focus = normalizedGuidance || summaryHighlights[0] || `the goals outlined for ${projectName}`;
    addSuggestion({
      id: `prompt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      label: "Landscape Scan",
      channel: "ChatGPT",
      tags: ["Market"],
      promptText: `Develop a quick research plan to understand ${focus}. Provide the top questions to investigate, recommended data sources, and keywords that should guide our desk research.`
    });
  }

  if (!suggestions.length) {
    showToast("No new prompts generated.");
    return 0;
  }

  const timestamp = new Date().toLocaleString();
  const createdPrompts = suggestions.slice(0, 4).map((suggestion) => ({
    id: suggestion.id,
    label: suggestion.label,
    channel: suggestion.channel,
    promptText: suggestion.promptText,
    tags: Array.isArray(suggestion.tags) ? suggestion.tags : [],
    generated: true,
    lastGenerated: timestamp,
    lastUpdated: timestamp,
    response: "",
    responseLoggedAt: "",
    convertedToSource: false,
    convertedSourceId: ""
  }));

  detail.prompts = [...createdPrompts, ...(detail.prompts || [])];
  detail.lastGuidance = normalizedGuidance;
  detail.selectedPromptIds = (detail.selectedPromptIds || []).filter((id) =>
    detail.prompts.some((prompt) => prompt.id === id && prompt.response && !prompt.convertedToSource)
  );

  persistDetail(module.id, "research-prompts", detail);
  showToast(`${createdPrompts.length} prompt${createdPrompts.length === 1 ? "" : "s"} generated.`);
  return createdPrompts.length;
}

function openPromptEditor(detail, module, options = {}) {
  const isEdit = typeof options.index === "number";
  const existing = isEdit ? detail.prompts?.[options.index] : null;
  const current = existing
    ? { ...existing, tags: [...(existing.tags || [])] }
    : {
        id: `prompt-${Date.now()}`,
        label: "",
        channel: "ChatGPT",
        promptText: "",
        tags: [],
        generated: true,
        lastGenerated: "",
        lastUpdated: "",
        response: "",
        responseLoggedAt: "",
        convertedToSource: false,
        convertedSourceId: ""
      };

  const modal = openModal(isEdit ? "Refine Prompt" : "New Research Prompt");
  const form = document.createElement("form");
  form.className = "modal-form";

  const labelField = createElement("label");
  labelField.appendChild(createElement("span", { text: "Prompt Label" }));
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.required = true;
  labelInput.placeholder = "What is this prompt for?";
  labelInput.value = current.label || "";
  labelField.appendChild(labelInput);
  form.appendChild(labelField);

  const channelField = createElement("label");
  channelField.appendChild(createElement("span", { text: "Channel" }));
  const channelInput = document.createElement("input");
  channelInput.type = "text";
  channelInput.placeholder = "e.g. ChatGPT, Gemini";
  channelInput.value = current.channel || "";
  channelField.appendChild(channelInput);
  form.appendChild(channelField);

  const tagsField = createElement("label");
  tagsField.appendChild(createElement("span", { text: "Tags" }));
  const tagsInput = document.createElement("input");
  tagsInput.type = "text";
  tagsInput.placeholder = "Comma-separated tags";
  tagsInput.value = current.tags.join(", " );
  tagsField.appendChild(tagsInput);
  form.appendChild(tagsField);

  const promptField = createElement("label");
  promptField.appendChild(createElement("span", { text: "Prompt Text" }));
  const promptTextarea = document.createElement("textarea");
  promptTextarea.rows = 8;
  promptTextarea.required = true;
  promptTextarea.placeholder = "Paste the full prompt that should be sent to the research tool.";
  promptTextarea.value = current.promptText || "";
  promptField.appendChild(promptTextarea);
  form.appendChild(promptField);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const submitBtn = createElement("button", { classes: "primary-button", text: "Save Prompt" });
  submitBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const labelValue = labelInput.value.trim();
    const promptValue = promptTextarea.value.trim();
    if (!labelValue) {
      labelInput.focus();
      return;
    }
    if (!promptValue) {
      promptTextarea.focus();
      return;
    }

    const payload = {
      ...current,
      id: current.id || `prompt-${Date.now()}`,
      label: labelValue,
      channel: channelInput.value.trim() || "ChatGPT",
      promptText: promptValue,
      tags: tagsInput.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    };

    const timestamp = new Date().toLocaleString();
    if (isEdit) {
      payload.lastUpdated = timestamp;
      if (!payload.lastGenerated) {
        payload.lastGenerated = timestamp;
      }
    } else {
      payload.generated = true;
      payload.lastGenerated = timestamp;
      payload.lastUpdated = timestamp;
      payload.response = "";
      payload.responseLoggedAt = "";
      payload.convertedToSource = false;
      payload.convertedSourceId = "";
    }

    detail.prompts = detail.prompts || [];
    if (isEdit) {
      detail.prompts.splice(options.index, 1, payload);
    } else {
      detail.prompts.unshift(payload);
    }

    detail.selectedPromptIds = Array.isArray(detail.selectedPromptIds)
      ? detail.selectedPromptIds.filter((id) =>
          detail.prompts.some((prompt) => prompt.id === id && prompt.response && !prompt.convertedToSource)
        )
      : [];

    persistDetail(module.id, "research-prompts", detail);
    showToast(isEdit ? "Prompt updated." : "Prompt saved.");
    modal.close();
    renderResearchPromptView(detail, module);
  });

  modal.body.appendChild(form);
  labelInput.focus();
}

function removePrompt(detail, module, index) {
  openConfirmModal({
    title: "Remove Prompt",
    message: "Remove this prompt from the library?",
    confirmLabel: "Remove",
    onConfirm: () => {
      detail.prompts = detail.prompts || [];
      const [removed] = detail.prompts.splice(index, 1);
      const removedId = removed?.id;
      detail.selectedPromptIds = Array.isArray(detail.selectedPromptIds)
        ? detail.selectedPromptIds.filter((id) => id !== removedId)
        : [];
      persistDetail(module.id, "research-prompts", detail);
      showToast("Prompt removed.");
      renderResearchPromptView(detail, module);
    }
  });
}

function openPromptResponseDialog(detail, module, index) {
  const promptItem = detail.prompts?.[index];
  if (!promptItem) {
    return;
  }

  const modal = openModal(promptItem.response ? "Update Response" : "Log Response");
  modal.body.appendChild(
    createElement("p", {
      classes: "muted",
      text: "Paste the highlights captured from your external research run."
    })
  );

  const form = document.createElement("form");
  form.className = "modal-form";

  const label = createElement("label");
  label.appendChild(createElement("span", { text: "Response Summary" }));
  const textarea = document.createElement("textarea");
  textarea.rows = 5;
  textarea.required = true;
  textarea.value = promptItem.response || "";
  label.appendChild(textarea);
  form.appendChild(label);

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: "Cancel" });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const submitBtn = createElement("button", { classes: "primary-button", text: "Save Response" });
  submitBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const responseText = textarea.value.trim();
    if (!responseText) {
      textarea.focus();
      return;
    }

    const timestamp = new Date().toLocaleString();
    promptItem.response = responseText;
    promptItem.responseLoggedAt = timestamp;
    promptItem.lastUpdated = timestamp;
    if (promptItem.convertedToSource) {
      promptItem.convertedToSource = false;
      promptItem.convertedSourceId = "";
    }

    detail.selectedPromptIds = (detail.selectedPromptIds || []).filter((id) => id !== promptItem.id);

    persistDetail(module.id, "research-prompts", detail);
    showToast("Response saved.");
    modal.close();
    renderResearchPromptView(detail, module);
  });

  modal.body.appendChild(form);
  textarea.focus();
}

function togglePromptSelection(detail, module, promptId, checked) {
  detail.selectedPromptIds = Array.isArray(detail.selectedPromptIds) ? detail.selectedPromptIds : [];
  const exists = detail.selectedPromptIds.includes(promptId);
  if (checked && !exists) {
    detail.selectedPromptIds.push(promptId);
  } else if (!checked && exists) {
    detail.selectedPromptIds = detail.selectedPromptIds.filter((id) => id !== promptId);
  }
  persistDetail(module.id, "research-prompts", detail);
  renderResearchPromptView(detail, module);
}

function convertSelectedPrompts(detail, module) {
  const selectedIds = (detail.selectedPromptIds || []).filter(Boolean);
  if (!selectedIds.length) {
    return;
  }

  const structureDetail = ensureStepDetail(module, "structure-input");
  structureDetail.sources = Array.isArray(structureDetail.sources) ? structureDetail.sources : [];

  let createdCount = 0;
  const timestamp = new Date().toLocaleString();

  selectedIds.forEach((promptId) => {
    const promptItem = detail.prompts.find((item) => item.id === promptId);
    if (!promptItem || !promptItem.response || promptItem.convertedToSource) {
      return;
    }

    const sourceId = `source-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const responseText = promptItem.response.trim();
    const source = {
      id: sourceId,
      type: "Research Insight",
      title:
        promptItem.label && promptItem.label.length > 90
          ? `${promptItem.label.slice(0, 87)}…`
          : promptItem.label || "Research insight",
      summary: responseText.length > 140 ? `${responseText.slice(0, 137)}…` : responseText,
      contentPreview: responseText.slice(0, 220),
      owner: promptItem.channel || "Research",
      timestamp,
      archived: false,
      raw: responseText,
      createdFromPromptId: promptItem.id
    };

    structureDetail.sources.unshift(source);
    promptItem.convertedToSource = true;
    promptItem.convertedSourceId = sourceId;
    createdCount += 1;
  });

  detail.selectedPromptIds = detail.selectedPromptIds.filter((id) =>
    detail.prompts.some((prompt) => prompt.id === id && prompt.response && !prompt.convertedToSource)
  );

  if (!createdCount) {
    showToast("Log a response before converting prompts.");
    persistDetail(module.id, "research-prompts", detail);
    return;
  }

  persistDetail(module.id, "structure-input", structureDetail);
  persistDetail(module.id, "research-prompts", detail);
  showToast(`${createdCount} source${createdCount === 1 ? "" : "s"} created from research responses.`);
  renderResearchPromptView(detail, module);
}

function showPromptPreview(promptItem) {
  if (!promptItem?.promptText) {
    return;
  }
  const modal = openModal(promptItem.label || "Prompt Preview");
  modal.body.appendChild(
    createElement("p", {
      classes: "muted",
      text: "Copy the prompt below and paste it into your research tool."
    })
  );

  const textarea = document.createElement("textarea");
  textarea.rows = 10;
  textarea.readOnly = true;
  textarea.className = "prompt-preview";
  textarea.value = promptItem.promptText;
  modal.body.appendChild(textarea);

  const actions = createElement("div", { classes: "modal-actions" });
  const closeBtn = createElement("button", { classes: "secondary-button", text: "Close" });
  closeBtn.type = "button";
  closeBtn.addEventListener("click", () => modal.close());
  const copyBtn = createElement("button", { classes: "primary-button", text: "Copy Prompt" });
  copyBtn.type = "button";
  copyBtn.addEventListener("click", () => copyPrompt(textarea.value));
  actions.appendChild(closeBtn);
  actions.appendChild(copyBtn);
  modal.body.appendChild(actions);

  setTimeout(() => textarea.select(), 20);
}

function copyPrompt(text) {
  if (!text) {
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("Prompt copied to clipboard."))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const temp = document.createElement("textarea");
  temp.value = text;
  temp.setAttribute("readonly", "readonly");
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  document.body.removeChild(temp);
  showToast("Prompt copied to clipboard.");
}

function persistDetail(moduleId, stepId, detail) {
  saveStepDetail(state.project.id, moduleId, stepId, detail);
}


