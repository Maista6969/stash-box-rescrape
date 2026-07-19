import {
  resolveScraperFailureAction,
  updateScraperPackage,
  buildBrokenScraperReportURL,
  type ScraperPackageInfo,
} from "../stash/scraper-health";
import { makeSetLink } from "../ui/dom";
import { showPanelError } from "./panel";

// Same recovery decision as the editcard flow (edit-card/verify/scraper-recovery.ts),
// rendered as a line of text under the panel's error message instead of a
// morphing icon, since the edit-page UI doesn't have a per-URL icon to reuse.
function renderUpdateAction(
  container: HTMLElement,
  pkg: ScraperPackageInfo,
  endpoint: string,
  apiKey: string,
  retry: () => void,
) {
  const row = document.createElement("div");
  row.style.cssText = "margin-top:.3rem;";
  container.appendChild(row);

  const renderIdle = (label: string) => {
    row.replaceChildren(
      makeSetLink(label, async () => {
        row.textContent = `Updating '${pkg.name}'...`;
        const outcome = await updateScraperPackage(pkg, endpoint, apiKey);
        if (outcome.ok) {
          row.remove();
          retry();
          return;
        }
        renderIdle(`Update failed: ${outcome.reason}: click to retry`);
      }),
    );
  };
  renderIdle(`Update scraper '${pkg.name}' to newest version`);
}

function renderReportBugAction(
  container: HTMLElement,
  params: {
    packageName: string;
    packageVersion: string;
    objectType: "scene" | "performer";
    url: string;
  },
) {
  const row = document.createElement("div");
  row.style.cssText = "margin-top:.3rem;";
  row.appendChild(
    makeSetLink(`File bug report for ${params.packageName} on GitHub`, () => {
      window.open(
        buildBrokenScraperReportURL({
          packageName: params.packageName,
          packageVersion: params.packageVersion,
          objectType: params.objectType,
          url: params.url,
          scriptName: GM_info.script.name,
          scriptURL: GM_info.script.homepage || GM_info.script.downloadURL,
          scriptVersion: GM_info.script.version,
          now: new Date(),
        }),
        "_blank",
        "noopener,noreferrer",
      );
    }),
  );
  container.appendChild(row);
}

export async function handleEditPageScrapeFailure(
  form: HTMLFormElement,
  url: string,
  objectType: "scene" | "performer",
  scraperName: string,
  mode: "local" | "remote",
  endpoint: string,
  apiKey: string,
  error: unknown,
  retry: () => void,
) {
  showPanelError(form, error instanceof Error ? error.message : String(error));
  const errEl = form.querySelector<HTMLElement>(
    ".editpage-panel .editpage-scrape-error",
  );
  if (!errEl) return;

  try {
    const action = await resolveScraperFailureAction(
      scraperName,
      mode,
      endpoint,
      apiKey,
    );
    if (action.kind === "update") {
      renderUpdateAction(errEl, action.pkg, endpoint, apiKey, retry);
    } else if (action.kind === "report-bug") {
      renderReportBugAction(errEl, {
        packageName: action.packageName,
        packageVersion: action.packageVersion,
        objectType,
        url,
      });
    }
  } catch (healthCheckError) {
    console.error(
      `[rescrape] Unexpected error while checking scraper health for "${scraperName}":`,
      healthCheckError,
    );
  }
}
