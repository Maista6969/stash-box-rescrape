import { getActiveEndpoint, loadConfig } from "../../config";
import {
  classifyEdit,
  isRelevantEdit,
  extractSceneEditCardData,
  extractPerformerEditCardData,
  extractURLsFromEditCard,
  extractCreatedEntityId,
} from "../../extract/editcard";
import {
  createFontAwesomeIcon,
  setIconState,
  setIconTitle,
} from "../../ui/icons";
import {
  scrapeScene,
  scrapePerformer,
  isURLScrapable,
  getImageDimensions,
  isEmptyScrapedScene,
  isEmptyScrapedPerformer,
} from "../../scraper-dispatch";
import { EmptyScrapeResultError } from "../../scraper-errors";
import {
  addFieldVerificationStatus,
  addPerformerFieldVerificationStatus,
} from "./fields";
import { addImageComparison, addUrlComparison } from "./image-url";
import { addStudioComparison } from "./studio";
import { addPerformerIntegration } from "./performers";
import { handleScrapeFailure } from "./scraper-recovery";
import {
  checkForDuplicateUrlsOnPage,
  type DuplicateCheckCard,
} from "./duplicate-urls";

export { decideFieldRowPresentation } from "./fields";
export { decideImageComparison } from "./image-url";

function showMissingFingerprintWarning(editCard: Element) {
  const cardBody = editCard.querySelector(".card-body");
  if (!cardBody) return;
  cardBody.querySelector(".rescrape-fingerprint-warning")?.remove();

  const warning = document.createElement("div");
  warning.className = "rescrape-fingerprint-warning";
  warning.textContent = "⚠ Missing PHASH fingerprint";
  cardBody.insertBefore(warning, cardBody.firstChild);
}

function resetPreviousVerification(editCard: Element) {
  const isInjected = (node: Node) =>
    node instanceof Element && node.classList.contains("rescrape-injected");

  editCard.querySelectorAll(".rescrape-unwrap-target").forEach((wrapper) => {
    const parent = wrapper.parentElement;
    if (!parent) return;
    Array.from(wrapper.childNodes).forEach((node) => {
      if (isInjected(node)) {
        (node as Element).remove();
        return;
      }
      if (node instanceof HTMLElement) {
        node.classList.remove(
          "rescrape-match",
          "rescrape-missing",
          "rescrape-approx",
        );
        node.style.display = "";
      }
      parent.insertBefore(node, wrapper);
    });
    wrapper.remove();
  });

  editCard.querySelectorAll(".rescrape-injected").forEach((el) => el.remove());

  editCard
    .querySelectorAll<HTMLElement>("b.editcard-field-status")
    .forEach((label) => {
      label.classList.remove(
        "editcard-field-status",
        "match",
        "diff",
        "missing",
        "additional",
        "approx",
        "has-diff",
      );
      label.onclick = null;
    });
}

async function verifyURL(
  url: string,
  editCard: HTMLDivElement,
  iconElement: SVGSVGElement,
  objectType: "scene" | "performer",
  scraperName: string,
) {
  iconElement.classList.add("processing");
  setIconState(iconElement, "spinner");

  const config = loadConfig();
  const { endpoint, apiKey } = getActiveEndpoint(config);

  resetPreviousVerification(editCard);

  try {
    if (objectType === "scene") {
      const originalData = extractSceneEditCardData(editCard);
      if (!originalData.fingerprints.includes("PHASH")) {
        showMissingFingerprintWarning(editCard);
      }
      const scrapedRaw = await scrapeScene(url, endpoint, apiKey, config.mode);
      if (isEmptyScrapedScene(scrapedRaw)) {
        throw new EmptyScrapeResultError(url);
      }
      const scrapedData = await getImageDimensions(scrapedRaw);
      await addFieldVerificationStatus(editCard, originalData, scrapedData);
      addImageComparison(editCard, originalData, scrapedData);
      addUrlComparison(editCard, originalData, scrapedData);
      await addStudioComparison(editCard, originalData, scrapedData);
      await addPerformerIntegration(editCard, originalData, scrapedData);
    } else {
      const originalData = extractPerformerEditCardData(editCard);
      const scrapedData = await scrapePerformer(
        url,
        endpoint,
        apiKey,
        config.mode,
      );
      if (isEmptyScrapedPerformer(scrapedData)) {
        throw new EmptyScrapeResultError(url);
      }
      await addPerformerFieldVerificationStatus(
        editCard,
        originalData,
        scrapedData,
      );
    }
  } catch (error) {
    console.error(`[rescrape] Error scraping ${url}:`, error);
    await handleScrapeFailure(
      iconElement,
      editCard,
      url,
      objectType,
      scraperName,
      config.mode,
      endpoint,
      apiKey,
      error,
      verifyURL,
    );
    return;
  }
  setIconState(iconElement, "magnifying-glass");
  iconElement.classList.remove("processing");
}

