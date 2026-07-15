import type { ChangeObject } from "diff";

export function appendWordDiff(
  container: HTMLElement,
  diff: ChangeObject<string>[],
) {
  const line = document.createElement("div");
  line.className = "editpage-diff-line";

  diff.forEach((part) => {
    if (part.added) {
      const span = document.createElement("span");
      span.className = "diff-added";
      span.textContent = part.value;
      line.appendChild(span);
    } else if (part.removed) {
      const span = document.createElement("span");
      span.className = "diff-removed";
      span.textContent = part.value;
      line.appendChild(span);
    } else {
      line.appendChild(document.createTextNode(part.value ?? ""));
    }
  });

  container.appendChild(line);
}
