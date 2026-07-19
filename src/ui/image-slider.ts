import { getTabButton } from "./dom";
import { gmRequest } from "../gm-request";

export function createThumbnailImage(src: string): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "editpage-img-wrap";

  const img = document.createElement("img");
  img.className = "editpage-img-thumb";
  img.alt = "";

  const dims = document.createElement("span");
  dims.className = "editpage-img-dims";
  dims.textContent = "…";

  img.onload = () => {
    dims.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
  };
  img.onerror = () => {
    dims.textContent = "? × ?";
  };
  img.src = src;

  wrap.appendChild(img);
  wrap.appendChild(dims);
  return wrap;
}

export async function fetchBlob(url: string): Promise<Blob> {
  const { status, response } = await gmRequest<Blob>({
    method: "GET",
    url,
    responseType: "blob",
    anonymous: true,
    timeout: 15000,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status}`);
  }
  return response;
}

export async function applyImage(
  blob: Blob,
  src: string,
  form: HTMLFormElement,
) {
  const filename = src.split("/").pop()?.split("?")[0] || "image.jpg";

  const removeButtons = Array.from(
    form.querySelectorAll<HTMLButtonElement>(".ImageInput-remove"),
  );
  if (removeButtons.length > 0) {
    removeButtons.forEach((btn) => btn.click());
    await new Promise((r) => setTimeout(r, 100));
  }

  const fileInput = form.querySelector<HTMLInputElement>(
    '.EditImages input[type="file"]',
  );
  if (!fileInput) {
    getTabButton("Images")?.click();
    console.error("[rescrape] Max images reached: please remove one first");
    return false;
  }

  const file = new File([blob], filename, {
    type: blob.type,
    lastModified: Date.now(),
  });
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  getTabButton("Images")?.click();
  return true;
}

function clientPoint(e: MouseEvent | TouchEvent): { x: number; y: number } {
  if ("touches" in e) {
    const t = e.touches[0] ?? e.changedTouches[0];
    return { x: t.clientX, y: t.clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function buildCompareShell(existingSrc: string, scrapedSrc: string) {
  const rightWrap = document.createElement("div");
  rightWrap.className = "editpage-compare-right";
  const rightImg = document.createElement("img");
  rightImg.src = scrapedSrc;
  rightImg.alt = "Scraped";
  rightWrap.appendChild(rightImg);

  const leftClip = document.createElement("div");
  leftClip.className = "editpage-compare-left";
  const leftImg = document.createElement("img");
  leftImg.src = existingSrc;
  leftImg.alt = "Current";
  leftClip.appendChild(leftImg);

  const handle = document.createElement("div");
  handle.className = "editpage-compare-handle";

  const lblLeft = document.createElement("span");
  lblLeft.className = "editpage-compare-label-left";
  lblLeft.textContent = "Current";

  const lblRight = document.createElement("span");
  lblRight.className = "editpage-compare-label-right";
  lblRight.textContent = "Scraped";

  const compare = document.createElement("div");
  compare.className = "editpage-compare";
  compare.appendChild(rightWrap);
  compare.appendChild(leftClip);
  compare.appendChild(handle);
  compare.appendChild(lblLeft);
  compare.appendChild(lblRight);

  return { compare, leftClip, leftImg, rightImg, handle };
}

// Wires the drag-to-reveal slider: pressing/dragging on `compare` moves
// `handle`/`leftClip` to reveal more or less of the "current" image.
// Returns `setSlider` (also used to set the initial 50/50 split once both
// images have loaded) and `getCurrentPx` (read by the zoom lens to know
// where the slider boundary currently sits).
function wireDrag(
  compare: HTMLDivElement,
  leftClip: HTMLDivElement,
  leftImg: HTMLImageElement,
  rightImg: HTMLImageElement,
  handle: HTMLDivElement,
) {
  let isDragging = false;
  let currentPx = 0;

  function setSlider(frac: number) {
    const w = compare.offsetWidth;
    const h = compare.offsetHeight;
    const px = Math.round(w * Math.max(0, Math.min(1, frac)));
    currentPx = px;
    leftClip.style.width = `${px}px`;
    handle.style.left = `${px}px`;

    rightImg.style.height = `${h}px`;
    leftImg.style.width = `${w}px`;
    leftImg.style.height = `${h}px`;
  }

  function fracFromEvent(e: MouseEvent | TouchEvent) {
    const rect = compare.getBoundingClientRect();
    return (clientPoint(e).x - rect.left) / rect.width;
  }

  compare.addEventListener("mousedown", (e) => {
    isDragging = true;
    setSlider(fracFromEvent(e));
    e.preventDefault();
  });
  compare.addEventListener(
    "touchstart",
    (e) => {
      isDragging = true;
      setSlider(fracFromEvent(e));
    },
    { passive: true },
  );
  window.addEventListener("mousemove", (e) => {
    if (isDragging) setSlider(fracFromEvent(e));
  });
  window.addEventListener(
    "touchmove",
    (e) => {
      if (isDragging) setSlider(fracFromEvent(e));
    },
    { passive: true },
  );
  window.addEventListener("mouseup", () => {
    isDragging = false;
  });
  window.addEventListener("touchend", () => {
    isDragging = false;
  });

  return { setSlider, getCurrentPx: () => currentPx };
}

// Builds the zoom lens: a small magnified preview that follows the cursor
// over `compare`, itself split at the same boundary as the main slider
// (via `getCurrentPx`). Toggling and wheel-zoom are wired here; showing/
// hiding the lens as the cursor moves is wired by `wireZoomLens` below,
// since that also needs to coordinate with the drag listeners.
function buildZoomLens(
  compare: HTMLDivElement,
  existingSrc: string,
  scrapedSrc: string,
  getCurrentPx: () => number,
) {
  const LENS_SIZE = 200;
  const MIN_ZOOM = 1.5;
  const MAX_ZOOM = 8;
  let zoom = 3;
  let lensEnabled = false;
  let lastCx = 0;
  let lastCy = 0;

  const lens = document.createElement("div");
  lens.className = "editpage-compare-lens";

  const lensRightImg = document.createElement("img");
  lensRightImg.src = scrapedSrc;
  lensRightImg.alt = "";
  lensRightImg.className = "editpage-compare-lens-img";

  const lensLeftClip = document.createElement("div");
  lensLeftClip.className = "editpage-compare-lens-left-clip";
  const lensLeftImg = document.createElement("img");
  lensLeftImg.src = existingSrc;
  lensLeftImg.alt = "";
  lensLeftImg.className = "editpage-compare-lens-img";
  lensLeftClip.appendChild(lensLeftImg);

  const lensHandle = document.createElement("div");
  lensHandle.className = "editpage-compare-lens-handle";

  const lensZoomLabel = document.createElement("span");
  lensZoomLabel.className = "editpage-compare-lens-zoom";

  lens.append(lensRightImg, lensLeftClip, lensHandle, lensZoomLabel);

  const lensToggle = document.createElement("button");
  lensToggle.type = "button";
  lensToggle.className = "editpage-compare-lens-toggle";
  lensToggle.textContent = "Toggle zoom lens";

  function setLensEnabled(enabled: boolean) {
    lensEnabled = enabled;
    lensToggle.classList.toggle("active", enabled);
    lensToggle.title = enabled
      ? "Zoom lens: on (click to disable)"
      : "Zoom lens: off (click to enable)";
    if (!enabled) lens.style.display = "none";
  }
  setLensEnabled(false);

  // Stopped from bubbling to `compare` so clicking/touching the toggle
  // never also starts a slider drag (it sits inside the same element)
  lensToggle.addEventListener("mousedown", (e) => e.stopPropagation());
  lensToggle.addEventListener("touchstart", (e) => e.stopPropagation(), {
    passive: true,
  });
  lensToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setLensEnabled(!lensEnabled);
  });

  function updateLensAt(cx: number, cy: number) {
    lastCx = cx;
    lastCy = cy;

    const w = compare.offsetWidth;
    const h = compare.offsetHeight;

    lens.style.left = `${cx}px`;
    lens.style.top = `${cy}px`;

    const tx = LENS_SIZE / 2 - cx * zoom;
    const ty = LENS_SIZE / 2 - cy * zoom;
    const transform = `translate(${tx}px, ${ty}px)`;

    [lensRightImg, lensLeftImg].forEach((img) => {
      img.style.width = `${w * zoom}px`;
      img.style.height = `${h * zoom}px`;
      img.style.transform = transform;
    });

    const boundary = Math.max(
      0,
      Math.min(LENS_SIZE, LENS_SIZE / 2 + (getCurrentPx() - cx) * zoom),
    );
    lensLeftClip.style.width = `${boundary}px`;
    lensHandle.style.left = `${boundary}px`;
    lensZoomLabel.textContent = `${zoom.toFixed(1)}×`;
  }

  function adjustZoom(deltaY: number) {
    zoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, zoom + (deltaY > 0 ? -0.5 : 0.5)),
    );
    updateLensAt(lastCx, lastCy);
  }

  return {
    lens,
    lensToggle,
    isEnabled: () => lensEnabled,
    updateLensAt,
    adjustZoom,
  };
}

// Shows/hides the lens as the cursor moves over `compare`, and wires its
// scroll-to-zoom interaction.
function wireZoomLens(
  compare: HTMLDivElement,
  zoomLens: ReturnType<typeof buildZoomLens>,
) {
  function handlePointerMove(e: MouseEvent | TouchEvent) {
    const rect = compare.getBoundingClientRect();
    const { x: clientX, y: clientY } = clientPoint(e);
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;

    const withinBounds =
      cx >= 0 && cx <= rect.width && cy >= 0 && cy <= rect.height;
    if (withinBounds && zoomLens.isEnabled()) {
      zoomLens.lens.style.display = "block";
      zoomLens.updateLensAt(cx, cy);
    } else {
      zoomLens.lens.style.display = "none";
    }
  }

  window.addEventListener("mousemove", handlePointerMove);
  window.addEventListener("touchmove", handlePointerMove, { passive: true });
  window.addEventListener("touchend", () => {
    zoomLens.lens.style.display = "none";
  });

  compare.addEventListener(
    "wheel",
    (e) => {
      if (zoomLens.lens.style.display !== "block") return;
      e.preventDefault();
      zoomLens.adjustZoom(e.deltaY);
    },
    { passive: false },
  );
}

// Once both images have loaded: sets the initial 50/50 split and, if this
// slider replaced a lightbox image, writes the current-vs-scraped
// dimensions into the lightbox caption.
function wireImageLoadCaption(
  compare: HTMLDivElement,
  leftImg: HTMLImageElement,
  rightImg: HTMLImageElement,
  setSlider: (frac: number) => void,
) {
  let leftLoaded = false;
  let rightLoaded = false;
  function onLoad() {
    if (!leftLoaded || !rightLoaded) return;
    leftImg.style.width = `${compare.offsetWidth}px`;
    leftImg.style.height = `${compare.offsetHeight}px`;
    setSlider(0.5);
    const lw = leftImg.naturalWidth,
      lh = leftImg.naturalHeight;
    const rw = rightImg.naturalWidth,
      rh = rightImg.naturalHeight;
    const same = lw === rw && lh === rh;
    const caption = compare
      .closest(".ImageLightbox-main")
      ?.querySelector(".ImageLightbox-caption");
    if (caption) {
      caption.innerHTML =
        `Current: ${lw}×${lh} &nbsp;` +
        `<span style="color:${same ? "#22c5af" : "#ef4444"}">${same ? "✓ same size" : "✗ different size"}</span>` +
        `&nbsp; Scraped: ${rw}×${rh}`;
    }
  }
  leftImg.addEventListener("load", () => {
    leftLoaded = true;
    onLoad();
  });
  rightImg.addEventListener("load", () => {
    rightLoaded = true;
    onLoad();
  });
  if (leftImg.complete) leftLoaded = true;
  if (rightImg.complete) rightLoaded = true;
  if (leftLoaded && rightLoaded) onLoad();
}

