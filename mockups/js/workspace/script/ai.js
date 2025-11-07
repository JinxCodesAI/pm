function formatInstruction(instruction) {
  const trimmed = instruction.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function buildPurpose({ instruction, anchors, personas, conceptLogline }) {
  const parts = [];
  if (instruction) {
    parts.push(`${instruction}${instruction.endsWith('.') ? '' : '.'}`);
  } else {
    parts.push("Advance the story while staying on-brief.");
  }
  if (anchors.length) {
    parts.push(`Ground the beat in ${anchors[0].toLowerCase()}.`);
  }
  if (conceptLogline) {
    parts.push(`Support the concept: ${conceptLogline}.`);
  }
  if (personas.length) {
    parts.push(`Keep the voice ${personas.join(", ")}.`);
  }
  return parts.join(" ");
}

function buildVisual({ instruction, keyVisual }) {
  if (keyVisual) {
    return `Frame the key visual “${keyVisual}” with cinematic detail.`;
  }
  if (instruction) {
    return `${instruction}${instruction.endsWith('.') ? '' : '.'}`;
  }
  return "Highlight the product hero with dynamic motion.";
}

function buildNotes({ boardTitle, anchors, instruction }) {
  const notes = [];
  if (boardTitle) {
    notes.push(`Stay true to the ${boardTitle} concept.`);
  }
  if (anchors[1]) {
    notes.push(`Call back to ${anchors[1].toLowerCase()}.`);
  }
  if (instruction) {
    notes.push(`AI follow-up: ${instruction}`);
  }
  return notes.join("\n");
}

export function generateSceneBeatDraft({
  instructions = "",
  anchors = [],
  personas = [],
  conceptLogline = "",
  keyVisual = "",
  boardTitle = "",
  boardId = "",
  versionId = "",
  sceneIndex = 0,
  existingScene = null,
  beats = []
}) {
  const formattedInstruction = formatInstruction(instructions);
  const safeAnchors = Array.isArray(anchors) ? anchors.filter(Boolean) : [];
  const baseTitle = existingScene?.title?.trim() || keyVisual || `Scene ${sceneIndex + 1}`;
  const purpose = buildPurpose({
    instruction: formattedInstruction,
    anchors: safeAnchors,
    personas,
    conceptLogline
  });
  const visualFocus = buildVisual({ instruction: formattedInstruction, keyVisual });
  const notes = buildNotes({ boardTitle, anchors: safeAnchors, instruction: formattedInstruction });

  const duration = existingScene?.duration || (beats.length > 4 ? "0:15" : "0:20");
  const aiAnchors = safeAnchors.slice(0, 3);
  if (formattedInstruction && !aiAnchors.includes(formattedInstruction)) {
    aiAnchors.push(formattedInstruction);
  }

  return {
    title: baseTitle,
    purpose,
    visualFocus,
    notes,
    duration,
    anchors: aiAnchors,
    source: keyVisual
      ? {
          boardId: boardId || existingScene?.source?.boardId || "",
          versionId: versionId || existingScene?.source?.versionId || "",
          keyVisual
        }
      : existingScene?.source || null,
    aiGuidance: formattedInstruction
  };
}
