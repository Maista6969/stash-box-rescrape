// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateScraperHealth,
  resolveScraperFailureAction,
  buildBrokenScraperReportURL,
  formatUTCTimestamp,
  pollScraperUpdateJob,
} from "./scraper-health";

// Mocking the ambient Tampermonkey global: its real type is a complex
// generic overloaded declaration not worth reproducing here.
type MockGMHandlers = {
  onload?: (res: { status: number; response: unknown }) => void;
  onerror?: (err: unknown) => void;
};

function mockGMRequest(impl: (handlers: MockGMHandlers) => void) {
  const mock = vi.fn(impl);
  (
    globalThis as unknown as { GM_xmlhttpRequest: typeof mock }
  ).GM_xmlhttpRequest = mock;
  return mock;
}

const reptyleOutOfDate = {
  package_id: "Reptyle",
  name: "Reptyle",
  version: "47c150cc",
  date: "2026-07-13T15:54:27Z",
  sourceURL: "https://stashapp.github.io/CommunityScrapers/stable/index.yml",
  source_package: {
    package_id: "Reptyle",
    name: "Reptyle",
    version: "19bf5bf7",
    date: "2026-07-16T20:03:20Z",
    sourceURL: "https://stashapp.github.io/CommunityScrapers/stable/index.yml",
  },
};

describe("evaluateScraperHealth", () => {
  it("detects an update available when installed and source versions differ", () => {
    const result = evaluateScraperHealth("Reptyle", [reptyleOutOfDate]);
    expect(result).toEqual({
      status: "update-available",
      pkg: {
        packageId: "Reptyle",
        name: "Reptyle",
        sourceURL:
          "https://stashapp.github.io/CommunityScrapers/stable/index.yml",
        installedVersion: "47c150cc",
        installedDate: "2026-07-13T15:54:27Z",
        latestVersion: "19bf5bf7",
        latestDate: "2026-07-16T20:03:20Z",
      },
    });
  });

  it("reports up to date when installed and source versions match", () => {
    const upToDate = {
      ...reptyleOutOfDate,
      version: "19bf5bf7",
      source_package: {
        ...reptyleOutOfDate.source_package,
        version: "19bf5bf7",
      },
    };
    const result = evaluateScraperHealth("Reptyle", [upToDate]);
    expect(result.status).toBe("up-to-date");
  });

  it("returns unknown when no installed package matches the scraper name", () => {
    const result = evaluateScraperHealth("SomeOtherScraper", [
      reptyleOutOfDate,
    ]);
    expect(result).toEqual({ status: "unknown" });
  });

  it("returns unknown when the package isn't sourced from the official CommunityScrapers feed", () => {
    const privatelySourced = {
      ...reptyleOutOfDate,
      sourceURL: "https://example.com/my-private-scrapers/index.yml",
    };
    const result = evaluateScraperHealth("Reptyle", [privatelySourced]);
    expect(result).toEqual({ status: "unknown" });
  });

  it("returns unknown when there's no source_package to compare against", () => {
    const noSourceInfo = { ...reptyleOutOfDate, source_package: null };
    const result = evaluateScraperHealth("Reptyle", [noSourceInfo]);
    expect(result).toEqual({ status: "unknown" });
  });

  it("falls back to an unambiguous substring match when a package bundles a differently-named scraper", () => {
    const bundlingPackage = {
      ...reptyleOutOfDate,
      package_id: "JacquieEtMichel",
      name: "JacquieEtMichel",
      source_package: {
        ...reptyleOutOfDate.source_package,
        name: "JacquieEtMichel",
      },
    };
    const result = evaluateScraperHealth("JacquieEtMichelTV", [
      bundlingPackage,
    ]);
    expect(result.status).toBe("update-available");
    if (result.status === "update-available") {
      expect(result.pkg.packageId).toBe("JacquieEtMichel");
    }
  });

  it("does not guess when more than one package could plausibly match", () => {
    const first = { ...reptyleOutOfDate, package_id: "Michel", name: "Michel" };
    const second = {
      ...reptyleOutOfDate,
      package_id: "JacquieEtMichel",
      name: "JacquieEtMichel",
      source_package: {
        ...reptyleOutOfDate.source_package,
        name: "JacquieEtMichel",
      },
    };
    const result = evaluateScraperHealth("JacquieEtMichelTV", [first, second]);
    expect(result).toEqual({ status: "unknown" });
  });
});

