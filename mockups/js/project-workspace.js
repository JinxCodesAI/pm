import { getProjectById, saveStepDetail } from "./data-service.js";
import { initGlobalNav } from "./navigation.js";
import { parseQuery, applyPill, formatStatus, statusToClass, clearChildren, createElement } from "./utils.js";

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
    hideArchived: false
  }),
  "guided-brief": () => ({
    questions: [],
    lastGuidance: "",
    selectedQuestionIds: []
  }),
  "persona-builder": () => ({
    personas: [],
    updated: ""
  }),
  "research-prompts": () => ({
    prompts: [],
    watch: []
  })
};

const state = {
  project: null,
  selectedModuleId: null,
  selectedStepId: null
};

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
    renderArtifactSection();
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
  renderArtifactSection();
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
    renderArtifactSection();
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
  renderArtifactSection();
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
  }
  module.details[stepId] = merged;
  return merged;
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
      if (source.archived) {
        actions.appendChild(createActionButton("Restore", () => toggleArchiveSource(detail, module, sourceIndex, false)));
      } else {
        actions.appendChild(createActionButton("Archive", () => toggleArchiveSource(detail, module, sourceIndex, true)));
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

  const analyzeButton = createElement("button", { classes: "primary-button analyze-button", text: "Analyze" });
  analyzeButton.disabled = !sources.filter((source) => !source.archived).length;
  analyzeButton.addEventListener("click", () => analyzeSources(detail, module));
  body.appendChild(analyzeButton);

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

  const summary = generateSummaryFromSources(activeSources);
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

function generateSummaryFromSources(sources) {
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

  if (!bullets.size) {
    return ["No key insights could be extracted from the available sources."];
  }

  return Array.from(bullets).slice(0, 6);
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

  const header = createSectionHeading("Persona Set", "Regenerate or refine personas as the audience evolves.");
  const addBtn = createActionButton("Add Persona", () => openPersonaEditor(detail, module));
  addBtn.classList.add("primary-chip");
  header.appendChild(addBtn);
  const regenerateBtn = createActionButton("Regenerate", () => {
    detail.updated = new Date().toLocaleString();
    persistDetail(module.id, "persona-builder", detail);
    showToast("Persona regeneration queued.");
    renderPersonaStudioView(detail, module);
  });
  header.appendChild(regenerateBtn);
  body.appendChild(header);

  const grid = createElement("div", { classes: "persona-grid" });
  if (!detail.personas?.length) {
    grid.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No personas generated yet. Add a persona to start mapping your audience."
      })
    );
  } else {
    detail.personas.forEach((persona, index) => {
      const card = createElement("article", { classes: "persona-card" });
      card.appendChild(createElement("h4", { text: persona.name || "Persona" }));

      const meta = createElement("p", { classes: "persona-meta muted" });
      meta.textContent = [persona.age || "-", persona.role || "Role unspecified"].filter(Boolean).join(" | " );
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

      const actions = createElement("div", { classes: "persona-actions" });
      actions.appendChild(createActionButton("Edit", () => openPersonaEditor(detail, module, { index })));
      actions.appendChild(createActionButton("Duplicate", () => duplicatePersona(detail, module, index)));
      actions.appendChild(createActionButton("Remove", () => removePersona(detail, module, index)));
      card.appendChild(actions);

      grid.appendChild(card);
    });
  }
  body.appendChild(grid);

  const footer = createElement("p", {
    classes: "muted",
    text: detail.updated ? `Last regenerated ${detail.updated}` : "Personas have not been regenerated yet."
  });
  body.appendChild(footer);
}

function openPersonaEditor(detail, module, options = {}) {
  const isEdit = typeof options.index === "number";
  const existing = isEdit ? detail.personas?.[options.index] : null;
  const current = existing
    ? { ...existing, goals: [...(existing.goals || [])], painPoints: [...(existing.painPoints || [])] }
    : {
        id: `persona-${Date.now()}`,
        name: "",
        age: "",
        role: "",
        bio: "",
        goals: [],
        painPoints: [],
        quote: ""
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
      quote: quoteInput.value.trim()
    };

    detail.personas = detail.personas || [];
    if (isEdit) {
      detail.personas.splice(options.index, 1, payload);
    } else {
      detail.personas.push(payload);
    }
    detail.updated = new Date().toLocaleString();

    persistDetail(module.id, "persona-builder", detail);
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
      detail.personas.splice(index, 1);
      detail.updated = new Date().toLocaleString();
      persistDetail(module.id, "persona-builder", detail);
      showToast("Persona removed.");
      renderPersonaStudioView(detail, module);
    }
  });
}

