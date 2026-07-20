import { loadConfig, saveConfig, type LocalEndpoint } from "./config";
import { reloadScraperPatterns } from "./scraper-dispatch";
import { reloadEditcardScraperIcons } from "./edit-card/verify";
import { reloadEditPageScraperButtons } from "./edit-page/inject";

export const showConfigMenu = () => {
  const cfg = loadConfig();

  const style = new CSSStyleSheet();
  style.replaceSync(`
    .cfg-panel {
      background: #1e1e2e; color: #cdd6f4; border-radius: 12px;
      padding: 24px 28px; width: 420px;
      font: 14px/1.6 system-ui, sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
    }
    .cfg-panel h2 { margin: 0 0 16px; font-size: 18px; color: #89b4fa; }
    .cfg-field { margin-bottom: 12px; }
    .cfg-field label { display: block; font-size: 12px; color: #a6adc8; margin-bottom: 2px; }
    .cfg-field input[type=text] {
      width: 100%; box-sizing: border-box; padding: 6px 10px;
      border: 1px solid #45475a; border-radius: 6px;
      background: #313244; color: #cdd6f4; font: inherit;
    }
    .cfg-field input[type=text]:focus { outline: none; border-color: #89b4fa; }
    .cfg-radio-group { display: flex; gap: 20px; margin-bottom: 16px; }
    .cfg-radio-group label {
      display: flex; align-items: center; gap: 6px; cursor: pointer;
      font-size: 15px; font-weight: 600;
    }
    .cfg-sub { border-left: 3px solid #45475a; padding-left: 14px; margin-bottom: 8px; }
    .cfg-sub.hidden { display: none; }
    .cfg-optional label::after { content: ' (optional)'; color: #6c7086; font-weight: 400; font-size: 11px; }
    .cfg-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
    .cfg-actions button {
      padding: 6px 18px; border-radius: 6px; border: none;
      font: inherit; cursor: pointer; font-weight: 600;
    }
    .btn-save { background: #89b4fa; color: #1e1e2e; }
    .btn-cancel { background: #45475a; color: #cdd6f4; }
    .btn-close { position: absolute; top: 10px; right: 14px; background: none;
      border: none; color: #6c7086; font-size: 20px; cursor: pointer; line-height: 1; }
    .cfg-local-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 10px; }
    .cfg-local-row {
      border: 1px solid #45475a; border-radius: 8px; padding: 10px 12px;
      background: #232436;
    }
    .cfg-local-row-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .cfg-local-row-header input[type=radio] { flex: none; cursor: pointer; }
    .cfg-local-label {
      flex: 1; box-sizing: border-box; padding: 4px 8px;
      border: 1px solid #45475a; border-radius: 6px;
      background: #313244; color: #cdd6f4; font: inherit; font-weight: 600;
    }
    .cfg-local-label:focus { outline: none; border-color: #89b4fa; }
    .cfg-local-remove {
      flex: none; background: none; border: none; color: #f38ba8;
      font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px;
    }
    .cfg-local-remove:disabled { color: #45475a; cursor: not-allowed; }
    .cfg-local-row .cfg-field:last-child { margin-bottom: 0; }
    .cfg-site-row { display: flex; gap: 6px; }
    .cfg-site-row input[type=text] { flex: 1; }
    .btn-use-site {
      flex: none; padding: 0 10px; border-radius: 6px; border: 1px solid #45475a;
      background: #313244; color: #a6adc8; font: inherit; font-size: 12px; cursor: pointer;
    }
    .btn-use-site:hover { color: #cdd6f4; border-color: #89b4fa; }
    .btn-add-local {
      background: none; border: 1px dashed #45475a; border-radius: 6px;
      color: #a6adc8; font: inherit; font-weight: 600; padding: 6px 10px;
      cursor: pointer; width: 100%; margin-bottom: 16px;
    }
    .btn-add-local:hover { color: #89b4fa; border-color: #89b4fa; }
    .cfg-hint { font-size: 11px; color: #6c7086; margin: -6px 0 12px; }
  `);

  const dialog = document.createElement("dialog");
  dialog.style.cssText =
    "background:transparent;border:none;padding:0;max-width:100vw;max-height:100vh;";

  const host = document.createElement("div");
  host.className = "cfg-host";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.adoptedStyleSheets = [style];

  const live = {
    ...cfg,
    local: cfg.local.map((entry) => ({ ...entry })),
    remote: { ...cfg.remote },
  };

  const findLocal = (id: string): LocalEndpoint =>
    live.local.find((entry) => entry.id === id)!;

  const panel = document.createElement("div");
  panel.className = "cfg-panel";
  panel.style.position = "relative";

  const btnClose = document.createElement("button");
  btnClose.className = "btn-close";
  btnClose.title = "Close";
  btnClose.textContent = "×";

  const heading = document.createElement("h2");
  heading.textContent = "Configuration";

  const radioGroup = document.createElement("div");
  radioGroup.className = "cfg-radio-group";

  const makeRadio = (value: "local" | "remote", labelText: string) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "mode";
    input.value = value;
    input.checked = cfg.mode === value;
    label.append(input, " ", labelText);
    return { label, input };
  };

  const { input: localRadio } = makeRadio("local", "Local");
  const { input: remoteRadio } = makeRadio("remote", "Remote");
  radioGroup.append(localRadio.parentElement!, remoteRadio.parentElement!);

  const localSub = document.createElement("div");
  localSub.className = `cfg-sub ${cfg.mode !== "local" ? "hidden" : ""}`;
  localSub.dataset.for = "local";

  const remoteSub = document.createElement("div");
  remoteSub.className = `cfg-sub ${cfg.mode !== "remote" ? "hidden" : ""}`;
  remoteSub.dataset.for = "remote";

  const makeTextField = (
    labelText: string,
    value: string,
    onChange: (value: string) => void,
    optional = false,
    placeholder = "",
  ) => {
    const wrap = document.createElement("div");
    wrap.className = `cfg-field ${optional ? "cfg-optional" : ""}`;
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener("input", () => onChange(input.value));
    wrap.append(label, input);
    return wrap;
  };

  const makeSiteField = (entry: LocalEndpoint) => {
    const wrap = document.createElement("div");
    wrap.className = "cfg-field cfg-optional";
    const label = document.createElement("label");
    label.textContent = "Site";
    const row = document.createElement("div");
    row.className = "cfg-site-row";
    const input = document.createElement("input");
    input.type = "text";
    input.value = entry.site ?? "";
    input.placeholder = "e.g. fansdb.cc";
    input.addEventListener("input", () => {
      findLocal(entry.id).site = input.value.trim() || null;
    });
    const useCurrentBtn = document.createElement("button");
    useCurrentBtn.type = "button";
    useCurrentBtn.className = "btn-use-site";
    useCurrentBtn.textContent = "Use current";
    useCurrentBtn.title = `Fill in ${window.location.hostname}`;
    useCurrentBtn.addEventListener("click", () => {
      input.value = window.location.hostname;
      findLocal(entry.id).site = input.value;
    });
    row.append(input, useCurrentBtn);
    wrap.append(label, row);
    return wrap;
  };

  const localList = document.createElement("div");
  localList.className = "cfg-local-list";

  const renderLocalList = () => {
    localList.replaceChildren();
    for (const entry of live.local) {
      localList.appendChild(makeLocalRow(entry));
    }
  };

  const makeLocalRow = (entry: LocalEndpoint) => {
    const row = document.createElement("div");
    row.className = "cfg-local-row";

    const rowHeader = document.createElement("div");
    rowHeader.className = "cfg-local-row-header";

    const defaultRadio = document.createElement("input");
    defaultRadio.type = "radio";
    defaultRadio.name = "defaultLocal";
    defaultRadio.title =
      "Use as the fallback when the current site has no assigned endpoint";
    defaultRadio.checked = live.defaultLocalId === entry.id;
    defaultRadio.addEventListener("change", () => {
      live.defaultLocalId = entry.id;
    });

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "cfg-local-label";
    labelInput.value = entry.label;
    labelInput.placeholder = "Name (e.g. JAV)";
    labelInput.addEventListener("input", () => {
      findLocal(entry.id).label = labelInput.value;
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "cfg-local-remove";
    removeBtn.title = "Remove this endpoint";
    removeBtn.textContent = "×";
    removeBtn.disabled = live.local.length <= 1;
    removeBtn.addEventListener("click", () => {
      live.local = live.local.filter((l) => l.id !== entry.id);
      if (live.defaultLocalId === entry.id) {
        live.defaultLocalId = live.local[0].id;
      }
      renderLocalList();
    });

    rowHeader.append(defaultRadio, labelInput, removeBtn);

    row.append(
      rowHeader,
      makeTextField("API endpoint", entry.endpoint, (v) => {
        findLocal(entry.id).endpoint = v;
      }),
      makeTextField(
        "API key",
        entry.apiKey,
        (v) => {
          findLocal(entry.id).apiKey = v;
        },
        true,
        "Leave blank if not needed",
      ),
      makeSiteField(entry),
    );
    return row;
  };

  renderLocalList();

  const addLocalBtn = document.createElement("button");
  addLocalBtn.type = "button";
  addLocalBtn.className = "btn-add-local";
  addLocalBtn.textContent = "+ Add endpoint";
  addLocalBtn.addEventListener("click", () => {
    live.local.push({
      id: crypto.randomUUID(),
      label: `Endpoint ${live.local.length + 1}`,
      endpoint: "http://localhost:9999/graphql",
      apiKey: "",
      site: null,
    });
    renderLocalList();
  });

  const localHint = document.createElement("p");
  localHint.className = "cfg-hint";
  localHint.textContent =
    "The dot marks the default endpoint. An endpoint with a site set is used automatically on that site.";

  localSub.append(localHint, localList, addLocalBtn);

  remoteSub.append(
    makeTextField("API endpoint", live.remote.endpoint, (v) => {
      live.remote.endpoint = v;
    }),
    makeTextField("API key", live.remote.apiKey, (v) => {
      live.remote.apiKey = v;
    }),
  );

  const actions = document.createElement("div");
  actions.className = "cfg-actions";

  const btnCancel = document.createElement("button");
  btnCancel.className = "btn-cancel";
  btnCancel.textContent = "Cancel";

  const btnSave = document.createElement("button");
  btnSave.className = "btn-save";
  btnSave.textContent = "Save";

  actions.append(btnCancel, btnSave);

  panel.append(btnClose, heading, radioGroup, localSub, remoteSub, actions);
  shadow.appendChild(panel);

  const updateMode = () => {
    const mode = localRadio.checked ? "local" : "remote";
    live.mode = mode;
    localSub.classList.toggle("hidden", mode !== "local");
    remoteSub.classList.toggle("hidden", mode !== "remote");
  };

  localRadio.addEventListener("change", updateMode);
  remoteRadio.addEventListener("change", updateMode);

  const close = () => dialog.close();
  btnCancel.addEventListener("click", close);
  btnClose.addEventListener("click", close);
  btnSave.addEventListener("click", () => {
    saveConfig(live);
    // Replace buttons but leave results as they are, user might want to keep
    // comparing until they rescrape (or switch back to the same source)
    reloadScraperPatterns().then(() => {
      reloadEditcardScraperIcons();
      reloadEditPageScraperButtons();
    });
    close();
  });

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  dialog.appendChild(host);
  document.body.appendChild(dialog);
  dialog.showModal();
};
