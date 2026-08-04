/**
 * Watts — the city's currency, earned by writing, derived purely from the
 * vault. Nothing here is stored: reconnect the same vault anywhere and the
 * same balance re-derives. "Wrote that night" outweighs word count, word
 * watts are log-compressed with a daily cap — padding earns nothing.
 */

import type { NoteMetric } from "../city/layout";

const NIGHT_BONUS = 40;
const DAILY_WORD_CAP = 120;

export function wordWatts(words: number): number {
  return 24 * Math.log2(words / 60 + 1);
}

export function earnedWatts(metrics: NoteMetric[]): number {
  const byDay = new Map<string, number>();
  for (const m of metrics) {
    byDay.set(m.date, (byDay.get(m.date) ?? 0) + wordWatts(m.words));
  }
  let total = 0;
  for (const dayWords of byDay.values()) {
    total += NIGHT_BONUS + Math.min(DAILY_WORD_CAP, dayWords);
  }
  return Math.floor(total);
}

/** cost to go from level n to n+1 — early levels come fast, later ones slow */
export function levelCost(n: number): number {
  return Math.round(70 * n ** 1.6);
}

export function levelFromWatts(watts: number): number {
  let level = 1;
  let remaining = watts;
  while (level < 99) {
    const cost = levelCost(level);
    if (remaining < cost) break;
    remaining -= cost;
    level += 1;
  }
  return level;
}

/** the skyline height limit — levelling up lets the whole city grow */
export function skylineCap(level: number): number {
  return 4 + level * 2;
}

/* ---------- tonight's work orders — derived, never stored ---------- */

export type WorkOrder = { id: string; name: string; bonus: number; done: boolean };

export function workOrders(metrics: NoteMetric[], today: string): WorkOrder[] {
  const tonight = metrics.filter((m) => m.date === today);
  const words = tonight.reduce((s, m) => s + m.words, 0);
  return [
    { id: "write", name: "Write tonight", bonus: 20, done: tonight.length >= 1 },
    { id: "300", name: "Reach 300 words", bonus: 25, done: words >= 300 },
    { id: "second", name: "A second page", bonus: 25, done: tonight.length >= 2 },
  ];
}

export function orderBonus(metrics: NoteMetric[], today: string): number {
  return workOrders(metrics, today)
    .filter((o) => o.done)
    .reduce((s, o) => s + o.bonus, 0);
}

/** consecutive days written, ending today or yesterday — never punished */
export function streakOf(metrics: NoteMetric[], today: string): number {
  const days = new Set(metrics.map((m) => m.date));
  const DAY = 86400000;
  let t = new Date(today + "T00:00:00Z").getTime();
  if (!days.has(today)) t -= DAY; // last night still counts
  let streak = 0;
  while (streak < 3650) {
    const d = new Date(t);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    if (!days.has(key)) break;
    streak += 1;
    t -= DAY;
  }
  return streak;
}
