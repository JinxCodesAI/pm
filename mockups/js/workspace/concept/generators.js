import { getBriefAnchors, getPersonaVoices } from "./support.js";

export function composeIdeaSeeds(context, guidance) {
  const anchors = getBriefAnchors(context).slice(0, 5);
  const personas = getPersonaVoices(context);
  if (!anchors.length) {
    return { anchors: [], personas, seeds: [] };
  }

  const cues = parseGuidance(guidance);

  const modifiers = [
    "cinematic montage",
    "intimate testimonial",
    "unexpected transformation",
    "live activation",
    "social-first mini-series"
  ];

  const seeds = anchors.slice(0, 3).map((anchor, index) => {
    const cleanedAnchor = anchor.replace(/^[•-]\s*/, "");
    const modifier = modifiers[index % modifiers.length];
    const persona = personas[0] || "Audience";
    const title = formatIdeaTitle(cleanedAnchor, index);
    return {
      title,
      logline: `A ${modifier} that proves ${cleanedAnchor.toLowerCase()}.`,
      description: `Told through ${persona.toLowerCase()} to dramatise the value prop with momentum.`,
      tags: [modifier.split(" ")[0], persona.split(" ")[0], ...(cues.length ? ["Guided"] : [])],
      score: {
        boldness: 3 + (index % 3),
        clarity: 4 - (index % 2),
        fit: 4
      }
    };
  });

  return { anchors, personas, seeds };
}

export function formatIdeaTitle(anchor, index) {
  const cleaned = anchor
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  const suffix = ["Reboot", "Blueprint", "Pulse", "Momentum", "Resonance"][index % 5];
  return cleaned ? `${cleaned} ${suffix}` : `Concept ${index + 1}`;
}

export function generateBoardDraft({ context, title, logline, guidance }) {
  const anchors = getBriefAnchors(context);
  if (!logline || !anchors.length) {
    return null;
  }
  const personas = getPersonaVoices(context);
  const persona = personas[0] || "Audience";
  const hero = title || logline.split(" ").slice(0, 3).join(" ");
  const cues = parseGuidance(guidance);
  return {
    narrative: `${hero} follows ${persona.toLowerCase()} as they realise ${logline.toLowerCase()}. ${
      cues.length ? `Focus on: ${cues.join("; ")}. ` : ""
    }Each beat proves the promise while keeping the product central to the emotion.`,
    keyVisuals: [
      "Establishing shot grounding the world and tension",
      "Unexpected visual twist that dramatises the product benefit",
      "Intimate close-up capturing the emotional resolution",
      "Hero product moment with mnemonic lockup"
    ],
    tone: ["Cinematic", "Human", "Confident", ...(cues.length ? ["Guided"] : [])],
    strategyLink: anchors[0] || "Linked to primary brief insight"
  };
}

export function suggestBoardTitle({ context, logline, guidance }) {
  const anchors = getBriefAnchors(context);
  const base = (logline || anchors[0] || "").replace(/^[•-]\s*/, "");
  if (!base) {
    return "";
  }
  const cues = parseGuidance(guidance);
  const title = formatIdeaTitle(base, 0);
  if (!cues.length) {
    return title;
  }
  const cue = cues[0]
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2)
    .map(capitalise)
    .join(" ");
  return cue ? `${title} ${cue}`.trim() : title;
}

export function suggestBoardLogline({ context, title, guidance }) {
  const anchors = getBriefAnchors(context);
  if (!anchors.length) {
    return "";
  }
  const personas = getPersonaVoices(context);
  const persona = personas[0] || "Audience";
  const cues = parseGuidance(guidance);
  const tone = cues[0] ? cues[0].toLowerCase() : "cinematic";
  const anchor = anchors[0].replace(/^[•-]\s*/, "").replace(/[.]+$/, "");
  const subject = title || persona;
  return `${subject || "Our hero"} leads a ${tone} story that proves ${anchor.toLowerCase()}.`;
}

export function suggestKeyVisualMoments({ context, title, logline, guidance }) {
  const draft = generateBoardDraft({ context, title, logline, guidance });
  return draft?.keyVisuals || [];
}

export function suggestToneKeywords({ context, title, logline, guidance }) {
  const draft = generateBoardDraft({ context, title, logline, guidance });
  return draft?.tone || [];
}

export function suggestStrategyLink({ context, title, logline, guidance }) {
  const anchors = getBriefAnchors(context);
  if (!anchors.length) {
    return "";
  }
  const cues = parseGuidance(guidance);
  const lead = anchors[0].replace(/^[•-]\s*/, "");
  if (!cues.length) {
    return `Connects directly to: ${lead}`;
  }
  return `${lead} • Focus: ${cues.join("; ")}`;
}

export function suggestIdeaTitle({ context, logline, guidance }) {
  const anchors = getBriefAnchors(context);
  const base = (logline || anchors[0] || "").replace(/^[•-]\s*/, "");
  if (!base) {
    return "";
  }
  const cues = parseGuidance(guidance);
  const title = formatIdeaTitle(base, 0);
  if (!cues.length) {
    return title;
  }
  const cue = cues[0]
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2)
    .map(capitalise)
    .join(" ");
  return cue ? `${title} ${cue}`.trim() : title;
}

export function suggestIdeaLogline({ context, title, guidance }) {
  const anchors = getBriefAnchors(context);
  if (!anchors.length) {
    return "";
  }
  const personas = getPersonaVoices(context);
  const persona = personas[0] || "Audience";
  const cues = parseGuidance(guidance);
  const anchor = anchors[0].replace(/^[•-]\s*/, "").replace(/[.]+$/, "");
  const lens = cues[0] ? cues[0].toLowerCase() : "cinematic";
  const subject = title || persona;
  return `${subject || "Our hero"} drives a ${lens} story that proves ${anchor.toLowerCase()}.`;
}

export function suggestIdeaDescription({ context, title, logline, guidance }) {
  const anchors = getBriefAnchors(context);
  if (!anchors.length && !logline) {
    return "";
  }
  const personas = getPersonaVoices(context);
  const persona = personas[0] || "Audience";
  const cues = parseGuidance(guidance);
  const emphasis = cues.length ? `Focus on ${cues.join("; ")}. ` : "";
  const anchor = anchors[0]?.replace(/^[•-]\s*/, "") || logline || "the core promise";
  const hero = title || "The concept";
  return `${hero} follows ${persona.toLowerCase()} as they dramatise how ${anchor.toLowerCase()}. ${emphasis}Each beat keeps the product unmistakably central.`;
}

export function suggestIdeaTags({ context, logline, guidance }) {
  const anchors = getBriefAnchors(context);
  const personas = getPersonaVoices(context);
  const cues = parseGuidance(guidance);
  const tags = [];
  if (anchors[0]) {
    tags.push(...anchors[0].split(/[^a-z0-9]+/i).filter(Boolean).slice(0, 2).map(capitalise));
  }
  if (logline) {
    tags.push(...logline.split(/[^a-z0-9]+/i).filter(Boolean).slice(0, 2).map(capitalise));
  }
  if (personas[0]) {
    tags.push(personas[0].split(/[^a-z0-9]+/i)[0]);
  }
  cues.slice(0, 2).forEach((cue) => {
    const tag = cue
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .slice(0, 2)
      .map(capitalise)
      .join(" ");
    if (tag) {
      tags.push(tag);
    }
  });
  const unique = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  return unique.slice(0, 6);
}

function parseGuidance(guidance) {
  return guidance
    ? guidance
        .split(/[.!?]/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function capitalise(word) {
  return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "";
}
