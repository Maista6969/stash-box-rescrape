import type { StashBoxScene } from "../../extract/editcard";
import type { SizedImage } from "../../scraper-shared/types";
import {
  compareImageDimensions,
  computeMissingUrls,
} from "../../compare/compare";
import { injectSliderIntoLightbox } from "../../ui/image-slider";
import { makeCommentIcon } from "../comments";
import type { ResolvedScrapedScene } from "../../scraper-dispatch";
import { createMissingRow, SCENE_FIELD_ORDER } from "./fields";

export type ImageComparisonDecision = {
  aspectRatio: string;
  dimsText: string;
  commentText: string;
};

// TODO: Stash currently only returns data URIs, should we PR to make it return the actual
// source URL even if the frontend probably can't resolve it for cross-origin reasons?
function dimsOf(image: SizedImage): string {
  return `${image.width} x ${image.height}`;
}

export function decideImageComparison(
  original: SizedImage | null | undefined,
  scraped: SizedImage,
): ImageComparisonDecision {
  const isLinkable = !scraped.src.startsWith("data:");
  const sourceRef = isLinkable
    ? `[official scene cover image](${scraped.src})`
    : "the official source image";

  let commentText: string;
  if (!original) {
    commentText = `Image is missing, should be ${sourceRef}`;
  } else {
    const dimensionsDiffer =
      original.width !== scraped.width || original.height !== scraped.height;
    const dimensionsNote = dimensionsDiffer
      ? `, your submitted image is ${dimsOf(original)} but I scraped ${dimsOf(scraped)}`
      : "";
    commentText = `Scene cover image doesn't match ${sourceRef}${dimensionsNote}`;
  }

  return {
    aspectRatio: `${scraped.width} / ${scraped.height}`,
    dimsText: dimsOf(scraped),
    commentText,
  };
}