// BUG: the slider can currently move past the image, we should clamp it horizontally to whichever image is larger
export function buildSlider(existingSrc: string, scrapedSrc: string) {
  const { compare, leftClip, leftImg, rightImg, handle } = buildCompareShell(
    existingSrc,
    scrapedSrc,
  );

  const { setSlider, getCurrentPx } = wireDrag(
    compare,
    leftClip,
    leftImg,
    rightImg,
    handle,
  );

  const zoomLens = buildZoomLens(
    compare,
    existingSrc,
    scrapedSrc,
    getCurrentPx,
  );
  compare.appendChild(zoomLens.lens);
  compare.appendChild(zoomLens.lensToggle);
  wireZoomLens(compare, zoomLens);

  wireImageLoadCaption(compare, leftImg, rightImg, setSlider);

  return compare;
}

export function injectSliderIntoLightbox(
  existingSrc: string,
  scrapedSrc: string,
) {
  const MAX_WAIT = 2000;
  const start = Date.now();

  const poll = setInterval(() => {
    const main = document.querySelector(".ImageLightbox-main");
    if (!main || Date.now() - start > MAX_WAIT) {
      clearInterval(poll);
      return;
    }
    clearInterval(poll);

    const imageDiv = main.querySelector(".Image");
    if (!imageDiv) return;

    const slider = buildSlider(existingSrc, scrapedSrc);
    slider.style.width = "100%";
    slider.style.height = "100%";
    imageDiv.replaceWith(slider);

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const w = slider.offsetWidth;
        const h = slider.offsetHeight;
        if (w > 0) {
          const leftClip = slider.querySelector<HTMLDivElement>(
            ".editpage-compare-left",
          );
          const handle = slider.querySelector<HTMLDivElement>(
            ".editpage-compare-handle",
          );
          const leftImg2 = slider.querySelector<HTMLImageElement>(
            ".editpage-compare-left img",
          );
          const px = Math.round(w * 0.5);
          if (leftClip) leftClip.style.width = `${px}px`;
          if (handle) handle.style.left = `${px}px`;
          if (leftImg2) {
            leftImg2.style.width = `${w}px`;
            leftImg2.style.height = `${h}px`;
          }
        }
      }),
    );
  }, 30);
}

