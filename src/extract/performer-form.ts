function fieldValue(form: Element, name: string): string {
  const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${name}"]`,
  );
  return el!.value!.trim();
}

function selectValue(form: Element, name: string): string {
  const select = form.querySelector<HTMLSelectElement>(
    `select[name="${name}"]`,
  );
  const selectedOption =
    select?.querySelector<HTMLOptionElement>("option[selected]");
  return (selectedOption?.getAttribute("value") ?? select?.value ?? "").trim();
}

export function reactSelectValueFor(form: Element, labelFor: string): string {
  const label = form.querySelector(`label[for="${labelFor}"]`);
  return (
    label?.nextElementSibling
      ?.querySelector(".react-select__single-value")
      ?.textContent?.trim() ?? ""
  );
}

export function extractCurrentAliases(form: Element): string[] {
  return Array.from(
    form.querySelectorAll(
      'label[for="performer-aliases-select"] + div .react-select__multi-value__label',
    ),
  ).map((el) => el.textContent?.trim() ?? "");
}

type BreastType = "null" | "NATURAL" | "FAKE" | "NA";
export type PerformerFormSnapshot = {
  name: string;
  disambiguation: string;
  aliases: string[];
  gender: string;
  birthDate: string;
  deathDate: string;
  eyeColor: string;
  hairColor: string;
  height: string;
  breastType: BreastType;
  measurements: {
    bandSize: string;
    cupSize: string;
    waistSize: string;
    hipSize: string;
  };
  nationality: string;
  ethnicity: string;
  careerStart: string;
  careerEnd: string;
};

export function extractPerformerFormData(form: Element): PerformerFormSnapshot {
  return {
    name: fieldValue(form, "name"),
    disambiguation: fieldValue(form, "disambiguation"),
    aliases: extractCurrentAliases(form),
    gender: selectValue(form, "gender"),
    birthDate: fieldValue(form, "birthdate"),
    deathDate: fieldValue(form, "deathdate"),
    eyeColor: fieldValue(form, "eye_color"),
    hairColor: fieldValue(form, "hair_color"),
    height: fieldValue(form, "height"),
    breastType: selectValue(form, "breastType") as BreastType,
    measurements: {
      bandSize: fieldValue(form, "bandSize"),
      cupSize: fieldValue(form, "cupSize"),
      waistSize: fieldValue(form, "waistSize"),
      hipSize: fieldValue(form, "hipSize"),
    },
    nationality: reactSelectValueFor(form, "country"),
    ethnicity: fieldValue(form, "ethnicity"),
    careerStart: fieldValue(form, "career_start_year"),
    careerEnd: fieldValue(form, "career_end_year"),
  };
}
