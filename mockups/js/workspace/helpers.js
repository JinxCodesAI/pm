import { createElement } from "../utils.js";

let activeModal = null;

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getStepBody() {
  return document.getElementById("step-body");
}

export function renderDefaultStepBody(message = "Select a step to view detailed tools.") {
  const body = getStepBody();
  if (!body) {
    return;
  }
  body.classList.add("muted");
  body.textContent = message;
}

export function renderFallbackStepBody(detail) {
  const body = getStepBody();
  if (!body) {
    return;
  }
  body.classList.remove("muted");
  body.innerHTML = "";
  body.appendChild(createElement("p", { text: "This step does not yet have a dedicated workspace view." }));
  if (detail && Object.keys(detail).length) {
    body.appendChild(createElement("pre", { classes: "muted", text: JSON.stringify(detail, null, 2) }));
  }
}

export function createSectionHeading(title, subtitle) {
  const wrapper = createElement("div", { classes: "section-heading" });
  wrapper.appendChild(createElement("h3", { text: title }));
  if (subtitle) {
    wrapper.appendChild(createElement("p", { classes: "muted", text: subtitle }));
  }
  return wrapper;
}

export function createActionButton(label, handler) {
  const button = createElement("button", { classes: "chip-button", text: label });
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

export function openModal(title, options = {}) {
  if (activeModal?.element) {
    activeModal.element.remove();
    activeModal = null;
  }

  const modalEl = document.createElement("div");
  modalEl.className = "modal overlay";

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

export function openConfirmModal({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm }) {
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

export function showToast(message) {
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

export function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value ?? "—";
  }
}

export function renderError(error) {
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

