export type CurrentPerformer = {
  name: string;
  disambiguation?: string;
  alias?: string;
};

export type CurrentPerformerRef = {
  name: string;
  id: string | null;
  aliasInput: HTMLInputElement | null;
};

export function extractCurrentPerformerRefs(
  form: Element,
): CurrentPerformerRef[] {
  return Array.from(form.querySelectorAll(".performer-item")).map((el) => ({
    name: el.querySelector(".performer-name b")?.textContent?.trim() ?? "",
    id:
      el.querySelector<HTMLInputElement>('input[name$=".performerId"]')
        ?.value ?? null,
    aliasInput: el.querySelector<HTMLInputElement>(".rbt-input-main"),
  }));
}

export function extractCurrentTags(form: Element): string[] {
  return Array.from(form.querySelectorAll(".TagSelect .tag-item abbr")).map(
    (el) => el.textContent?.trim() ?? "",
  );
}

export function extractCurrentUrls(form: Element): string[] {
  return Array.from(
    form.querySelectorAll(".URLInput ul li .overflow-hidden"),
  ).map((el) => el.textContent?.trim() ?? "");
}

export function extractCurrentStudioName(form: Element): string {
  return (
    form
      .querySelector(".StudioSelect .react-select__single-value span")
      ?.textContent?.trim() ?? ""
  );
}

export type SceneFormSnapshot = {
  title: string;
  date: string;
  duration: string;
  performers: CurrentPerformer[];
  studioName: string;
  code: string;
  details: string;
  director: string;
  productionDate: string;
  tags: string[];
  urls: string[];
  images: string[];
};

function fieldValue(form: Element, name: string): string {
  const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  );
  return el?.value?.trim() ?? "";
}

function extractPerformer(el: Element): CurrentPerformer {
  const name = el.querySelector(".performer-name b")!.textContent;
  const disambiguation =
    el
      .querySelector(".performer-name small")
      ?.textContent.replace(/.(.*)./, "$1") ?? "";
  const alias = el.querySelector<HTMLInputElement>(".rbt-input-main")!.value;
  return {
    name,
    ...(disambiguation && { disambiguation }),
    ...(alias && { alias }),
  };
}

export function extractSceneFormData(form: Element): SceneFormSnapshot {
  return {
    title: fieldValue(form, "title"),
    date: fieldValue(form, "date"),
    duration: fieldValue(form, "duration"),
    performers: Array.from(form.querySelectorAll(".performer-item")).map(
      extractPerformer,
    ),
    studioName: extractCurrentStudioName(form),
    code: fieldValue(form, "code"),
    details: fieldValue(form, "details"),
    director: fieldValue(form, "director"),
    productionDate: fieldValue(form, "production_date"),
    tags: extractCurrentTags(form),
    urls: extractCurrentUrls(form),
    images: [],
  };
}