describe("resolveScraperFailureAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips straight to report-bug for remote mode without making any network call", async () => {
    const gmMock = mockGMRequest(() => {});

    const action = await resolveScraperFailureAction(
      "Reptyle",
      "remote",
      "endpoint",
      "key",
    );

    expect(action).toEqual({
      kind: "report-bug",
      packageName: "Reptyle",
      packageVersion: "latest (auto-updated via Scrape-CI)",
    });
    expect(gmMock).not.toHaveBeenCalled();
  });

  it("resolves to update for local mode when an update is available", async () => {
    mockGMRequest(({ onload }) => {
      onload!({
        status: 200,
        response: { data: { installedPackages: [reptyleOutOfDate] } },
      });
    });

    const action = await resolveScraperFailureAction(
      "Reptyle",
      "local",
      "endpoint",
      "key",
    );
    expect(action.kind).toBe("update");
  });

  it("resolves to report-bug for local mode when already up to date", async () => {
    const upToDate = {
      ...reptyleOutOfDate,
      version: "19bf5bf7",
      source_package: {
        ...reptyleOutOfDate.source_package,
        version: "19bf5bf7",
      },
    };
    mockGMRequest(({ onload }) => {
      onload!({
        status: 200,
        response: { data: { installedPackages: [upToDate] } },
      });
    });

    const action = await resolveScraperFailureAction(
      "Reptyle",
      "local",
      "endpoint",
      "key",
    );
    expect(action).toEqual({
      kind: "report-bug",
      packageName: "Reptyle",
      packageVersion: "19bf5bf7",
    });
  });

  it("degrades to none when the health check itself fails", async () => {
    // resolveScraperFailureAction logs this failure before degrading -
    // suppress it so a real network error doesn't spam the test output,
    // and confirm it actually happened
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGMRequest(({ onerror }) => {
      onerror!("network error");
    });

    const action = await resolveScraperFailureAction(
      "Reptyle",
      "local",
      "endpoint",
      "key",
    );
    expect(action).toEqual({ kind: "none" });
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

describe("formatUTCTimestamp", () => {
  it("formats in UTC regardless of the value's own offset, zero-padded", () => {
    // 2026-07-14T20:24:00-05:00 is 2026-07-15 01:24 UTC.
    const date = new Date("2026-07-14T20:24:00-05:00");
    expect(formatUTCTimestamp(date)).toBe("2026-07-15 01:24 UTC");
  });

  it("zero-pads single-digit month/day/hour/minute", () => {
    const date = new Date("2026-01-02T03:04:00Z");
    expect(formatUTCTimestamp(date)).toBe("2026-01-02 03:04 UTC");
  });
});

describe("buildBrokenScraperReportURL", () => {
  const baseParams = {
    packageName: "Minnano-AV (EN)",
    packageVersion: "cd51adbb",
    objectType: "scene" as const,
    url: "https://example.com/scenes/1?ref=a&b=2",
    scriptName: "stash-box rescrape",
    scriptURL: "https://www.stash-box-rescrape.com",
    scriptVersion: "0.1.0",
    now: new Date("2026-07-14T20:24:00Z"),
  };

  it("builds a GitHub issue-form URL with all fields url-encoded", () => {
    const url = buildBrokenScraperReportURL(baseParams);

    expect(url).toBe(
      "https://github.com/stashapp/CommunityScrapers/issues/new?" +
        "template=broken_scraper_report.yml&" +
        "package-name=Minnano-AV%20(EN)&" +
        "package-version=cd51adbb&" +
        "scraper-type=sceneByURL&" +
        "scraper-specific-examples=Tried%20scraping%20%60https%3A%2F%2Fexample.com%2Fscenes%2F1%3Fref%3Da%26b%3D2%60%20at%202026-07-14%2020%3A24%20UTC&" +
        "additional-details=Bug%20report%20opened%20by%20%5Bstash-box%20rescrape%5D(https%3A%2F%2Fwww.stash-box-rescrape.com)%20version%200.1.0%0A" +
        "Detected%20scraper%20type%3A%20sceneByURL%20(select%20this%20above%20if%20it%20isn't%20already%20chosen)",
    );
  });

  it("uses performerByURL for performer object types", () => {
    const url = buildBrokenScraperReportURL({
      ...baseParams,
      objectType: "performer",
    });
    expect(url).toContain("scraper-type=performerByURL");
    expect(url).toContain("Detected%20scraper%20type%3A%20performerByURL");
  });

  it("includes the script name/version in additional-details", () => {
    const url = buildBrokenScraperReportURL({
      ...baseParams,
      scriptName: "My Fork",
      scriptURL: "https://example.com/script",
      scriptVersion: "9.9.9",
    });
    expect(decodeURIComponent(url)).toContain(
      "Bug report opened by [My Fork](https://example.com/script) version 9.9.9",
    );
  });
});

describe("pollScraperUpdateJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves ok once the job status becomes FINISHED", async () => {
    let callCount = 0;
    mockGMRequest(({ onload }) => {
      callCount += 1;
      const status = callCount < 3 ? "RUNNING" : "FINISHED";
      onload!({
        status: 200,
        response: { data: { findJob: { status, error: null } } },
      });
    });

    const promise = pollScraperUpdateJob("job-1", "endpoint", "key", {
      intervalMs: 500,
    });
    await vi.advanceTimersByTimeAsync(500 * 3);

    await expect(promise).resolves.toEqual({ ok: true });
    expect(callCount).toBe(3);
  });

  it("resolves not-ok and stops polling once the timeout is reached", async () => {
    const gmMock = mockGMRequest(({ onload }) => {
      onload!({
        status: 200,
        response: { data: { findJob: { status: "RUNNING", error: null } } },
      });
    });

    const promise = pollScraperUpdateJob("job-1", "endpoint", "key", {
      intervalMs: 500,
      timeoutMs: 2000,
    });
    await vi.advanceTimersByTimeAsync(2000);

    const outcome = await promise;
    expect(outcome.ok).toBe(false);

    const callsAtTimeout = gmMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    // No further polling once the timeout has resolved the promise.
    expect(gmMock.mock.calls.length).toBe(callsAtTimeout);
  });

  it("resolves not-ok when the job reports an error", async () => {
    mockGMRequest(({ onload }) => {
      onload!({
        status: 200,
        response: { data: { findJob: { status: "RUNNING", error: "boom" } } },
      });
    });

    const promise = pollScraperUpdateJob("job-1", "endpoint", "key", {
      intervalMs: 500,
    });
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toEqual({ ok: false, reason: "boom" });
  });
});
