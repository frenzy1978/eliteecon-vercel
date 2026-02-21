export type Strictness = "student-friendly" | "examiner-strict";

export function applyBandCalibration(
  awarded: number,
  max: number,
  strictness: Strictness
): { adjusted: number; band: string } {
  const ratio = awarded / Math.max(1, max);

  let adjusted = awarded;
  if (strictness === "examiner-strict") {
    adjusted = Math.max(0, Math.floor(awarded - 1));
  }

  const r = adjusted / Math.max(1, max);
  let band = "Low";
  if (r >= 0.75) band = "High";
  else if (r >= 0.5) band = "Mid";

  // small uplift for clearly strong scripts in student-friendly mode
  if (strictness === "student-friendly" && ratio >= 0.8) {
    adjusted = Math.min(max, adjusted + 1);
    band = "High";
  }

  return { adjusted, band };
}
