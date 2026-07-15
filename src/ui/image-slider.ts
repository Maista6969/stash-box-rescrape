import { getTabButton } from "./dom";

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

export function determineImageAction(
  scrapedDims: { width: any; height: any },
  existingDims: { width: any; height: any } | null,
) {
  if (!existingDims) return "add";
  if (
    scrapedDims.width === existingDims.width &&
    scrapedDims.height === existingDims.height
  )
    return "same";
  return "replace";
}

export async function fetchBlob(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      responseType: "blob",
      anonymous: true,
      timeout: 15000,
      onload: (res) =>
        res.status >= 200 && res.status < 300
          ? resolve(res.response as Blob)
          : reject(new Error(`HTTP ${res.status}`)),
      onerror: (err) => reject(new Error(String(err))),
    });
  });
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

// BUG: the slider can currently move past the image, we should clamp it horizontally to whichever image is larger
export function buildSlider(existingSrc: string, scrapedSrc: string) {
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

  const compare = document.createElement("div");
  compare.className = "editpage-compare";
  compare.appendChild(rightWrap);
  compare.appendChild(leftClip);
  compare.appendChild(handle);
  compare.appendChild(lblLeft);
  compare.appendChild(lblRight);
  compare.appendChild(lens);
  compare.appendChild(lensToggle);

  let isDragging = false;
  let currentPx = 0;
  let lastCx = 0;
  let lastCy = 0;
  let lensEnabled = false;

  const LENS_SIZE = 200;
  const MIN_ZOOM = 1.5;
  const MAX_ZOOM = 8;
  let zoom = 3;

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

  function updateLens(cx: number, cy: number) {
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
      Math.min(LENS_SIZE, LENS_SIZE / 2 + (currentPx - cx) * zoom),
    );
    lensLeftClip.style.width = `${boundary}px`;
    lensHandle.style.left = `${boundary}px`;
    lensZoomLabel.textContent = `${zoom.toFixed(1)}×`;
  }

  function handlePointerMove(e: MouseEvent | TouchEvent) {
    const rect = compare.getBoundingClientRect();
    const { x: clientX, y: clientY } = clientPoint(e);
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;

    if (isDragging) {
      setSlider(cx / rect.width);
    }

    const withinBounds =
      cx >= 0 && cx <= rect.width && cy >= 0 && cy <= rect.height;
    if (withinBounds && lensEnabled) {
      lens.style.display = "block";
      updateLens(cx, cy);
    } else {
      lens.style.display = "none";
    }
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
  window.addEventListener("mousemove", handlePointerMove);
  window.addEventListener("touchmove", handlePointerMove, { passive: true });
  window.addEventListener("mouseup", () => {
    isDragging = false;
  });
  window.addEventListener("touchend", () => {
    isDragging = false;
    lens.style.display = "none";
  });

  compare.addEventListener(
    "wheel",
    (e) => {
      if (lens.style.display !== "block") return;
      e.preventDefault();
      zoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, zoom + (e.deltaY > 0 ? -0.5 : 0.5)),
      );
      updateLens(lastCx, lastCy);
    },
    { passive: false },
  );

  let leftLoaded = false,
    rightLoaded = false;
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

  return compare;
}

export function injectSliderIntoLightbox(existingSrc: string, scrapedSrc: any) {
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

export function attachImageComparison(form: HTMLFormElement, scrapedSrc: any) {
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
