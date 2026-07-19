import { setIconState, setIconTitle } from "../../ui/icons";
import {
  resolveScraperFailureAction,
  updateScraperPackage,
  buildBrokenScraperReportURL,
  type ScraperPackageInfo,
} from "../../stash/scraper-health";
import {
  EmptyScrapeResultError,
  ScraperCrashedError,
} from "../../scraper-errors";

// Re-entry point back into verifyURL (defined in index.ts), threaded through
// as a parameter rather than imported directly to avoid a circular import
// between this module and index.ts.
export type VerifyURLFn = (
  url: string,
  editCard: HTMLDivElement,
  iconElement: SVGSVGElement,
  objectType: "scene" | "performer",
  scraperName: string,
) => void;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyFailureReason(error: unknown): string {
  if (error instanceof EmptyScrapeResultError) return "empty result";
  if (error instanceof ScraperCrashedError)
    return `scraper crashed (${error.message})`;
  return describeError(error);
}

export async function handleScrapeFailure(
  iconElement: SVGSVGElement,
  editCard: HTMLDivElement,
  url: string,
  objectType: "scene" | "performer",
  scraperName: string,
  mode: "local" | "remote",
  endpoint: string,
  apiKey: string,
  error: unknown,
  verifyURL: VerifyURLFn,
) {
  iconElement.classList.remove("processing", "verifiable");

  try {
    const action = await resolveScraperFailureAction(
      scraperName,
      mode,
      endpoint,
      apiKey,
    );
    console.debug(
      `[rescrape] Scraper failure action for "${scraperName}" (${mode} mode):`,
      action,
    );

    if (action.kind === "update") {
      setIconState(iconElement, "arrows-rotate");
      iconElement.classList.add("update-available");
      setIconTitle(
        iconElement,
        `Update scraper '${scraperName}' to newest version`,
      );
      iconElement.onclick = (e) => {
        e.preventDefault();
        runScraperUpdate(
          iconElement,
          editCard,
          url,
          objectType,
          scraperName,
          action.pkg,
          endpoint,
          apiKey,
          verifyURL,
        );
      };
      return;
    }

    if (action.kind === "report-bug") {
      setIconState(iconElement, "bug");
      iconElement.classList.add("report-bug");
      setIconTitle(iconElement, `File bug report for ${scraperName} on GitHub`);
      iconElement.onclick = (e) => {
        e.preventDefault();
        window.open(
          buildBrokenScraperReportURL({
            packageName: action.packageName,
            packageVersion: action.packageVersion,
            objectType,
            url,
            scriptName: GM_info.script.name,
            scriptURL: GM_info.script.homepage || GM_info.script.downloadURL,
            scriptVersion: GM_info.script.version,
            now: new Date(),
          }),
          "_blank",
          "noopener,noreferrer",
        );
      };
      return;
    }

    // We can't figure out a way to help (maybe the scraper is homebrew or otherwise manually installed)
    setIconState(iconElement, "circle-xmark");
    iconElement.classList.add("failed");
    iconElement.onclick = null;
    setIconTitle(
      iconElement,
      `Scraper failed for unknown reason: ${classifyFailureReason(error)}`,
    );
  } catch (healthCheckError) {
    console.error(
      `[rescrape] Unexpected error while checking scraper health for "${scraperName}":`,
      healthCheckError,
    );
    setIconState(iconElement, "circle-xmark");
    iconElement.classList.add("failed");
    iconElement.onclick = null;
    setIconTitle(
      iconElement,
      `Scraper failed for unknown reason: ${classifyFailureReason(error)}`,
    );
  }
}

async function runScraperUpdate(
  iconElement: SVGSVGElement,
  editCard: HTMLDivElement,
  url: string,
  objectType: "scene" | "performer",
  scraperName: string,
  pkg: ScraperPackageInfo,
  endpoint: string,
  apiKey: string,
  verifyURL: VerifyURLFn,
) {
  iconElement.onclick = null;
  iconElement.classList.remove("update-available");
  iconElement.classList.add("processing");
  setIconState(iconElement, "spinner");
  setIconTitle(iconElement, `Updating "${scraperName}"...`);

  const outcome = await updateScraperPackage(pkg, endpoint, apiKey);
  iconElement.classList.remove("processing");

  if (outcome.ok) {
    setIconState(iconElement, "magnifying-glass");
    iconElement.classList.add("verifiable");
    setIconTitle(iconElement, "Scraper updated: click to rescrape");
    iconElement.onclick = (e) => {
      e.preventDefault();
      verifyURL(url, editCard, iconElement, objectType, scraperName);
    };
    return;
  }

  setIconState(iconElement, "arrows-rotate");
  iconElement.classList.add("update-available");
  setIconTitle(iconElement, `Update failed: ${outcome.reason}: click to retry`);
  iconElement.onclick = (e) => {
    e.preventDefault();
    runScraperUpdate(
      iconElement,
      editCard,
      url,
      objectType,
      scraperName,
      pkg,
      endpoint,
      apiKey,
      verifyURL,
    );
  };
}
