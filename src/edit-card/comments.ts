import { setNativeValue } from "../ui/dom";
import { createFontAwesomeIcon, setIconTitle } from "../ui/icons";

function findCommentTextarea(editCard: Element): HTMLTextAreaElement | null {
  return editCard.querySelector<HTMLTextAreaElement>("textarea");
}

function findAddCommentButton(editCard: Element): HTMLButtonElement | null {
  const buttons = Array.from(
    editCard.querySelectorAll<HTMLButtonElement>("button"),
  );
  return (
    buttons.find((btn) => btn.textContent?.trim() === "Add Comment") ?? null
  );
}

function waitForCommentTextarea(
  editCard: Element,
  timeoutMs = 2000,
): Promise<HTMLTextAreaElement | null> {
  const existing = findCommentTextarea(editCard);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      const textarea = findCommentTextarea(editCard);
      if (textarea) {
        obs.disconnect();
        clearTimeout(timer);
        resolve(textarea);
      }
    });
    obs.observe(editCard, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      obs.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

export async function addCommentToEditCard(
  editCard: Element,
  text: string,
): Promise<void> {
  let textarea = findCommentTextarea(editCard);

  if (!textarea) {
    const addButton = findAddCommentButton(editCard);
    if (!addButton) {
      console.error('[rescrape] Could not find "Add Comment" button');
      return;
    }
    addButton.click();
    textarea = await waitForCommentTextarea(editCard);
    if (!textarea) {
      console.error(
        '[rescrape] Comment textarea did not appear after clicking "Add Comment"',
      );
      return;
    }
  }

  const existing = textarea.value.trim();
  const nextValue = existing ? `${existing}\n${text}` : text;
  setNativeValue(textarea, nextValue);
  // Don't scroll down to comment box, let me click more 'add comment' links
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(nextValue.length, nextValue.length);
}

export function makeCommentIcon(
  editCard: Element,
  text: string,
): SVGSVGElement {
  const icon = createFontAwesomeIcon(
    "comment",
    "rescrape-icon",
    "verifiable",
    "rescrape-injected",
  );
  setIconTitle(icon, `Add comment: "${text}"`);
  icon.addEventListener("click", (event) => {
    event.stopPropagation();
    addCommentToEditCard(editCard, text);
    icon.classList.remove("verifiable");
    icon.classList.add("rescrape-comment-added");
  });
  return icon;
}
