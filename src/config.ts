const CONFIG_KEY = "stash-box-rescrape";
type Mode = "local" | "remote";
type Endpoint = {
  endpoint: string;
  apiKey: string;
};
export type LocalEndpoint = Endpoint & {
  id: string;
  label: string;
  // Hostname of a stash-box site (e.g. "fansdb.cc") this endpoint should be
  // used on automatically. Null if it isn't tied to a specific site.
  site: string | null;
};
export type PanelPosition = { top: number; left: number } | null;
export type PanelSize = { width: number; height: number } | null;
export type Config = {
  mode: Mode;
  defaultLocalId: string;
  local: LocalEndpoint[];
  remote: Endpoint;
  // Remembers the position of the "Scraped with" panel on edit pages
  panelPosition: PanelPosition;
  panelSize: PanelSize;
};

const DEFAULT_LOCAL_ID = "default";

const defaultConfig: Config = {
  mode: "local",
  local: [
    {
      id: DEFAULT_LOCAL_ID,
      label: "Local",
      endpoint: "http://localhost:9999/graphql",
      apiKey: "",
      site: null,
    },
  ],
  defaultLocalId: DEFAULT_LOCAL_ID,
  remote: {
    endpoint: "https://scrape.feederbox.cc/api/scrape",
    apiKey: "",
  },
  panelPosition: null,
  panelSize: null,
};

// Older saved configs stored a single { endpoint, apiKey } object under
// `local` instead of a list - migrate it into a one-item list so existing
// users keep their endpoint without having to reconfigure anything
function migrateLocal(raw: unknown): LocalEndpoint[] {
  if (Array.isArray(raw) && raw.length) return raw as LocalEndpoint[];
  if (raw && typeof raw === "object" && "endpoint" in raw) {
    const { endpoint, apiKey } = raw as Endpoint;
    return [
      { id: DEFAULT_LOCAL_ID, label: "Local", endpoint, apiKey, site: null },
    ];
  }
  return defaultConfig.local;
}

export const loadConfig = (): Config => {
  let parsed: Partial<Config> & { local?: unknown };
  try {
    parsed = JSON.parse(GM_getValue(CONFIG_KEY, "{}"));
  } catch {
    parsed = {};
  }
  const local = migrateLocal(parsed.local);
  const defaultLocalId = local.some((l) => l.id === parsed.defaultLocalId)
    ? parsed.defaultLocalId!
    : local[0].id;
  return { ...defaultConfig, ...parsed, local, defaultLocalId };
};

export const saveConfig = (cfg: Config) =>
  GM_setValue(CONFIG_KEY, JSON.stringify(cfg));

export function resolveLocalEndpoint(
  cfg: Config,
  hostname: string = window.location.hostname,
): LocalEndpoint {
  const bySite = cfg.local.find(
    (l) => l.site && l.site.toLowerCase() === hostname.toLowerCase(),
  );
  return (
    bySite ??
    cfg.local.find((l) => l.id === cfg.defaultLocalId) ??
    cfg.local[0] ??
    defaultConfig.local[0]
  );
}

export function getActiveEndpoint(
  cfg: Config,
  hostname: string = window.location.hostname,
): Endpoint {
  const { endpoint, apiKey } =
    cfg.mode === "remote" ? cfg.remote : resolveLocalEndpoint(cfg, hostname);
  return { endpoint, apiKey };
}
