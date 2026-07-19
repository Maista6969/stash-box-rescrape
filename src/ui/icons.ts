const ICON_PATHS = {
  "magnifying-glass":
    "M500.3 455.7L405.1 360.6C434.9 322.7 448 277.4 448 230.4 448 103.2 348.8 4 221.6 4S-4 103.2-4 230.4s99.2 226.4 226.4 226.4c46.9 0 91.2-13.1 129.1-42.9l95.1 95.1c12.5 12.5 32.8 12.5 45.3 0 12.4-12.5 12.4-32.8-.6-45.3zM54 230.4c0-92.8 75.2-168 168-168s168 75.2 168 168-75.2 168-168 168-168-75.2-168-168z",
  "circle-xmark":
    "M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 464c-119.3 0-216-96.7-216-216S136.7 40 256 40s216 96.7 216 216-96.7 216-216 216zm104.5-312.5c6.2 6.2 6.2 16.4 0 22.6L278.6 256l81.9 81.9c6.2 6.2 6.2 16.4 0 22.6s-16.4 6.2-22.6 0L256 278.6l-81.9 81.9c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6l81.9-81.9-81.9-81.9c-6.2-6.2-6.2-16.4 0-22.6s16.4-6.2 22.6 0l81.9 81.9 81.9-81.9c6.2-6.2 16.4-6.2 22.6 0z",
  spinner:
    "M304 48a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zm0 416a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zM48 304a48 48 0 1 0 0-96 48 48 0 1 0 0 96zm464-48a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zM142.9 437A48 48 0 1 0 75 369.1 48 48 0 1 0 142.9 437zm0-294.2A48 48 0 1 0 75 75a48 48 0 1 0 67.9 67.9zM369.1 437A48 48 0 1 0 437 369.1 48 48 0 1 0 369.1 437z",
  comment:
    "M256 448c141.4 0 256-93.1 256-208S397.4 32 256 32 0 125.1 0 240c0 45.1 17.7 86.8 47.7 120.9-1.9 24.5-11.4 46.3-21.4 62.9-5.5 9.2-11.1 16.6-15.2 21.6-2.1 2.5-3.7 4.4-4.9 5.7-.6.6-1 1.1-1.3 1.4l-.3.3c-4.6 4.6-5.9 11.4-3.4 17.4 2.5 6 8.3 9.9 14.8 9.9 28.7 0 57.6-8.9 81.6-19.3 22.9-10 42.4-21.9 54.3-30.6 31.8 11.5 67 17.9 104.5 17.9z",
  "arrows-rotate":
    "M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160 352 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l111.5 0c0 0 0 0 0 0l.4 0c17.7 0 32-14.3 32-32l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 35.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5zM39 289.3c-5 1.5-9.8 4.2-13.7 8.2c-4 4-6.7 8.8-8.1 14c-.3 1.2-.6 2.5-.8 3.8c-.3 1.7-.4 3.4-.4 5.1L16 432c0 17.7 14.3 32 32 32s32-14.3 32-32l0-35.1 17.6 17.5c0 0 0 0 0 0c87.5 87.4 229.3 87.4 316.7 0c24.4-24.4 42.1-53.1 52.9-83.8c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0l-.1-.1L125.6 352l34.4 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L48.4 288c-1.6 0-3.2 .1-4.8 .3s-3.1 .5-4.6 1z",
  bug: "M256 0c53 0 96 43 96 96l0 3.6c0 15.7-12.7 28.4-28.4 28.4l-135.1 0c-15.7 0-28.4-12.7-28.4-28.4l0-3.6c0-53 43-96 96-96zM41.4 105.4c12.5-12.5 32.8-12.5 45.3 0l64 64c.7 .7 1.3 1.4 1.9 2.1c14.2-7.3 30.4-11.4 47.5-11.4l112 0c17.1 0 33.2 4.1 47.5 11.4c.6-.7 1.2-1.4 1.9-2.1l64-64c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3l-64 64c-.7 .7-1.4 1.3-2.1 1.9c6.2 12 10.1 25.3 11.1 39.5l64.3 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c0 24.6-5.5 47.8-15.4 68.6c2.2 1.3 4.2 2.9 6 4.8l64 64c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0l-63.1-63.1c-24.5 21.8-55.8 36.2-90.3 39.6L272 240c0-8.8-7.2-16-16-16s-16 7.2-16 16l0 239.2c-34.5-3.4-65.8-17.8-90.3-39.6L86.6 502.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l64-64c1.9-1.9 3.9-3.4 6-4.8C101.5 367.8 96 344.6 96 320l-64 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l64.3 0c1.1-14.1 5-27.5 11.1-39.5c-.7-.6-1.4-1.2-2.1-1.9l-64-64c-12.5-12.5-12.5-32.8 0-45.3z",
  "arrow-right":
    "M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.7 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z",
};

export type IconName = keyof typeof ICON_PATHS;

export function createFontAwesomeIcon(
  iconName: IconName,
  ...extraClasses: string[]
): SVGSVGElement {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("data-prefix", "fas");
  svg.setAttribute("data-icon", iconName);
  svg.setAttribute(
    "class",
    [
      "svg-inline--fa",
      `fa-${iconName}`,
      "fa-icon",
      ...extraClasses.filter(Boolean),
    ].join(" "),
  );
  svg.setAttribute("role", "img");
  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("viewBox", "0 0 512 512");

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", ICON_PATHS[iconName] ?? "");
  svg.appendChild(path);
  return svg;
}

export function setIconState(iconEl: SVGSVGElement, iconName: IconName) {
  const path = iconEl.querySelector("path");
  if (path) path.setAttribute("d", ICON_PATHS[iconName] ?? "");
  iconEl.classList.toggle("rescrape-spinner", iconName === "spinner");
  iconEl.setAttribute("data-icon", iconName);
}

export function setIconTitle(iconEl: SVGSVGElement, text: string) {
  let titleEl = iconEl.querySelector<SVGTitleElement>(":scope > title");
  if (!titleEl) {
    titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
    iconEl.insertBefore(titleEl, iconEl.firstChild);
  }
  titleEl.textContent = text;
}
