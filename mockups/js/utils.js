const STATUS_LABELS = {
  "in-progress": "In Progress",
  "needs-review": "Needs Review",
  complete: "Complete",
  "not-started": "Not Started",
  planning: "Planning",
  discovery: "Discovery"
};

const STATUS_CLASSES = {
  "in-progress": "status-progress",
  "needs-review": "status-attention",
  complete: "status-complete",
  "not-started": "status-queued",
  planning: "status-progress",
  discovery: "status-active"
};

export function formatStatus(status) {
  if (!status) {
    return "—";
  }
  return STATUS_LABELS[status] || status;
}

export function statusToClass(status) {
  if (!status) {
    return "";
  }
  return STATUS_CLASSES[status] || "";
}

export function applyPill(pill, status, fallback = "—") {
  if (!pill) {
    return;
  }

  const cls = statusToClass(status);
  pill.className = `pill${cls ? ` ${cls}` : ""}`;
  pill.textContent = formatStatus(status) || fallback;
}

export function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.classes) {
    if (Array.isArray(options.classes)) {
      el.classList.add(...options.classes.filter(Boolean));
    } else if (options.classes) {
      el.className = options.classes;
    }
  }
  if (options.text !== undefined) {
    el.textContent = options.text;
  }
  if (options.html !== undefined) {
    el.innerHTML = options.html;
  }
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        el.setAttribute(key, value);
      }
    });
  }
  return el;
}

export function clearChildren(node) {
  if (!node) {
    return;
  }
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function parseQuery() {
  return new URLSearchParams(window.location.search);
}

export function toggleHidden(element, hidden) {
  if (!element) {
    return;
  }
  element.classList.toggle("hidden", hidden);
}

export function cycleArray(array, index) {
  if (!array || array.length === 0) {
    return { nextIndex: 0, item: undefined };
  }
  const nextIndex = index % array.length;
  return { nextIndex: nextIndex + 1, item: array[nextIndex] };
}
