import type { ForecastResponse } from "./useForecastData";
export function segmentosCobertura(summary: ForecastResponse["summary"]) {
  const quota = summary.quota.total;
  if (
    !quota ||
    summary.quota.sinTasa.length ||
    summary.commit.sinTasa.length ||
    summary.won.sinTasa.length ||
    summary.bestCase.sinTasa.length
  )
    return null;
  const pct = (amount: number) =>
    Math.max(0, Math.min(100, (amount / quota) * 100));
  const won = Math.min(pct(summary.won.total), pct(summary.commit.total));
  const commit = pct(summary.commit.total) - won;
  const bestCase = Math.max(0, pct(summary.bestCase.total) - won - commit);
  return { won, commit, bestCase };
}

export function opcionesTrimestre(day: string) {
  const year = Number(day.slice(0, 4));
  return [year - 1, year, year + 1].flatMap((year) =>
    [1, 2, 3, 4].map((n) => ({ period: `${year}-Q${n}`, n, year })),
  );
}
