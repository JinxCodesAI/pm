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

export function createConceptRenderers(context) {
  return {
    "concept-explore": (detail, module) => renderConceptExplorer(detail, module, context),
    "concept-critique": (detail, module) => renderConceptCritique(detail, module, context)
  };
}

function renderConceptExplorer(detail, module, context) {
  const body = getStepBody();
  if (!body) {
    return;
  }
  body.innerHTML = "";
  body.classList.remove("muted");

  const anchors = getBriefAnchors(context);
  const personas = getPersonaVoices(context);

  const generatorHeader = createSectionHeading(
    "Idea Generator",
    "Spin up differentiated loglines anchored in the approved strategy."
  );
  body.appendChild(generatorHeader);

  const generator = createElement("div", { classes: "concept-generator" });
  const generatorCopy = createElement("div", { classes: "concept-generator-copy" });
  generatorCopy.appendChild(
    createElement("p", {
      classes: "muted",
      text: anchors.length
        ? "Weave in these brief anchors and persona motivations so concepts stay strategically tight."
        : "Add a structured brief in Discover & Brief to supercharge the generator."
    })
  );

  if (anchors.length) {
    const anchorList = createElement("ul", { classes: "concept-anchor-list" });
    anchors.slice(0, 5).forEach((anchor) => anchorList.appendChild(createElement("li", { text: anchor })));
    generatorCopy.appendChild(anchorList);
  }
  if (personas.length) {
    const personaTagline = createElement("p", {
      classes: "muted concept-persona-line",
      text: `Voices to honor: ${personas.join(", ")}`
    });
    generatorCopy.appendChild(personaTagline);
  }
  generator.appendChild(generatorCopy);

  const generatorControls = createElement("div", { classes: "concept-generator-controls" });
  const guidanceLabel = createElement("label");
  guidanceLabel.appendChild(createElement("span", { text: "Guidance for the AI (optional)" }));
  const guidanceInput = document.createElement("textarea");
  guidanceInput.rows = 2;
  guidanceInput.placeholder = "e.g. Explore humor-forward takes or lean into aspirational settings.";
  guidanceInput.value = detail.lastGuidance || "";
  guidanceLabel.appendChild(guidanceInput);
  generatorControls.appendChild(guidanceLabel);

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
      const created = runConceptGeneration(detail, module, context, guidanceInput.value.trim(), anchors, personas);
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate Concepts";
      if (!created) {
        return;
      }
      renderConceptExplorer(detail, module, context);
    }, 90);
  });
  actionRow.appendChild(generateBtn);

  const manualBtn = createElement("button", { classes: "ghost-button", text: "Add Concept Manually" });
  manualBtn.type = "button";
  manualBtn.addEventListener("click", () => openIdeaEditor(detail, module, context));
  actionRow.appendChild(manualBtn);
  generatorControls.appendChild(actionRow);

  if (detail.lastGeneratedAt) {
    generatorControls.appendChild(
      createElement("p", { classes: "muted", text: `Last AI run ${detail.lastGeneratedAt}` })
    );
  }
  generator.appendChild(generatorControls);
  body.appendChild(generator);

  const ideasHeader = createSectionHeading(
    "Idea Pool",
    detail.ideas?.length
      ? "Shortlist 2-3 concepts to take forward. Use scores to balance ambition and feasibility."
      : "Run the generator or add a concept manually to build your shortlist."
  );
  body.appendChild(ideasHeader);

  const ideaList = createElement("div", { classes: "concept-idea-list" });
  if (!detail.ideas?.length) {
    ideaList.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No concepts captured yet. Generate directions above to start shaping boards."
      })
    );
  } else {
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
      actions.appendChild(createActionButton("Edit", () => openIdeaEditor(detail, module, context, { index })));
      actions.appendChild(
        createActionButton(
          idea.status === "shortlisted" ? "Unshortlist" : "Shortlist",
          () => toggleIdeaStatus(detail, module, context, index, idea.status === "shortlisted" ? "draft" : "shortlisted")
        )
      );
      if (idea.status === "archived") {
        actions.appendChild(
          createActionButton("Restore", () => toggleIdeaStatus(detail, module, context, index, "draft"))
        );
      } else {
        actions.appendChild(
          createActionButton("Archive", () => toggleIdeaStatus(detail, module, context, index, "archived"))
        );
      }
      actions.appendChild(
        createActionButton("Develop Board", () => promoteIdeaToBoard(detail, module, context, idea))
      );
      card.appendChild(actions);

      ideaList.appendChild(card);
    });
  }
  body.appendChild(ideaList);

  const boardsHeader = createSectionHeading(
    "Concept Boards",
    detail.boards?.length
      ? "Version boards as the client reacts. Each save keeps prior iterations accessible."
      : "Shortlist an idea and promote it to draft a board."
  );
  body.appendChild(boardsHeader);

  const boardList = createElement("div", { classes: "concept-board-list" });
  if (!detail.boards?.length) {
    boardList.appendChild(
      createElement("div", {
        classes: "empty-card",
        text: "No boards created yet. Promote a shortlisted idea to start shaping the narrative."
      })
    );
  } else {
    detail.boards.forEach((board, index) => {
      const activeVersion = board.versions?.find((version) => version.id === board.activeVersionId) || board.versions?.[0];
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
        if (activeVersion.narrative) {
          card.appendChild(createElement("p", { text: activeVersion.narrative }));
        }

        if (activeVersion.keyVisuals?.length) {
          const visuals = createElement("ul", { classes: "concept-visual-list" });
          activeVersion.keyVisuals.forEach((visual) => visuals.appendChild(createElement("li", { text: visual })));
          card.appendChild(visuals);
        }

        if (activeVersion.tone?.length) {
          const toneRow = createElement("div", { classes: "concept-tone-row" });
          activeVersion.tone.forEach((word) => toneRow.appendChild(createElement("span", { classes: "tag-chip", text: word })));
          card.appendChild(toneRow);
        }

        if (activeVersion.strategyLink) {
          card.appendChild(
            createElement("p", {
              classes: "muted concept-strategy-link",
              text: `Link to strategy: ${activeVersion.strategyLink}`
            })
          );
        }
      }

      const metaRow = createElement("p", { classes: "muted concept-board-meta" });
      metaRow.textContent = activeVersion
        ? `v${activeVersion.version} • Last updated ${activeVersion.createdAt}`
        : "No version saved yet.";
      card.appendChild(metaRow);

      if (board.versions?.length > 1) {
        const historyBtn = createActionButton("Version History", () => openVersionHistoryDialog(board));
        historyBtn.classList.add("ghost-button");
        card.appendChild(historyBtn);
      }

      const actions = createElement("div", { classes: "concept-board-actions" });
      actions.appendChild(createActionButton("Edit", () => openConceptBoardEditor(detail, module, context, { index })));
      actions.appendChild(createActionButton("Duplicate", () => duplicateBoard(detail, module, context, index)));
      if (board.status === "archived") {
        actions.appendChild(createActionButton("Restore", () => changeBoardStatus(detail, module, context, index, "draft")));
      } else {
        actions.appendChild(createActionButton("Archive", () => changeBoardStatus(detail, module, context, index, "archived")));
      }
      if (board.status !== "client-ready") {
        actions.appendChild(
          createActionButton("Mark Client Ready", () => changeBoardStatus(detail, module, context, index, "client-ready"))
        );
      }
      card.appendChild(actions);

      boardList.appendChild(card);
    });
  }
  body.appendChild(boardList);
}

