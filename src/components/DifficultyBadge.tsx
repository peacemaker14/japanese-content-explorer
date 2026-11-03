import {
  difficultyLabels,
  presentDifficulty,
  type Difficulty,
} from "@/lib/difficulty";

export function DifficultyBadge({
  difficulty,
  estimatedDifficulty,
}: {
  difficulty: Difficulty;
  estimatedDifficulty?: Difficulty | null;
}) {
  const presentation = presentDifficulty(difficulty, estimatedDifficulty);
  return (
    <span className="difficulty-badge">
      {difficultyLabels[presentation.value]}
      {presentation.isEstimate ? (
        <> <span className="difficulty-estimated">Machine estimate</span></>
      ) : null}
    </span>
  );
}
