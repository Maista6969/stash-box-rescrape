// Needed to copy everything that appears in a React-controlled form
// just paste it into Dev Tools console and run
(function captureFixtureSnapshot() {
  const clone = document.documentElement.cloneNode(true);

  // Remove scripts and CSS
  clone
    .querySelectorAll("script, link[rel='stylesheet'], style")
    .forEach((el) => el.remove());

  const liveInputs = document.querySelectorAll("input, textarea, select");
  const clonedInputs = clone.querySelectorAll("input, textarea, select");

  liveInputs.forEach((live, i) => {
    const cloned = clonedInputs[i];
    if (!cloned) return;

    if (
      live instanceof HTMLInputElement &&
      cloned instanceof HTMLInputElement
    ) {
      if (live.type === "checkbox" || live.type === "radio") {
        if (live.checked) cloned.setAttribute("checked", "");
        else cloned.removeAttribute("checked");
      } else {
        cloned.setAttribute("value", live.value);
      }
    } else if (
      live instanceof HTMLTextAreaElement &&
      cloned instanceof HTMLTextAreaElement
    ) {
      cloned.textContent = live.value;
    } else if (
      live instanceof HTMLSelectElement &&
      cloned instanceof HTMLSelectElement
    ) {
      const clonedOptions = cloned.querySelectorAll("option");
      Array.from(live.options).forEach((liveOption, j) => {
        const clonedOption = clonedOptions[j];
        if (!clonedOption) return;
        if (liveOption.selected) clonedOption.setAttribute("selected", "");
        else clonedOption.removeAttribute("selected");
      });
    }
  });

  const html = "<!doctype html>\n" + clone.outerHTML;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fixture-snapshot.html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  console.log("downloaded fixture-snapshot.html");
})();
