import { loadConfig, saveConfig } from "../config";
import type { FieldStatus } from "../compare/compare";

function applySavedPanelLayout(panel: HTMLDivElement) {
  const { panelPosition, panelSize } = loadConfig();
  if (panelPosition) {
    panel.style.top = `${panelPosition.top}px`;
    panel.style.left = `${panelPosition.left}px`;
    panel.style.right = "auto";
  }
  if (panelSize) {
    panel.style.width = `${panelSize.width}px`;
    panel.style.height = `${panelSize.height}px`;
  }
}

function resetPanelLayout() {
  saveConfig({
    ...loadConfig(),
    panelPosition: null,
    panelSize: null,
  });
  const panel = document.querySelector<HTMLDivElement>(".editpage-panel");
  if (panel) {
    panel.style.inset = "";
    panel.style.width = "";
    panel.style.height = "";
  }
}

// We only show this when the panel is actually visible
let resetPanelLayoutMenuId: number | null = null;

export function watchPanelForResetMenuCommand() {
  const sync = () => {
    const panelVisible = !!document.querySelector(".editpage-panel");
    if (panelVisible && resetPanelLayoutMenuId === null) {
      resetPanelLayoutMenuId = GM_registerMenuCommand(
        "↺ Reset panel position & size",
        resetPanelLayout,
      );
    } else if (!panelVisible && resetPanelLayoutMenuId !== null) {
      GM_unregisterMenuCommand(resetPanelLayoutMenuId);
      resetPanelLayoutMenuId = null;
    }
  };
  sync();
  new MutationObserver(sync).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function makePanelDraggable(panel: HTMLDivElement, handle: HTMLElement) {
  handle.classList.add("editpage-panel-draggable");
  handle.title = "Drag to move";

  let startX = 0;
  let startY = 0;
  let startTop = 0;
  let startLeft = 0;

  handle.addEventListener("pointerdown", (e) => {
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startTop = rect.top;
    startLeft = rect.left;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    panel.style.top = `${startTop + (e.clientY - startY)}px`;
    panel.style.left = `${startLeft + (e.clientX - startX)}px`;
    panel.style.right = "auto";
  });

  handle.addEventListener("pointerup", (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    handle.classList.remove("dragging");
    const rect = panel.getBoundingClientRect();
    const cfg = loadConfig();
    cfg.panelPosition = { top: rect.top, left: rect.left };
    saveConfig(cfg);
  });
}

function makePanelResizable(panel: HTMLDivElement) {
  const RESIZE_HANDLE_SIZE = 20;

  panel.addEventListener("mousedown", (e) => {
    const rect = panel.getBoundingClientRect();
    const inHandle =
      e.clientX >= rect.right - RESIZE_HANDLE_SIZE &&
      e.clientY >= rect.bottom - RESIZE_HANDLE_SIZE;
    if (!inHandle) return;

    const onMouseUp = () => {
      window.removeEventListener("mouseup", onMouseUp);
      const cfg = loadConfig();
      cfg.panelSize = { width: panel.offsetWidth, height: panel.offsetHeight };
      saveConfig(cfg);
    };
    window.addEventListener("mouseup", onMouseUp);
  });
}

export function createResultPanel(form: HTMLFormElement, scraperName?: string) {
  form.querySelector(".editpage-panel")?.remove();

  const panel = document.createElement("div");
  panel.className = "editpage-panel";

  const title = document.createElement("div");
  title.className = "editpage-panel-title";
  title.textContent = scraperName
    ? `Rescraped using ${scraperName}`
    : "Rescraped";
  panel.appendChild(title);

  const dl = document.createElement("dl");
  panel.appendChild(dl);

  form.appendChild(panel);
  applySavedPanelLayout(panel);
  makePanelDraggable(panel, title);
  makePanelResizable(panel);
  return { panel, dl };
}

export function showPanelError(form: HTMLFormElement, message: string | null) {
  let panel = form.querySelector(".editpage-panel");
  if (!panel) {
    ({ panel } = createResultPanel(form));
  }

  // Remove any previous error message so re-scraping replaces it cleanly
  panel.querySelector(".editpage-scrape-error")?.remove();

  const err = document.createElement("div");
  err.className = "editpage-scrape-error";
  err.style.cssText =
    "margin-top:.4rem;color:#ef4444;font-size:.75rem;word-break:break-word;white-space:pre-wrap;";
  err.textContent = message;
  panel.appendChild(err);
}

export type BodyBuilder = (body: HTMLDivElement, summary: HTMLElement) => void;

export function addRow(
  container: HTMLDListElement,
  labelText: string | null,
  status: FieldStatus,
  isOpen: boolean,
  buildBody: BodyBuilder,
) {
  const details = document.createElement("details");
  details.className = `editpage-row editpage-${status}`;
  details.open = isOpen;

  const summary = document.createElement("summary");

  const labelSpan = document.createElement("span");
  labelSpan.className = "editpage-row-label";
  labelSpan.textContent = labelText;

  const badgeText = {
    match: "same",
    diff: "diff",
    missing: "new",
    approx: "≈same",
    additional: "+more",
  };
  const badge = document.createElement("span");
  badge.className = "editpage-row-badge";
  badge.textContent = `(${badgeText[status] ?? status})`;

  summary.appendChild(labelSpan);
  summary.appendChild(badge);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "editpage-row-body";
  buildBody(body, summary);
  details.appendChild(body);

  container.appendChild(details);
  return { details, summary, body, badge };
}

export function markDone(details: HTMLDetailsElement, badge: HTMLSpanElement) {
  details.classList.remove(
    "editpage-diff",
    "editpage-missing",
    "editpage-approx",
  );
  details.classList.add("editpage-match");
  if (badge) badge.textContent = "(done ✓)";
}
