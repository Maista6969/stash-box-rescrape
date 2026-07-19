export type ToastVariant = "info" | "warning" | "error";

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  info: "#89b4fa",
  warning: "#f97316",
  error: "#ef4444",
};

let host: HTMLElement | null = null;
let stack: HTMLElement | null = null;

function getStack(): HTMLElement {
  if (host && stack && document.body.contains(host)) return stack;

  const style = new CSSStyleSheet();
  style.replaceSync(`
    .toast-stack {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      max-width: 340px;
      background: #1e1e2e;
      color: #cdd6f4;
      border-left: 4px solid var(--accent);
      border-radius: 8px;
      padding: 12px 14px;
      font: 13px/1.5 system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      animation: toast-in 0.2s ease-out;
    }
    .toast-message {
      flex: 1;
      white-space: pre-wrap;
    }
    .toast-close {
      background: none;
      border: none;
      color: #6c7086;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 0;
    }
    .toast-close:hover {
      color: #cdd6f4;
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateX(12px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
  `);

  host = document.createElement("div");
  host.className = "rescrape-toast-host";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.adoptedStyleSheets = [style];

  stack = document.createElement("div");
  stack.className = "toast-stack";
  shadow.appendChild(stack);

  document.body.appendChild(host);
  return stack;
}

export function showToast(
  message: string,
  variant: ToastVariant = "info",
  durationMs = 8000,
): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.setProperty("--accent", VARIANT_ACCENT[variant]);

  const text = document.createElement("div");
  text.className = "toast-message";
  text.textContent = message;

  const close = document.createElement("button");
  close.className = "toast-close";
  close.textContent = "×";
  close.title = "Dismiss";

  const dismiss = () => toast.remove();
  close.addEventListener("click", dismiss);

  toast.append(text, close);
  getStack().appendChild(toast);

  if (durationMs > 0) setTimeout(dismiss, durationMs);
}
