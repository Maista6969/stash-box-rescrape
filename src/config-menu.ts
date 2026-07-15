import { loadConfig, saveConfig } from "./config";
import { reloadScraperPatterns } from "./scraper-dispatch";
import { reloadEditcardScraperIcons } from "./edit-card/verify";
import { reloadEditPageScraperButtons } from "./edit-page/inject";

export const showConfigMenu = () => {
  const cfg = loadConfig();

  const style = new CSSStyleSheet();
  style.replaceSync(`
    .cfg-panel {
      background: #1e1e2e; color: #cdd6f4; border-radius: 12px;
      padding: 24px 28px; width: 380px;
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
  `);

  const dialog = document.createElement("dialog");
  dialog.style.cssText =
    "background:transparent;border:none;padding:0;max-width:100vw;max-height:100vh;";

  const host = document.createElement("div");
  host.className = "cfg-host";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.adoptedStyleSheets = [style];

  const live = { ...cfg, local: { ...cfg.local }, remote: { ...cfg.remote } };

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

  const makeField = (
    section: "local" | "remote",
    prop: "endpoint" | "apiKey",
    labelText: string,
    optional = false,
    placeholder = "",
  ) => {
    const wrap = document.createElement("div");
    wrap.className = `cfg-field ${optional ? "cfg-optional" : ""}`;
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.value = live[section][prop];
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener("input", () => {
      live[section][prop] = input.value;
    });
    wrap.append(label, input);
    return wrap;
  };

  localSub.append(
    makeField("local", "endpoint", "API endpoint"),
    makeField("local", "apiKey", "API key", true, "Leave blank if not needed"),
  );

  remoteSub.append(
    makeField("remote", "endpoint", "API endpoint"),
    makeField("remote", "apiKey", "API key"),
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
    reloadScraperPatterns()
      .then(() => {
        reloadEditcardScraperIcons();
        reloadEditPageScraperButtons();
      })
      .catch((err) =>
        console.error("[rescrape] Failed to reload scraper patterns:", err),
      );
    close();
  });

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });

  dialog.appendChild(host);
  document.body.appendChild(dialog);
  dialog.showModal();
};
