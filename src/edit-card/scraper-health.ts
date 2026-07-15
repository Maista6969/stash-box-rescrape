const COMMUNITY_SCRAPERS_SOURCE_URL =
  "https://stashapp.github.io/CommunityScrapers/stable/index.yml";

type RawPackage = {
  package_id: string;
  name: string;
  version: string;
  date: string;
  sourceURL: string;
};
type RawInstalledPackage = RawPackage & { source_package: RawPackage | null };

export type ScraperPackageInfo = {
  packageId: string;
  name: string;
  sourceURL: string;
  installedVersion: string;
  installedDate: string;
  latestVersion: string;
  latestDate: string;
};

export type ScraperHealthResult =
  | { status: "unknown" }
  | { status: "up-to-date"; pkg: ScraperPackageInfo }
  | { status: "update-available"; pkg: ScraperPackageInfo };

export type UpdateOutcome = { ok: true } | { ok: false; reason: string };

export type ScraperFailureAction =
  | { kind: "update"; pkg: ScraperPackageInfo }
  | { kind: "report-bug"; packageName: string; packageVersion: string }
  | { kind: "none" };

export function evaluateScraperHealth(
  scraperName: string,
  packages: RawInstalledPackage[],
): ScraperHealthResult {
  const normalize = (s: string) => s.toLowerCase().trim();
  let raw = packages.find((p) => p.name === scraperName);
  if (!raw) {
    const nameLower = normalize(scraperName);
    const candidates = packages.filter((p) => {
      const pkgLower = normalize(p.name);
      return nameLower.includes(pkgLower) || pkgLower.includes(nameLower);
    });
    if (candidates.length === 1) raw = candidates[0];
  }
  if (!raw || !raw.source_package) return { status: "unknown" };
  if (raw.sourceURL !== COMMUNITY_SCRAPERS_SOURCE_URL)
    return { status: "unknown" };

  const pkg: ScraperPackageInfo = {
    packageId: raw.package_id,
    name: raw.name,
    sourceURL: raw.sourceURL,
    installedVersion: raw.version,
    installedDate: raw.date,
    latestVersion: raw.source_package.version,
    latestDate: raw.source_package.date,
  };

  return pkg.installedVersion === pkg.latestVersion
    ? { status: "up-to-date", pkg }
    : { status: "update-available", pkg };
}

export function fetchInstalledScraperPackages(
  endpoint: string,
  apiKey: string,
): Promise<RawInstalledPackage[]> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "POST",
      responseType: "json",
      url: endpoint,
      headers: { "Content-Type": "application/json", ApiKey: apiKey },
      timeout: 10_000,
      data: JSON.stringify({
        query: `
          query InstalledScraperPackagesStatus {
            installedPackages(type: Scraper) {
              ...PackageData
              source_package { ...PackageData __typename }
              __typename
            }
          }
          fragment PackageData on Package {
            package_id name version date metadata sourceURL __typename
          }
        `,
      }),
      onload: ({ status, response }) => {
        if (status != 200) {
          const errors = response.errors
            .map((e: { message: string }) => e.message)
            .join("\n");
          return reject(
            `Failed to fetch installed scraper packages: ${errors}`,
          );
        }
        resolve(response.data.installedPackages as RawInstalledPackage[]);
      },
      onerror: (err) =>
        reject(`Request error fetching installed packages: ${err}`),
      ontimeout: () =>
        reject(
          `Timed out fetching installed scraper packages from ${endpoint}`,
        ),
    });
  });
}

export async function checkScraperHealth(
  scraperName: string,
  endpoint: string,
  apiKey: string,
): Promise<ScraperHealthResult> {
  const packages = await fetchInstalledScraperPackages(endpoint, apiKey);
  const result = evaluateScraperHealth(scraperName, packages);
  if (result.status === "unknown") {
    console.debug(
      `[rescrape] No installed-package match for scraper "${scraperName}". Installed package names:`,
      packages.map((p) => p.name),
    );
  }
  return result;
}

export function triggerScraperPackageUpdate(
  packageId: string,
  sourceURL: string,
  endpoint: string,
  apiKey: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "POST",
      responseType: "json",
      url: endpoint,
      headers: { "Content-Type": "application/json", ApiKey: apiKey },
      timeout: 10_000,
      data: JSON.stringify({
        query: `
          mutation UpdateScraperPackages($packages: [PackageSpecInput!]!) {
            updatePackages(type: Scraper, packages: $packages)
          }
        `,
        variables: { packages: [{ id: packageId, sourceURL }] },
      }),
      onload: ({ status, response }) => {
        if (status != 200) {
          const errors = response.errors
            .map((e: { message: string }) => e.message)
            .join("\n");
          return reject(`Failed to trigger scraper package update: ${errors}`);
        }
        resolve(response.data.updatePackages as string);
      },
      onerror: (err) =>
        reject(`Request error triggering package update: ${err}`),
      ontimeout: () =>
        reject(`Timed out triggering scraper package update on ${endpoint}`),
    });
  });
}

