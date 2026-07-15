export function parseMeasurements(raw: string | null | undefined) {
  if (!raw) return null;

  const [, bandSize = null, cupSize = null, waistSize = null, hipSize = null] =
    raw.match(
      /(?<bandSize>\d{2})(?<cupSize>[A-Z]+)(?:-|\s)(?:(?<waistSize>\d{2})|\?+)(?:-|\s)(?:(?<hipSize>\d{2})|\?+)/i,
    ) || [];

  return { bandSize, cupSize, waistSize, hipSize };
}
