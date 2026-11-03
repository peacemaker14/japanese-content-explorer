import {
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
  return <span className="difficulty-badge" data-difficulty={presentation.value}>{presentation.label}</span>;
}