function createNoImageScrapedBlock(aspectRatio: string): HTMLDivElement {
  const scrapedBlock = document.createElement("div");
  scrapedBlock.className = "ImageChangeRow-image rescrape-injected";

  const placeholder = document.createElement("div");
  placeholder.className =
    "Image rescrape-scraped-image rescrape-no-image additional";
  placeholder.style.aspectRatio = aspectRatio;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 48 36");
  svg.setAttribute("class", "rescrape-no-image-icon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const frame = document.createElementNS(svgNS, "rect");
  frame.setAttribute("x", "2");
  frame.setAttribute("y", "2");
  frame.setAttribute("width", "44");
  frame.setAttribute("height", "32");
  frame.setAttribute("rx", "3");
  svg.appendChild(frame);

  const sun = document.createElementNS(svgNS, "circle");
  sun.setAttribute("cx", "15");
  sun.setAttribute("cy", "12");
  sun.setAttribute("r", "3");
  svg.appendChild(sun);

  const mountains = document.createElementNS(svgNS, "polyline");
  mountains.setAttribute("points", "4,28 16,18 24,25 32,16 44,26");
  svg.appendChild(mountains);

  const slash = document.createElementNS(svgNS, "line");
  slash.setAttribute("x1", "0");
  slash.setAttribute("y1", "0");
  slash.setAttribute("x2", "48");
  slash.setAttribute("y2", "36");
  svg.appendChild(slash);

  placeholder.appendChild(svg);
  scrapedBlock.appendChild(placeholder);

  const caption = document.createElement("div");
  caption.className = "text-center rescrape-value-row";
  caption.append("No image scraped");
  scrapedBlock.appendChild(caption);

  return scrapedBlock;
}

function createMissingImageRow(editCard: Element): HTMLDivElement {
  const { row, col } = createMissingRow(
    editCard,
    "images",
    "Images",
    "ImageChangeRow rescrape-added-row",
    "col-2 text-end",
    SCENE_FIELD_ORDER,
  );
  col.appendChild(document.createElement("div")).className = "ImageChangeRow";
  return row;
}

export function addImageComparison(
  editCard: Element,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  const row =
    editCard.querySelector<HTMLDivElement>(".ImageChangeRow.row") ??
    (scrapedData.image ? createMissingImageRow(editCard) : null);
  const label = row?.querySelector("b");
  if (!row || !label) return;

  const status = compareImageDimensions(originalData.image, scrapedData.image);
  label.classList.add("editcard-field-status", status);

  const changeRow = row.querySelector(".ImageChangeRow");
  const scrapedImage = scrapedData.image;

  // The submission has an image but the scraper didn't find one - nothing
  // to compare against, so just flag it rather than offering compare/comment
  // tools for a value we don't actually have
  if (!scrapedImage) {
    if (changeRow && originalData.image) {
      changeRow.classList.add("rescrape-image-row");
      changeRow.appendChild(
        createNoImageScrapedBlock(
          `${originalData.image.width} / ${originalData.image.height}`,
        ),
      );
    }
    return;
  }

  // Same dimensions doesn't mean same image - always show the visual
  // comparison so the submission can be checked by eye, not just by size
  const { aspectRatio, dimsText, commentText } = decideImageComparison(
    originalData.image,
    scrapedImage,
  );

  let existingImg = row.querySelector<HTMLImageElement>(".Image-image");
  if (existingImg) {
    const clone = existingImg.cloneNode(true) as HTMLImageElement;
    existingImg.replaceWith(clone);
    existingImg = clone;
    existingImg.style.cursor = "zoom-in";
    existingImg.title = "Click to compare with scraped image";
    existingImg.addEventListener("click", () =>
      injectSliderIntoLightbox(existingImg!.src, scrapedImage.src),
    );
  }

  if (changeRow) {
    changeRow.classList.add("rescrape-image-row");

    const scrapedBlock = document.createElement("div");
    scrapedBlock.className = "ImageChangeRow-image rescrape-injected";

    const imageBox = document.createElement("div");
    imageBox.className = `Image rescrape-scraped-image ${status}`;
    imageBox.style.aspectRatio = aspectRatio;
    imageBox.style.cursor = "zoom-in";
    imageBox.title = existingImg
      ? "Click to compare with current image"
      : "Scraped image";
    imageBox.addEventListener("click", () => {
      existingImg?.closest<HTMLButtonElement>("button.Image")?.click();
      injectSliderIntoLightbox(existingImg?.src ?? "", scrapedImage.src);
    });

    const img = document.createElement("img");
    img.className = "Image-image";
    img.alt = "";
    img.src = scrapedImage.src;
    imageBox.appendChild(img);
    scrapedBlock.appendChild(imageBox);

    const dims = document.createElement("div");
    dims.className = "text-center rescrape-value-row";
    dims.append(dimsText);
    scrapedBlock.appendChild(dims);

    dims.appendChild(makeCommentIcon(editCard, commentText));

    changeRow.appendChild(scrapedBlock);
  }
}

function createMissingUrlRow(editCard: Element): HTMLDivElement {
  const { row, col } = createMissingRow(
    editCard,
    "links",
    "Links",
    "URLChangeRow",
    "col-2 text-end",
    SCENE_FIELD_ORDER,
  );
  const changeRow = document.createElement("div");
  changeRow.className = "URLChangeRow";
  changeRow.appendChild(document.createElement("ul")).className = "ps-0";
  col.appendChild(changeRow);
  return row;
}

export function addUrlComparison(
  editCard: Element,
  originalData: StashBoxScene,
  scrapedData: ResolvedScrapedScene,
) {
  const row =
    editCard.querySelector<HTMLDivElement>(".URLChangeRow.row") ??
    (scrapedData.urls?.length ? createMissingUrlRow(editCard) : null);
  const label = row?.querySelector("b");
  const list = row?.querySelector("ul");
  if (!row || !label || !list) return;

  const { status, missingUrls } = computeMissingUrls(
    originalData.urls,
    scrapedData.urls,
  );

  label.classList.add("editcard-field-status", status);
  if (!missingUrls.length) return;

  for (const url of missingUrls) {
    const li = document.createElement("li");
    li.className = "rescrape-additional rescrape-url-item rescrape-injected";

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "text-break";
    link.textContent = url;
    li.appendChild(link);

    li.appendChild(makeCommentIcon(editCard, `Missing source URL: ${url}`));
    list.appendChild(li);
  }
}
