import type { ScraperPattern } from "../scraper-shared/types";
import { loadConfig } from "../config";
import { createFontAwesomeIcon, setIconState } from "../ui/icons";
import {
  scrapeScene,
  scrapePerformer,
  getImageDimensions,
  summarizeForLog,
  getScraperPatterns,
} from "../scraper-dispatch";
import { showSceneResults } from "./scene-results";
import { showPerformerResults } from "./performer-results";
import { showPanelError } from "./panel";

function injectFormButtons(
  form: HTMLFormElement,
  formType: "Scene" | "Performer",
  patterns: ScraperPattern[],
) {
  const urlRows = Array.from(
    form.querySelectorAll(".URLInput .input-group"),
  ).filter((group) =>
    Array.from(group.children).some((c) =>
      c.textContent?.trim().startsWith("http"),
    ),
  );

  urlRows.forEach((group) => {
    if (group.querySelector("[data-editpage-processed]")) return;

    const urlSpan = Array.from(group.children).find((c) =>
      c.textContent?.trim().startsWith("http"),
    );
    if (!urlSpan) return;
    const url = urlSpan.textContent.trim();

    console.debug("[rescrape] processing URL row:", url);

    const matchedPattern = patterns.find(({ pattern }) =>
      url.includes(pattern),
    );
    const isScrapable = !!matchedPattern;

    const svgIcon = createFontAwesomeIcon(
      isScrapable ? "magnifying-glass" : "circle-xmark",
    );

    const btn = document.createElement("a");
    btn.setAttribute("data-editpage-processed", "true");
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.className = isScrapable
      ? "btn btn-outline-primary editpage-scrape-btn"
      : "btn btn-outline-secondary editpage-scrape-btn disabled";
    btn.title = isScrapable
      ? "Click to rescrape from this URL"
      : "No scraper available for this URL";
    btn.appendChild(svgIcon);
    group.appendChild(btn);

    if (!isScrapable) {
      return;
    }

    const doScrape = async (e: KeyboardEvent | MouseEvent) => {
      e.preventDefault();
      console.debug("[rescrape] scrape button clicked for URL:", url);

      btn.classList.remove("btn-outline-primary", "btn-outline-danger");
      btn.classList.add("btn-outline-secondary");
      btn.style.pointerEvents = "none";
      setIconState(svgIcon, "spinner");
      svgIcon.classList.add("rescrape-spinner");

      try {
        const config = loadConfig();
        const { endpoint, apiKey } = config[config.mode];
        if (formType === "Scene") {
          await scrapeScene(url, endpoint, apiKey, config.mode)
            .then((raw) => {
              console.debug(
                "[rescrape] scrapeScene raw result:",
                summarizeForLog(raw),
              );
              return raw;
            })
            .then(getImageDimensions)
            .then((scrapedData) =>
              showSceneResults(form, scrapedData, matchedPattern?.scraperName),
            );
        } else {
          await scrapePerformer(url, endpoint, apiKey, config.mode).then(
            (scrapedData) => {
              console.debug("[rescrape] scrapePerformer result:", scrapedData);
              return showPerformerResults(
                form,
                scrapedData,
                matchedPattern?.scraperName,
              );
            },
          );
        }
        btn.classList.remove("btn-outline-secondary");
        btn.classList.add("btn-outline-primary");
      } catch (err: any) {
        console.error("[rescrape] error during scrape/display:", err);
        btn.classList.remove("btn-outline-secondary");
        btn.classList.add("btn-outline-danger");
        showPanelError(form, String(err?.message ?? err));
      } finally {
        setIconState(svgIcon, "magnifying-glass");
        svgIcon.classList.remove("rescrape-spinner");
        btn.style.pointerEvents = "";
      }
    };
    btn.addEventListener("click", doScrape);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") doScrape(e);
    });
  });
}

export async function initEditPageRescrape() {
  const { sceneScraperPatterns, performerScraperPatterns } =
    getScraperPatterns();
  if (!sceneScraperPatterns.length && !performerScraperPatterns.length) {
    console.debug("[rescrape] no scraper patterns loaded yet, aborting");
    return;
  }

  const form = await new Promise<HTMLFormElement | null>((resolve) => {
    const formSelector = ".SceneForm, .PerformerForm";
    const existing = document.querySelector<HTMLFormElement>(formSelector);
    if (existing !== null) {
      return resolve(existing);
    }
    const obs = new MutationObserver(() => {
      const el = document.querySelector<HTMLFormElement>(formSelector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      resolve(null);
    }, 5000);
  });

  if (!form) {
    return;
  }

  const [, formType] = form.className.match(/(\w+)Form/i) ?? [];

  if (!formType) {
    console.warn(`Unable to determine form type: ${form.className}`);
    return;
  }

  const injectButtons = () => {
    if (formType == "Scene") {
      injectFormButtons(form, formType, sceneScraperPatterns);
    } else if (formType === "Performer") {
      injectFormButtons(form, formType, performerScraperPatterns);
    } else {
      console.error("Hmm this is wrong");
    }
  };

  injectButtons();

  // If a new URL is added we want to add the button immediately
  const urlObs = new MutationObserver(injectButtons);
  urlObs.observe(form, { childList: true, subtree: true });
}

export function reloadEditPageScraperButtons() {
  document
    .querySelectorAll(".editpage-scrape-btn")
    .forEach((btn) => btn.remove());
  initEditPageRescrape();
}