function renderResearchPromptView(detail, module) {
  const body = getStepBody();
  clearChildren(body);
  body.classList.remove("muted");

  const header = createSectionHeading("Prompt Library", "Launch prompts to gather insights without leaving the workspace.");
  const addButton = createActionButton("Add Prompt", () => openPromptEditor(detail, module));
  addButton.classList.add("primary-chip");
  header.appendChild(addButton);
  body.appendChild(header);

  if (!detail.prompts?.length) {
    body.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No prompts saved yet. Add prompts to accelerate research runs."
      })
    );
  } else {
    const table = createElement("table", { classes: "prompt-table" });
    table.innerHTML = "<thead><tr><th>Prompt</th><th>Channel</th><th>Tags</th><th>Last Run</th><th></th></tr></thead>";
    const tbody = createElement("tbody");

    detail.prompts.forEach((promptItem, index) => {
      const row = createElement("tr");
      row.appendChild(createElement("td", { text: promptItem.label || "Prompt" }));
      row.appendChild(createElement("td", { text: promptItem.channel || "Tool" }));

      const tagsCell = createElement("td");
      if (promptItem.tags?.length) {
        promptItem.tags.forEach((tag) => tagsCell.appendChild(createElement("span", { classes: "tag-chip", text: tag })));
      } else {
        tagsCell.appendChild(createElement("span", { classes: "muted", text: "--" }));
      }
      row.appendChild(tagsCell);

      row.appendChild(createElement("td", { text: promptItem.lastRun || "Not run" }));

      const actionCell = createElement("td", { classes: "prompt-actions" });
      actionCell.appendChild(createActionButton("Run", () => runPrompt(detail, module, index)));
      actionCell.appendChild(createActionButton("Preview", () => showPromptPreview(promptItem)));
      actionCell.appendChild(createActionButton("Edit", () => openPromptEditor(detail, module, { index })));
      actionCell.appendChild(createActionButton("Remove", () => removePrompt(detail, module, index)));
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    body.appendChild(table);
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
        status: "ready",
        lastRun: "Not run"
      };

  const modal = openModal(isEdit ? "Edit Prompt" : "New Research Prompt");
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
  const submitBtn = createElement("button", { classes: "primary-button", text: isEdit ? "Save Prompt" : "Add Prompt" });
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
      id: current.id || `prompt-${Date.now()}`,
      label: labelValue,
      channel: channelInput.value.trim() || "ChatGPT",
      promptText: promptValue,
      status: current.status || "ready",
      lastRun: current.lastRun || "Not run",
      tags: tagsInput.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    };

    detail.prompts = detail.prompts || [];
    if (isEdit) {
      detail.prompts.splice(options.index, 1, payload);
    } else {
      payload.lastRun = "Not run";
      detail.prompts.unshift(payload);
    }

    persistDetail(module.id, "research-prompts", detail);
    showToast(isEdit ? "Prompt updated." : "Prompt added.");
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
      detail.prompts.splice(index, 1);
      persistDetail(module.id, "research-prompts", detail);
      showToast("Prompt removed.");
      renderResearchPromptView(detail, module);
    }
  });
}

