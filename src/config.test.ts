import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadConfig,
  saveConfig,
  resolveLocalEndpoint,
  getActiveEndpoint,
  type Config,
} from "./config";

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("GM_getValue", (key: string, def: string) => store[key] ?? def);
  vi.stubGlobal("GM_setValue", (key: string, value: string) => {
    store[key] = value;
  });
});

const baseConfig = (overrides: Partial<Config> = {}): Config => ({
  mode: "local",
  local: [
    {
      id: "a",
      label: "StashDB",
      endpoint: "http://localhost:9999/graphql",
      apiKey: "key-a",
      site: null,
    },
    {
      id: "b",
      label: "FansDB",
      endpoint: "http://localhost:10001/graphql",
      apiKey: "key-b",
      site: "fansdb.cc",
    },
  ],
  defaultLocalId: "a",
  remote: {
    endpoint: "https://scrape.feederbox.cc/api/scrape",
    apiKey: "remote-key",
  },
  panelPosition: null,
  panelSize: null,
  ...overrides,
});

describe("loadConfig", () => {
  it("returns a single default local endpoint when nothing has been saved", () => {
    const cfg = loadConfig();
    expect(cfg.mode).toBe("local");
    expect(cfg.local).toHaveLength(1);
    expect(cfg.local[0]).toMatchObject({
      label: "Local",
      endpoint: "http://localhost:9999/graphql",
      site: null,
    });
    expect(cfg.defaultLocalId).toBe(cfg.local[0].id);
  });

  it("migrates an old single-object local endpoint into a one-item list", () => {
    store["stash-box-rescrape"] = JSON.stringify({
      mode: "local",
      local: { endpoint: "http://localhost:10001/graphql", apiKey: "secret" },
      remote: {
        endpoint: "https://scrape.feederbox.cc/api/scrape",
        apiKey: "",
      },
    });

    const cfg = loadConfig();

    expect(cfg.local).toEqual([
      {
        id: "default",
        label: "Local",
        endpoint: "http://localhost:10001/graphql",
        apiKey: "secret",
        site: null,
      },
    ]);
    expect(cfg.defaultLocalId).toBe("default");
  });

  it("round-trips a saved multi-endpoint config unchanged", () => {
    const cfg = baseConfig();
    saveConfig(cfg);
    expect(loadConfig()).toEqual(cfg);
  });

  it("falls back to the first local endpoint's id when the saved defaultLocalId no longer exists", () => {
    store["stash-box-rescrape"] = JSON.stringify({
      local: [
        {
          id: "a",
          label: "JAV",
          endpoint: "http://localhost:9999/graphql",
          apiKey: "",
          site: null,
        },
      ],
      defaultLocalId: "deleted-id",
    });

    expect(loadConfig().defaultLocalId).toBe("a");
  });
});

describe("resolveLocalEndpoint", () => {
  const cfg = baseConfig();

  it("uses the endpoint explicitly assigned to the current site", () => {
    expect(resolveLocalEndpoint(cfg, "fansdb.cc").id).toBe("b");
  });

  it("matches the assigned site case-insensitively", () => {
    expect(resolveLocalEndpoint(cfg, "FansDB.cc").id).toBe("b");
  });

  it("falls back to the default endpoint on a site with no assigned endpoint", () => {
    expect(resolveLocalEndpoint(cfg, "stashdb.org").id).toBe("a");
  });
});

describe("getActiveEndpoint", () => {
  const cfg = baseConfig();

  it("resolves the site-specific local endpoint's endpoint/apiKey when mode is local", () => {
    expect(getActiveEndpoint(cfg, "fansdb.cc")).toEqual({
      endpoint: "http://localhost:10001/graphql",
      apiKey: "key-b",
    });
  });

  it("falls back to the default local endpoint on an unmapped site", () => {
    expect(getActiveEndpoint(cfg, "stashdb.org")).toEqual({
      endpoint: "http://localhost:9999/graphql",
      apiKey: "key-a",
    });
  });

  it("always uses the single remote endpoint when mode is remote, regardless of site", () => {
    expect(
      getActiveEndpoint(baseConfig({ mode: "remote" }), "fansdb.cc"),
    ).toEqual({
      endpoint: "https://scrape.feederbox.cc/api/scrape",
      apiKey: "remote-key",
    });
  });
});
