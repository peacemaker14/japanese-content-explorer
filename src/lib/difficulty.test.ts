import { describe, expect, it } from "vitest";
import { presentDifficulty } from "./difficulty";

const assessedLevels = [
  ["beginner", "Beginner"],
  ["intermediate", "Intermediate"],
  ["advanced", "Hard"],
] as const;

describe("difficulty presentation", () => {
  it.each(assessedLevels)("prefers manual %s over every estimate", (manual, label) => {
    for (const estimate of [null, "unassessed", "beginner", "intermediate", "advanced"] as const) {
      expect(presentDifficulty(manual, estimate)).toEqual({
        value: manual,
        label,
        isEstimate: false,
      });
    }
  });

  it.each([undefined, null, "unassessed"] as const)("uses Unrated without assessed data (%s)", (estimate) => {
    expect(presentDifficulty("unassessed", estimate)).toEqual({
      value: "unassessed",
      label: "Unrated",
      isEstimate: false,
    });
  });

  it.each(assessedLevels)("retains estimate provenance without changing the %s level label", (estimate, label) => {
    expect(presentDifficulty("unassessed", estimate)).toEqual({
      value: estimate,
      label,
      isEstimate: true,
    });
  });
});
