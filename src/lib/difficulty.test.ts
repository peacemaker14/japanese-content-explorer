import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DifficultyBadge } from "../components/DifficultyBadge";
import { difficultyEstimateGuidance, presentDifficulty } from "./difficulty";

describe("difficulty presentation", () => {
  it.each(["beginner", "intermediate", "advanced"] as const)("prefers manual %s over every estimate", (manual) => {
    for (const estimate of [null, "unassessed", "beginner", "intermediate", "advanced"] as const) {
      expect(presentDifficulty(manual, estimate)).toEqual({
        value: manual,
        label: manual[0].toUpperCase() + manual.slice(1),
        isEstimate: false,
      });
    }
  });
  it.each([undefined, null, "unassessed"] as const)("uses Unrated without assessed data (%s)", (estimate) => {
    expect(presentDifficulty("unassessed", estimate)).toEqual({ value: "unassessed", label: "Unrated", isEstimate: false });
  });
  it.each(["beginner", "intermediate", "advanced"] as const)("visibly qualifies a machine %s estimate", (estimate) => {
    const presentation = presentDifficulty("unassessed", estimate);
    expect(presentation.value).toBe(estimate);
    expect(presentation.isEstimate).toBe(true);
    expect(presentation.label).toContain("machine estimate");
    const badge = renderToStaticMarkup(DifficultyBadge({ difficulty: "unassessed", estimatedDifficulty: estimate }));
    expect(badge).toContain('class="difficulty-estimated"');
    expect(badge).toContain("Machine estimate");
    expect(badge).not.toMatch(/N[1-5]/);
  });
  it("does not mislabel a manual rating as machine-generated", () => {
    const badge = renderToStaticMarkup(DifficultyBadge({ difficulty: "beginner", estimatedDifficulty: "advanced" }));
    expect(badge).toContain("Beginner");
    expect(badge).not.toContain("Machine estimate");
    expect(badge).not.toContain("Advanced");
    expect(difficultyEstimateGuidance).toContain("not verified listening assessments or JLPT levels");
  });
});