export function pollScraperUpdateJob(
  jobId: string,
  endpoint: string,
  apiKey: string,
  {
    intervalMs = 500,
    timeoutMs = 30_000,
  }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<UpdateOutcome> {
  const { promise, resolve } = Promise.withResolvers<UpdateOutcome>();

  let settled = false;
  const finish = (outcome: UpdateOutcome) => {
    if (settled) return;
    settled = true;
    clearInterval(timer);
    clearTimeout(timeoutHandle);
    resolve(outcome);
  };

  const tick = () => {
    GM_xmlhttpRequest({
      method: "POST",
      responseType: "json",
      url: endpoint,
      headers: { "Content-Type": "application/json", ApiKey: apiKey },
      data: JSON.stringify({
        query: `
          query FindJob($input: FindJobInput!) {
            findJob(input: $input) {
              id status subTasks description progress
              startTime endTime addTime error __typename
            }
          }
        `,
        variables: { input: { id: jobId } },
      }),
      onload: ({ status, response }) => {
        if (status != 200) {
          return finish({ ok: false, reason: "job status request failed" });
        }
        const job = response.data.findJob;
        if (!job) return finish({ ok: false, reason: "update job not found" });
        if (job.error) return finish({ ok: false, reason: job.error });
        if (job.status === "FINISHED") return finish({ ok: true });
        if (job.status === "FAILED" || job.status === "CANCELLED") {
          return finish({
            ok: false,
            reason: `update job ${job.status.toLowerCase()}`,
          });
        }
        // State must be READY, RUNNING, or STOPPING so we keep polling
      },
      onerror: (err) =>
        finish({ ok: false, reason: `Request error polling job: ${err}` }),
    });
  };

  const timer = setInterval(tick, intervalMs);
  const timeoutHandle = setTimeout(
    () =>
      finish({
        ok: false,
        reason: "timed out waiting for the update job to finish",
      }),
    timeoutMs,
  );
  tick();

  return promise;
}

export async function updateScraperPackage(
  pkg: Pick<ScraperPackageInfo, "packageId" | "sourceURL">,
  endpoint: string,
  apiKey: string,
): Promise<UpdateOutcome> {
  try {
    const jobId = await triggerScraperPackageUpdate(
      pkg.packageId,
      pkg.sourceURL,
      endpoint,
      apiKey,
    );
    return await pollScraperUpdateJob(jobId, endpoint, apiKey);
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

export async function resolveScraperFailureAction(
  scraperName: string,
  mode: "local" | "remote",
  endpoint: string,
  apiKey: string,
): Promise<ScraperFailureAction> {
  if (mode === "remote") {
    return {
      kind: "report-bug",
      packageName: scraperName,
      packageVersion: "latest (auto-updated via Scrape-CI)",
    };
  }

  try {
    const health = await checkScraperHealth(scraperName, endpoint, apiKey);
    if (health.status === "update-available")
      return { kind: "update", pkg: health.pkg };
    if (health.status === "up-to-date") {
      return {
        kind: "report-bug",
        packageName: health.pkg.name,
        packageVersion: health.pkg.installedVersion,
      };
    }
    return { kind: "none" };
  } catch (err) {
    return { kind: "none" };
  }
}

// Only report times in UTC to semi-anonymize the person who scraped this
export function formatUTCTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

export function buildBrokenScraperReportURL(params: {
  packageName: string;
  packageVersion: string;
  objectType: "scene" | "performer";
  url: string;
  scriptName: string;
  scriptURL: string | null;
  scriptVersion: string;
  now: Date;
}): string {
  const scraperType =
    params.objectType === "scene" ? "sceneByURL" : "performerByURL";
  const scriptName = params.scriptURL
    ? `[${params.scriptName}](${params.scriptURL})`
    : params.scriptName;

  const fields = [
    ["template", "broken_scraper_report.yml"],
    ["package-name", params.packageName],
    ["package-version", params.packageVersion],
    ["scraper-type", scraperType],
    [
      "scraper-specific-examples",
      `Tried scraping ${params.url} at ${formatUTCTimestamp(params.now)}`,
    ],
    [
      "additional-details",
      `Bug report opened by ${scriptName} version ${params.scriptVersion}\nDetected scraper type: ${scraperType} (select this above if it isn't already chosen)`,
    ],
  ];
  const query = fields
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `https://github.com/stashapp/CommunityScrapers/issues/new?${query}`;
}