function renderConceptCritique(detail, module, context) {
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
      ? "Stress-test each board before client presentation. Capture critiques and action them into the next version."
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
    const activeVersion = board.versions?.find((version) => version.id === board.activeVersionId) || board.versions?.[0];
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

function runConceptGeneration(detail, module, context, guidance, anchors, personas) {
  const ideaSeeds = composeIdeaSeeds(anchors, personas, guidance);
  if (!ideaSeeds.length) {
    showToast("Add more strategic inputs in Discover & Brief before generating concepts.");
    return false;
  }

  detail.ideas = Array.isArray(detail.ideas) ? detail.ideas : [];
  ideaSeeds.forEach((seed) => {
    const existing = detail.ideas.find((idea) => idea.title === seed.title);
    if (existing) {
      return;
    }
    detail.ideas.unshift({
      id: `idea-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      status: "draft",
      createdAt: new Date().toLocaleString(),
      ...seed
    });
  });

  detail.lastGuidance = guidance;
  detail.lastGeneratedAt = new Date().toLocaleString();
  context.persistDetail(module.id, "concept-explore", detail);
  showToast(`${ideaSeeds.length} concept${ideaSeeds.length === 1 ? "" : "s"} generated.`);
  return true;
}

function composeIdeaSeeds(anchors, personas, guidance) {
  const baseAnchors = anchors.slice(0, 5);
  const voice = personas[0] || "Primary Audience";
  const additionalTone = guidance ? guidance.split(/[.!?]/).map((line) => line.trim()).filter(Boolean) : [];

  if (!baseAnchors.length) {
    return [];
  }

  const modifiers = [
    "cinematic montage",
    "intimate testimonial",
    "unexpected transformation",
    "live activation",
    "social-first mini-series"
  ];

  const hooks = baseAnchors.map((anchor) => anchor.replace(/^[•-]\s*/, ""));
  const generated = [];

  hooks.slice(0, 3).forEach((hook, index) => {
    const modifier = modifiers[index % modifiers.length];
    const slug = hook.split(" ").slice(0, 3).join(" ");
    const title = formatIdeaTitle(slug, index);
    const logline = `A ${modifier} that proves ${hook.toLowerCase()}.`;
    const description = `Showcases the experience through ${voice.toLowerCase()} while keeping the product irresistibly useful.`;
    const tags = [modifier.split(" ")[0], voice.split(" ")[0]];
    const score = {
      boldness: 3 + (index % 3),
      clarity: 4 - (index % 2),
      fit: 4
    };
    if (additionalTone.length) {
      tags.push("Guided");
    }
    generated.push({ title, logline, description, tags, score });
  });

  return generated;
}

function formatIdeaTitle(slug, index) {
  const cleaned = slug
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  const suffix = ["Reboot", "Blueprint", "Pulse", "Momentum", "Resonance"][index % 5];
  return cleaned ? `${cleaned} ${suffix}` : `Concept ${index + 1}`;
}

function openIdeaEditor(detail, module, context, options = {}) {
  const isEdit = typeof options.index === "number";
  const existing = isEdit ? detail.ideas?.[options.index] : null;
  const current = existing
    ? clone(existing)
    : {
        id: `idea-${Date.now()}`,
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
  descField.appendChild(createElement("span", { text: "Description" }));
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
  const saveBtn = createElement("button", { classes: "primary-button", text: isEdit ? "Save Concept" : "Add Concept" });
  saveBtn.type = "submit";
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }
    const payload = {
      ...current,
      title,
      logline: loglineInput.value.trim(),
      description: descInput.value.trim(),
      tags: tagInput.value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    };

    detail.ideas = detail.ideas || [];
    if (isEdit) {
      detail.ideas.splice(options.index, 1, payload);
    } else {
      detail.ideas.unshift(payload);
    }

    context.persistDetail(module.id, "concept-explore", detail);
    showToast(isEdit ? "Concept updated." : "Concept added.");
    modal.close();
    renderConceptExplorer(detail, module, context);
  });

  modal.body.appendChild(form);
  titleInput.focus();
}

function toggleIdeaStatus(detail, module, context, index, status) {
  const idea = detail.ideas?.[index];
  if (!idea) {
    return;
  }
  idea.status = status;
  context.persistDetail(module.id, "concept-explore", detail);
  showToast(status === "shortlisted" ? "Concept shortlisted." : status === "archived" ? "Concept archived." : "Concept updated.");
  renderConceptExplorer(detail, module, context);
}

function promoteIdeaToBoard(detail, module, context, idea) {
  detail.boards = detail.boards || [];
  const existing = detail.boards.find((board) => board.ideaId === idea.id);
  if (existing) {
    showToast("Board already exists for this concept. Opening editor.");
    const index = detail.boards.indexOf(existing);
    openConceptBoardEditor(detail, module, context, { index });
    return;
  }

  const draft = {
    id: `board-${Date.now()}`,
    ideaId: idea.id,
    title: idea.title,
    logline: idea.logline,
    status: "draft",
    versions: [],
    activeVersionId: ""
  };
  detail.boards.unshift(draft);
  context.persistDetail(module.id, "concept-explore", detail);
  openConceptBoardEditor(detail, module, context, { index: 0, seedIdea: idea });
}

function openConceptBoardEditor(detail, module, context, options = {}) {
  const { index, seedIdea } = options;
  const board = detail.boards?.[index];
  if (!board) {
    return;
  }
  const activeVersion = board.versions?.find((version) => version.id === board.activeVersionId) || board.versions?.[0];
  const baseline = activeVersion
    ? clone(activeVersion)
    : {
        id: `board-version-${Date.now()}`,
        version: 1,
        createdAt: new Date().toLocaleString(),
        logline: board.logline || seedIdea?.logline || "",
        narrative: seedIdea?.description || "",
        keyVisuals: [],
        tone: [],
        strategyLink: "",
        aiGuidance: seedIdea?.title || "",
        anchorSummary: getBriefAnchors(context).slice(0, 3)
      };

  const modal = openModal("Concept Board", { dialogClass: "modal-dialog-wide" });
  const form = document.createElement("form");
  form.className = "modal-form concept-board-form";

  const titleField = createElement("label");
  titleField.appendChild(createElement("span", { text: "Title" }));
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = board.title || "";
  titleField.appendChild(titleInput);
  form.appendChild(titleField);

  const loglineField = createElement("label");
  loglineField.appendChild(createElement("span", { text: "Logline" }));
  const loglineInput = document.createElement("textarea");
  loglineInput.rows = 2;
  loglineInput.value = baseline.logline || "";
  loglineField.appendChild(loglineInput);
  form.appendChild(loglineField);

  const narrativeField = createElement("label");
  narrativeField.appendChild(createElement("span", { text: "Narrative" }));
  const narrativeInput = document.createElement("textarea");
  narrativeInput.rows = 6;
  narrativeInput.value = baseline.narrative || "";
  narrativeField.appendChild(narrativeInput);
  form.appendChild(narrativeField);

  const visualsField = createElement("label");
  visualsField.appendChild(createElement("span", { text: "Key Visual Moments" }));
  const visualsInput = document.createElement("textarea");
  visualsInput.rows = 4;
  visualsInput.placeholder = "One moment per line";
  visualsInput.value = (baseline.keyVisuals || []).join("\n");
  visualsField.appendChild(visualsInput);
  form.appendChild(visualsField);

  const toneField = createElement("label");
  toneField.appendChild(createElement("span", { text: "Tone & Style" }));
  const toneInput = document.createElement("input");
  toneInput.type = "text";
  toneInput.placeholder = "Comma separated";
  toneInput.value = (baseline.tone || []).join(", ");
  toneField.appendChild(toneInput);
  form.appendChild(toneField);

  const strategyField = createElement("label");
  strategyField.appendChild(createElement("span", { text: "Link to Strategy" }));
  const strategyInput = document.createElement("input");
  strategyInput.type = "text";
  strategyInput.value = baseline.strategyLink || "";
  strategyField.appendChild(strategyInput);
  form.appendChild(strategyField);

  const assistantRow = createElement("div", { classes: "concept-board-assist" });
  const assistBtn = createElement("button", { classes: "ghost-button", text: "Ask AI to Expand" });
  assistBtn.type = "button";
  assistBtn.addEventListener("click", () => {
    const draft = generateBoardDraft({
      title: titleInput.value.trim(),
      logline: loglineInput.value.trim() || seedIdea?.logline || board.logline,
      anchors: getBriefAnchors(context),
      personas: getPersonaVoices(context)
    });
    if (!draft) {
      showToast("Need a logline and brief anchors to auto-build the board.");
      return;
    }
    narrativeInput.value = draft.narrative;
    visualsInput.value = draft.keyVisuals.join("\n");
    toneInput.value = draft.tone.join(", ");
    strategyInput.value = draft.strategyLink;
    assistBtn.textContent = "Draft Updated";
    setTimeout(() => (assistBtn.textContent = "Ask AI to Expand"), 1200);
  });
  assistantRow.appendChild(assistBtn);
  form.appendChild(assistantRow);

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
      id: `board-version-${Date.now()}`,
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
      aiGuidance: baseline.aiGuidance,
      anchorSummary: getBriefAnchors(context).slice(0, 3)
    };

    board.title = titleInput.value.trim() || board.title;
    board.logline = payload.logline;
    board.versions = board.versions || [];
    board.versions.unshift(payload);
    board.activeVersionId = payload.id;
    board.status = board.status === "archived" ? "draft" : board.status;

    context.persistDetail(module.id, "concept-explore", detail);
    showToast("Board version saved.");
    modal.close();
    renderConceptExplorer(detail, module, context);
  });

  modal.body.appendChild(form);
  titleInput.focus();
}

function generateBoardDraft({ title, logline, anchors, personas }) {
  if (!logline || !anchors.length) {
    return null;
  }
  const persona = personas[0] || "audience";
  const hero = title || logline.split(" ").slice(0, 3).join(" ");
  return {
    narrative: `${hero} follows ${persona.toLowerCase()} as they realise ${logline.toLowerCase()}. Each beat proves the promise while keeping the product central to the emotion.`,
    keyVisuals: [
      "Establishing shot grounding the world and tension",
      "Unexpected visual twist that dramatises the product benefit",
      "Intimate close-up capturing the emotional resolution",
      "Hero product moment with mnemonic lockup"
    ],
    tone: ["Cinematic", "Human", "Confident"],
    strategyLink: anchors[0] || "Linked to primary brief insight"
  };
}

function duplicateBoard(detail, module, context, index) {
  const board = detail.boards?.[index];
  if (!board) {
    return;
  }
  const copy = clone(board);
  copy.id = `board-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  copy.title = `${board.title || "Concept"} Copy`;
  copy.versions = (copy.versions || []).map((version) => ({
    ...version,
    id: `board-version-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
  }));
  copy.activeVersionId = copy.versions[0]?.id || "";
  detail.boards.splice(index + 1, 0, copy);
  context.persistDetail(module.id, "concept-explore", detail);
  showToast("Board duplicated.");
  renderConceptExplorer(detail, module, context);
}

function changeBoardStatus(detail, module, context, index, status) {
  const board = detail.boards?.[index];
  if (!board) {
    return;
  }
  board.status = status;
  context.persistDetail(module.id, "concept-explore", detail);
  showToast(status === "client-ready" ? "Marked client ready." : status === "archived" ? "Board archived." : "Board updated.");
  renderConceptExplorer(detail, module, context);
}

function openVersionHistoryDialog(board) {
  const modal = openModal("Version History", { dialogClass: "modal-dialog-wide" });
  const body = modal.body;
  if (!board.versions?.length) {
    body.appendChild(createElement("p", { text: "No versions captured yet." }));
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
  body.appendChild(list);
}

function runConceptCritique(detail, module, context, selectionValue, guidance) {
  const [boardId, versionId] = selectionValue.split(":");
  const conceptDetail = context.ensureStepDetail(module, "concept-explore");
  const board = conceptDetail.boards?.find((item) => item.id === boardId);
  if (!board) {
    showToast("Selected board not found.");
    return;
  }
  const version = board.versions?.find((item) => item.id === versionId) || board.versions?.[0];
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
    `Narrative clarity: ${version.narrative ? "Story beats ladder cleanly from tension to resolution." : "Needs stronger arc."}`,
    `Anchor alignment: ${version.anchorSummary?.[0] || "Keep referencing the brief explicitly."}`
  ];

  const risks = [
    guidanceCue.includes("budget")
      ? "Production scale: Consider a leaner execution variant to control budget."
      : "Ensure production plan covers both hero and cut-down formats.",
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
    const pill = createElement("span", { classes: ["pill", critique.status === "closed" ? "status-complete" : "status-attention"] });
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
      actions.appendChild(createActionButton("Mark Addressed", () => markCritiqueAddressed(detail, module, context, index)));
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

function getBriefAnchors(context) {
  const project = context.getProject?.();
  if (!project?.modules) {
    return [];
  }
  const discoverModule = project.modules.find((item) => item.id === "discover-brief");
  if (!discoverModule) {
    return [];
  }
  const detail = context.ensureStepDetail(discoverModule, "structure-input");
  const activeSummary = context.getActiveSummaryVersion(detail);
  const summary = activeSummary?.summary?.length ? activeSummary.summary : detail.summary || [];
  return summary.filter(Boolean);
}

function getPersonaVoices(context) {
  const project = context.getProject?.();
  if (!project?.modules) {
    return [];
  }
  const discoverModule = project.modules.find((item) => item.id === "discover-brief");
  if (!discoverModule) {
    return [];
  }
  const detail = context.ensureStepDetail(discoverModule, "persona-builder");
  return (detail.personas || []).slice(0, 2).map((persona) => persona.name || persona.role || "Persona");
}