function runPrompt(detail, module, index) {
  const promptItem = detail.prompts?.[index];
  if (!promptItem) {
    return;
  }
  promptItem.lastRun = new Date().toLocaleString();
  promptItem.status = "queued";
  persistDetail(module.id, "research-prompts", detail);
  showToast(`Prompt "${promptItem.label}" queued.`);
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

let activeModal = null;

function openModal(title, options = {}) {
  if (activeModal) {
    activeModal.close();
  }

  const modalEl = document.createElement("div");
  modalEl.className = "modal dynamic-modal";

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  modalEl.appendChild(backdrop);

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";
  if (options.dialogClass) {
    dialog.classList.add(options.dialogClass);
  }
  modalEl.appendChild(dialog);

  const header = document.createElement("header");
  header.className = "modal-header";
  const titleWrap = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = title || "Dialog";
  titleWrap.appendChild(heading);
  header.appendChild(titleWrap);

  const closeBtn = document.createElement("button");
  closeBtn.className = "ghost-icon-button";
  closeBtn.type = "button";
  closeBtn.innerHTML = "&times;";
  closeBtn.setAttribute("aria-label", "Close dialog");
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  const body = document.createElement("div");
  body.className = "modal-body";
  dialog.appendChild(body);

  function cleanup() {
    document.removeEventListener("keydown", onKeyDown);
    if (modalEl.parentNode) {
      modalEl.parentNode.removeChild(modalEl);
    }
    if (activeModal?.element === modalEl) {
      activeModal = null;
    }
  }

  function close() {
    cleanup();
    if (typeof options.onClose === "function") {
      options.onClose();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      close();
    }
  }

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", onKeyDown);

  document.body.appendChild(modalEl);
  setTimeout(() => {
    const focusable = body.querySelector("input, textarea, select, button");
    (focusable || closeBtn).focus();
  }, 20);

  const handle = { close, element: modalEl, body };
  activeModal = handle;
  return handle;
}

function openConfirmModal({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm }) {
  const modal = openModal(title || "Confirm");
  modal.body.appendChild(createElement("p", { classes: "muted", text: message }));

  const actions = createElement("div", { classes: "modal-actions" });
  const cancelBtn = createElement("button", { classes: "secondary-button", text: cancelLabel });
  cancelBtn.type = "button";
  cancelBtn.addEventListener("click", () => modal.close());
  const confirmBtn = createElement("button", { classes: "primary-button", text: confirmLabel });
  confirmBtn.type = "button";
  confirmBtn.addEventListener("click", () => {
    modal.close();
    if (typeof onConfirm === "function") {
      onConfirm();
    }
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  modal.body.appendChild(actions);

  return modal;
}

function renderFallbackStepBody(detail) {
  const body = getStepBody();
  clearChildren(body);
  body.classList.remove("muted");
  body.appendChild(createElement("p", { text: "This step does not yet have a dedicated workspace view." }));
  if (detail && Object.keys(detail).length) {
    body.appendChild(createElement("pre", { classes: "muted", text: JSON.stringify(detail, null, 2) }));
  }
}

function renderDefaultStepBody(message = "Select a step to view detailed tools.") {
  const body = getStepBody();
  clearChildren(body);
  body.classList.add("muted");
  body.textContent = message;
}

function persistDetail(moduleId, stepId, detail) {
  saveStepDetail(state.project.id, moduleId, stepId, detail);
}

function createSectionHeading(title, subtitle) {
  const wrapper = createElement("div", { classes: "section-heading" });
  wrapper.appendChild(createElement("h3", { text: title }));
  if (subtitle) {
    wrapper.appendChild(createElement("p", { classes: "muted", text: subtitle }));
  }
  return wrapper;
}

function createActionButton(label, handler) {
  const button = createElement("button", { classes: "chip-button", text: label });
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

function getStepBody() {
  return document.getElementById("step-body");
}

function showToast(message) {
  let container = document.querySelector(".toast");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast";
    document.body.appendChild(container);
  }
  container.textContent = message;
  container.classList.add("visible");
  setTimeout(() => container.classList.remove("visible"), 2600);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value ?? "—";
  }
}

function renderArtifactSection() {
  const module = currentModule();
  const artifactStatus = document.getElementById("artifact-status");
  const artifactSummary = document.getElementById("artifact-summary");
  if (!artifactStatus || !artifactSummary) {
    return;
  }

  if (module?.artifact) {
    applyPill(artifactStatus, module.artifact.status, formatStatus(module.artifact.status) || "Status");
    artifactSummary.textContent = module.artifact.summary || "No summary provided yet.";
  } else {
    artifactStatus.className = "pill";
    artifactStatus.textContent = "Not Tracked";
    artifactSummary.textContent = "This stage does not track an artifact.";
  }
}

function renderError(error) {
  const shell = document.querySelector(".workspace-shell");
  if (!shell) {
    return;
  }
  shell.innerHTML = `
    <section class="card" style="grid-column: 1 / -1;">
      <h2>Unable to load project</h2>
      <p class="muted">${error.message}</p>
    </section>
  `;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}


