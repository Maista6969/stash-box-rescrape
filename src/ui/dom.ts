// Sets the value in a way that React likes
export function setNativeValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    prototype,
    "value",
  )?.set;
  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    throw new Error("Element has no value setter");
  }
  const eventName = element instanceof HTMLSelectElement ? "change" : "input";
  element.dispatchEvent(new Event(eventName, { bubbles: true }));
}

// A visual indicator for the user that the field has actually been changed
export function flashField(el: Element) {
  el.classList.add("editpage-flash");
  setTimeout(() => el.classList.remove("editpage-flash"), 1500);
}

// React bootstrap typeahead menus don't close on blur so we pretend to hit Esc
export function closeTypeaheadMenu(input: HTMLInputElement) {
  const eventInit = { key: "Escape", code: "Escape", bubbles: true };
  input.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  input.dispatchEvent(new KeyboardEvent("keyup", eventInit));
}

export function findMatchingOption(
  select: HTMLSelectElement,
  raw: string,
): HTMLOptionElement | undefined {
  const target = raw.trim().toLowerCase();
  return Array.from(select.options).find(
    (opt) =>
      opt.value.toLowerCase() === target ||
      opt.textContent?.trim().toLowerCase() === target,
  );
}

export function getTabButton(text: string) {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("form ul.nav button.nav-link"),
  );
  return buttons.find((btn) => btn.textContent.trim() === text);
}

export function currentFieldValue(form: HTMLFormElement, name: string): string {
  return (
    form.querySelector<HTMLInputElement>(`*[name="${name}"]`)?.value?.trim() ??
    ""
  );
}

export function sameText(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type ApplyFunction = (() => void) | (() => Promise<void>);

export function makeSetLink(label: string | null, applyFn: ApplyFunction) {
  const a = document.createElement("a");
  a.className = "editpage-set-link";
  a.textContent = label;
  a.href = "#";
  a.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    applyFn();
  });
  return a;
}

// Wires a click-to-toggle: clicking `trigger` flips an open/closed boolean
// and re-invokes `onToggle` with the new state (also called once up front
// with `initiallyOpen` to apply the starting state).
export function makeToggle(
  trigger: HTMLElement,
  initiallyOpen: boolean,
  onToggle: (open: boolean) => void,
) {
  let open = initiallyOpen;
  onToggle(open);
  trigger.onclick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    open = !open;
    onToggle(open);
  };
}

export function waitForReactSelectOption(
  hasOption: () => boolean,
  observeRoot: Node,
  timeoutMs: number,
): Promise<boolean> {
  return Promise.race([
    new Promise<boolean>((resolve) => {
      const obs = new MutationObserver(() => {
        if (hasOption()) {
          obs.disconnect();
          resolve(true);
        }
      });
      obs.observe(observeRoot, { childList: true, subtree: true });
    }),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs),
    ),
  ]);
}
