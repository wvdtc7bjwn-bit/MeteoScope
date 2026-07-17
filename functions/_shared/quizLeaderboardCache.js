import { QUIZ_DIFFICULTIES } from "./quizCatalog.js";
import { quizRankingDate } from "./quizStorage.js";

export async function invalidateQuizLeaderboardCache(difficulty, rankingDate = quizRankingDate()) {
  const cache = globalThis.caches?.default;
  if (cache) await cache.delete(quizLeaderboardCacheKey(rankingDate, difficulty));
}

export async function invalidateAllQuizLeaderboardCaches(rankingDate = quizRankingDate()) {
  await Promise.all(
    QUIZ_DIFFICULTIES.map((difficulty) => invalidateQuizLeaderboardCache(difficulty, rankingDate))
  );
}

export function quizLeaderboardCacheKey(rankingDate, difficulty) {
  return new Request(
    `https://cache.meteoscope.invalid/quiz-leaderboard/v3/${encodeURIComponent(rankingDate)}/${encodeURIComponent(difficulty)}`
  );
}