export function attachImageComparison(
  form: HTMLFormElement,
  scrapedSrc: string,
) {
  form.querySelectorAll<HTMLImageElement>(".EditImages img").forEach((img) => {
    if (img.dataset.rescrapeCompare === "true") {
      const clone = img.cloneNode(true) as HTMLImageElement;
      img.replaceWith(clone);
    }
    img.dataset.rescrapeCompare = "true";
    img.style.cursor = "zoom-in";
    img.title = "Click to compare with scraped image";
    img.addEventListener("click", () =>
      injectSliderIntoLightbox(img.src, scrapedSrc),
    );
  });

  const panel = form.querySelector<HTMLDivElement>(".editpage-panel");
  if (!panel) return;

  function attachThumbClick(thumb: HTMLElement) {
    if (thumb.dataset.rescrapeThumbnailClick === "true") return;
    thumb.dataset.rescrapeThumbnailClick = "true";
    thumb.style.cursor = "zoom-in";
    thumb.title = "Click to compare images";
    thumb.addEventListener("click", (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      const existingImg =
        form.querySelector<HTMLImageElement>(".EditImages img");
      if (existingImg) {
        existingImg
          .closest<HTMLButtonElement>('a, button, [role="button"], .Image')
          ?.click();
        injectSliderIntoLightbox(existingImg.src, scrapedSrc);
      } else {
        injectSliderIntoLightbox("", scrapedSrc);
      }
    });
  }

  panel
    .querySelectorAll<HTMLImageElement>(".editpage-img-thumb")
    .forEach(attachThumbClick);
  const thumbObs = new MutationObserver(() =>
    panel
      .querySelectorAll<HTMLImageElement>(".editpage-img-thumb")
      .forEach(attachThumbClick),
  );
  thumbObs.observe(panel, { childList: true, subtree: true });
}