let _rescrapeIconsObserverStarted = false;

export function initEditcardRescrape() {
  if (!_rescrapeIconsObserverStarted) {
    _rescrapeIconsObserverStarted = true;
    new MutationObserver(initEditcardRescrape).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  const editCards = document.querySelectorAll<HTMLDivElement>(".EditCard");

  // Runs on all editcards without the user even clicking rescrape
  const pendingDuplicateChecks: DuplicateCheckCard[] = [];

  editCards.forEach((editCard) => {
    const { editType, objectType } = classifyEdit(editCard);
    if (!isRelevantEdit(editType, objectType)) return;

    if (!editCard.hasAttribute("data-rescrape-duplicate-checked")) {
      editCard.setAttribute("data-rescrape-duplicate-checked", "true");
      pendingDuplicateChecks.push({
        editCard,
        urls: extractURLsFromEditCard(editCard),
        ownEntityId: extractCreatedEntityId(editCard),
      });
    }

    const links = editCard.querySelectorAll<HTMLAnchorElement>(
      '.URLChangeRow a[href^="http"][target="_blank"]:not([data-rescrape-processed])',
    );
    if (links.length === 0) return;

    console.debug(`Processing ${links.length} links for ${objectType} edit`);

    const backendLabel = loadConfig().mode === "local" ? "Stash" : "Scrape-CI";

    links.forEach((link) => {
      link.setAttribute("data-rescrape-processed", "true");
      const url = link.href;
      const scraperMatch = isURLScrapable(
        url,
        objectType as "scene" | "performer",
      );
      const isVerifiable = !!scraperMatch;
      const icon = createFontAwesomeIcon(
        isVerifiable ? "magnifying-glass" : "circle-xmark",
        "rescrape-icon",
        isVerifiable ? "verifiable" : "",
        "rescrape-trigger-icon",
      );
      setIconTitle(
        icon,
        isVerifiable
          ? `Scrape using ${backendLabel}`
          : "No scraper installed for this URL",
      );

      if (isVerifiable && scraperMatch) {
        icon.onclick = (e) => {
          e.preventDefault();
          verifyURL(
            url,
            editCard,
            icon,
            objectType as "scene" | "performer",
            scraperMatch.scraperName,
          );
        };
      }
      link.parentNode!.insertBefore(icon, link.parentNode!.firstChild);
      console.debug(`Added verification icon for ${objectType} URL: ${url}`);
    });
  });

  if (pendingDuplicateChecks.length > 0) {
    checkForDuplicateUrlsOnPage(pendingDuplicateChecks);
  }
}

// If the configured endpoint changes we need to replace all scrape icons
export function reloadEditcardScraperIcons() {
  document
    .querySelectorAll(".rescrape-trigger-icon")
    .forEach((icon) => icon.remove());
  document
    .querySelectorAll("[data-rescrape-processed]")
    .forEach((link) => link.removeAttribute("data-rescrape-processed"));
  initEditcardRescrape();
}
