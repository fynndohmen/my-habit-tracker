import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { HabitNotification } from './services/notification.service';

export type Period = 'day' | 'week' | 'month';

export interface Habit {
  id: string;
  name: string;
  /** Ziel / Wiederholungen pro Zeitraum (z. B. 3/Tag oder 3/Woche) */
  target: number;
  period: Period;

  /** Zähler im aktuellen Zeitraum */
  todayCount: number;
  /** Letztes Datum (YYYY-MM-DD, lokal), an dem todayCount gezählt wurde */
  lastCountDate?: string;

  /** Letztes Datum (YYYY-MM-DD), an dem ein TAG vollständig war (nur für period='day' relevant) */
  lastFullCompleteDate?: string;

  /** Persistierte Streakwerte */
  currentStreak: number;
  longestStreak: number;

  /** Für Timeline & Streak-Berechnungen: Liste *abgeschlossener Kalendertage* (YYYY-MM-DD). */
  completedDays: string[];

  /** Notifications pro Habit */
  notifications: HabitNotification[];

  createdAt: string; // ISO
  updatedAt: string; // ISO

  /** Optional: Marker für Wochen/Monat-Streaks */
  lastFullCompleteWeek?: string;   // z. B. '2025-W42'
  lastFullCompleteMonth?: string;  // z. B. '2025-10'
}

/** UI-Progress */
type Progress = { count: number; target: number; percent: number };

const STORAGE_KEY = 'mht_habits_v1';

// ====== Date/Key helpers (lokal) ======
function dateKeyLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function yesterdayKeyLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKeyLocal(d);
}
function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}
/** ISO-Week (Mo–So), Ergebnis wie 'YYYY-Www' */
function weekKeyOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  // ISO week: Thursday-based week number
  const thursday = new Date(dt.getTime());
  thursday.setDate(dt.getDate() + (4 - ((dt.getDay() + 6) % 7)));
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((+thursday - +yearStart) / 86400000 + 1) / 7);
  const wy = thursday.getFullYear();
  return `${wy}-W${String(weekNo).padStart(2, '0')}`;
}
function nowIso(): string { return new Date().toISOString(); }
function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return 'h_' + Math.random().toString(36).slice(2, 10);
}
function keyToDate(key: string): Date { return new Date(key + 'T00:00:00'); }
function dayDiff(aKey: string, bKey: string): number {
  return Math.round((+keyToDate(aKey) - +keyToDate(bKey)) / 86400000);
}

// ====== Streak-Berechnungen aus completedDays ======
/** Tages-Streaks (period='day'): aufeinanderfolgende Kalendertage */
function computeDaily(allDays: string[], todayKey: string) {
  const days = Array.from(new Set(allDays)).sort(); // aufsteigend
  if (days.length === 0) {
    return { current: 0, histLongest: 0, lastFullDate: undefined as string | undefined };
  }

  // historisches Maximum (nur informativ – nicht mehr zum Überschreiben genutzt)
  let histLongest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = (dayDiff(days[i], days[i - 1]) === 1) ? run + 1 : 1;
    if (run > histLongest) histLongest = run;
  }

  // aktueller Streak rückwärts ab heute
  let current = 0;
  const set = new Set(days);
  let cursor = todayKey;
  while (set.has(cursor)) {
    current++;
    const d = keyToDate(cursor);
    d.setDate(d.getDate() - 1);
    cursor = dateKeyLocal(d);
  }
  const lastFullDate = days[days.length - 1];
  return { current, histLongest, lastFullDate };
}

/** Wochen-Streaks (period='week'): aufeinanderfolgende *volle* Wochen (count ≥ target) */
function nextIsoWeek(wk: string): string {
  const [yStr, wStr] = wk.split('-W');
  const y = parseInt(yStr, 10);
  const w = parseInt(wStr, 10);
  const date = isoWeekToDate(y, w);
  date.setDate(date.getDate() + 7);
  return weekKeyOf(dateKeyLocal(date));
}
function prevIsoWeek(wk: string): string {
  const [yStr, wStr] = wk.split('-W');
  const y = parseInt(yStr, 10);
  const w = parseInt(wStr, 10);
  const date = isoWeekToDate(y, w);
  date.setDate(date.getDate() - 7);
  return weekKeyOf(dateKeyLocal(date));
}
function isoWeekToDate(year: number, week: number): Date {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = (simple.getDay() + 6) % 7; // 0=Mo
  simple.setDate(simple.getDate() - dow + 3); // Donnerstag
  return simple;
}
function computeWeekly(allDays: string[], targetPerWeek: number, todayKey: string) {
  if (!allDays?.length) return { current: 0, histLongest: 0, lastFullWeek: undefined as string | undefined };

  const byWeek = new Map<string, number>();
  for (const k of allDays) {
    const wk = weekKeyOf(k);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
  }
  const weeks = Array.from(byWeek.keys()).sort();

  // historischer längster Block an *vollen* Wochen
  let histLongest = 0, run = 0;
  let prev: string | null = null;
  for (const wk of weeks) {
    const isFull = (byWeek.get(wk)! >= targetPerWeek);
    if (!prev) {
      run = isFull ? 1 : 0;
    } else {
      const isConsecutive = nextIsoWeek(prev) === wk;
      if (isFull) run = isConsecutive ? (run + 1) : 1;
      else run = isConsecutive ? 0 : 0;
    }
    if (run > histLongest) histLongest = run;
    prev = wk;
  }

  // aktueller Streak:
  // ALT: ab *aktueller* Woche rückwärts, nur solange Wochen voll sind (führte zu 0, wenn aktuelle Woche nicht voll war).
  // NEU: wenn aktuelle Woche nicht voll ist, starte bei der *letzten vollen* Woche davor.
  const thisWeek = weekKeyOf(todayKey);
  const isFullWk = (wk: string) => (byWeek.get(wk) ?? 0) >= Math.max(1, targetPerWeek || 1);

  let current = 0;
  let cursor = thisWeek;
  if (!isFullWk(cursor)) {
    cursor = prevIsoWeek(cursor); // zur letzten abgeschlossenen vollen Woche springen
  }
  while (isFullWk(cursor)) {
    current++;
    cursor = prevIsoWeek(cursor);
  }

  const lastFullWeek = [...weeks].reverse().find(wk => (byWeek.get(wk) ?? 0) >= targetPerWeek);
  return { current, histLongest, lastFullWeek };
}

/** Monats-Streaks analog */
function nextMonthKey(mk: string): string {
  let [y, m] = mk.split('-').map((x) => parseInt(x, 10));
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
function prevMonthKey(mk: string): string {
  let [y, m] = mk.split('-').map((x) => parseInt(x, 10));
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
function computeMonthly(allDays: string[], targetPerMonth: number, todayKey: string) {
  if (!allDays?.length) return { current: 0, histLongest: 0, lastFullMonth: undefined as string | undefined };

  const byMonth = new Map<string, number>();
  for (const k of allDays) {
    const mk = monthKeyOf(k);
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + 1);
  }
  const months = Array.from(byMonth.keys()).sort();

  let histLongest = 0, run = 0;
  let prev: string | null = null;
  for (const mk of months) {
    const isFull = (byMonth.get(mk)! >= targetPerMonth);
    if (!prev) run = isFull ? 1 : 0;
    else {
      const isConsecutive = nextMonthKey(prev) === mk;
      if (isFull) run = isConsecutive ? (run + 1) : 1;
      else run = isConsecutive ? 0 : 0;
    }
    if (run > histLongest) histLongest = run;
    prev = mk;
  }

  // aktueller Streak (analog zur Woche):
  const thisMonth = monthKeyOf(todayKey);
  const isFullM = (mk: string) => (byMonth.get(mk) ?? 0) >= Math.max(1, targetPerMonth || 1);

  let current = 0;
  let cursor = thisMonth;
  if (!isFullM(cursor)) {
    cursor = prevMonthKey(cursor); // auf letzten vollen Monat springen
  }
  while (isFullM(cursor)) {
    current++;
    cursor = prevMonthKey(cursor);
  }

  const lastFullMonth = [...months].reverse().find(mk => (byMonth.get(mk) ?? 0) >= targetPerMonth);
  return { current, histLongest, lastFullMonth };
}

/* =======================
   NEU: Momentum-Tage (Farblogik)
   ======================= */

/** Daily: Momentum-Tage = Streak-Länge in Tagen (current / max). */
function computeMomentumDailyDays(allDays: string[], todayKey: string) {
  const { current, histLongest } = computeDaily(allDays, todayKey);
  return { currentDays: current, longestDays: histLongest };
}

/** Weekly: Momentum-Tage = Summe der Tage in aufeinanderfolgenden *vollen* Wochen;
 *  für *current* werden Tage der *aktuellen* (noch nicht vollen) Woche angehängt.
 *  Für *longest* wird außerdem „Block + direkt folgende unvollständige Woche mit Tagen“ geprüft.
 */
function computeMomentumWeeklyDays(allDays: string[], targetPerWeek: number, todayKey: string) {
  const byWeek = new Map<string, number>();
  for (const k of allDays) {
    const wk = weekKeyOf(k);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
  }
  if (byWeek.size === 0) return { currentDays: 0, longestDays: 0 };

  const isFull = (wk: string) => (byWeek.get(wk) ?? 0) >= Math.max(1, targetPerWeek || 1);

  // chronologische Wochen von erstem bis letztem Datum
  const sortedDays = Array.from(new Set(allDays)).sort();
  const firstWk = weekKeyOf(sortedDays[0]);
  const lastWk = weekKeyOf(sortedDays[sortedDays.length - 1]);

  const weeks: string[] = [];
  {
    let wk = firstWk;
    while (true) {
      weeks.push(wk);
      if (wk === lastWk) break;
      wk = nextIsoWeek(wk);
    }
  }

  // Blöcke voller Wochen
  type Block = { weeks: string[]; totalDays: number };
  const blocks: Block[] = [];
  let cur: string[] = [];
  for (const wk of weeks) {
    if (isFull(wk)) {
      cur.push(wk);
    } else {
      if (cur.length) {
        blocks.push({ weeks: [...cur], totalDays: [...cur].reduce((s, w) => s + (byWeek.get(w) ?? 0), 0) });
        cur = [];
      }
    }
  }
  if (cur.length) {
    blocks.push({ weeks: [...cur], totalDays: [...cur].reduce((s, w) => s + (byWeek.get(w) ?? 0), 0) });
  }

  const thisWk = weekKeyOf(todayKey);
  const cntThis = byWeek.get(thisWk) ?? 0;

  // currentDays
  let currentDays = 0;
  if (isFull(thisWk)) {
    const blk = blocks.find(b => b.weeks.includes(thisWk));
    currentDays = blk ? blk.totalDays : 0;
  } else if (cntThis > 0) {
    // ggf. an letzten vollen Block anhängen
    const prevWk = prevIsoWeek(thisWk);
    const blk = blocks.find(b => b.weeks[b.weeks.length - 1] === prevWk);
    currentDays = (blk?.totalDays ?? 0) + cntThis;
  } else {
    currentDays = 0;
  }

  // longestDays = max(block.totalDays) und „Block + direkt folgende unvollständige Woche mit Tagen“
  let longestDays = 0;
  for (const b of blocks) {
    if (b.totalDays > longestDays) longestDays = b.totalDays;
    const nextWk = nextIsoWeek(b.weeks[b.weeks.length - 1]);
    const cntNext = byWeek.get(nextWk) ?? 0;
    if (!isFull(nextWk) && cntNext > 0) {
      const withPartial = b.totalDays + cntNext;
      if (withPartial > longestDays) longestDays = withPartial;
    }
  }

  return { currentDays, longestDays };
}

/** Monthly analog zu Weekly. */
function computeMomentumMonthlyDays(allDays: string[], targetPerMonth: number, todayKey: string) {
  const byMonth = new Map<string, number>();
  for (const k of allDays) {
    const mk = monthKeyOf(k);
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + 1);
  }
  if (byMonth.size === 0) return { currentDays: 0, longestDays: 0 };

  const isFull = (mk: string) => (byMonth.get(mk) ?? 0) >= Math.max(1, targetPerMonth || 1);

  const sortedDays = Array.from(new Set(allDays)).sort();
  const firstMk = monthKeyOf(sortedDays[0]);
  const lastMk  = monthKeyOf(sortedDays[sortedDays.length - 1]);

  const months: string[] = [];
  {
    let mk = firstMk;
    while (true) {
      months.push(mk);
      if (mk === lastMk) break;
      mk = nextMonthKey(mk);
    }
  }

  type Block = { months: string[]; totalDays: number };
  const blocks: Block[] = [];
  let cur: string[] = [];
  for (const mk of months) {
    if (isFull(mk)) cur.push(mk);
    else {
      if (cur.length) {
        blocks.push({ months: [...cur], totalDays: [...cur].reduce((s, m) => s + (byMonth.get(m) ?? 0), 0) });
        cur = [];
      }
    }
  }
  if (cur.length) {
    blocks.push({ months: [...cur], totalDays: [...cur].reduce((s, m) => s + (byMonth.get(m) ?? 0), 0) });
  }

  const thisMk = monthKeyOf(todayKey);
  const cntThis = byMonth.get(thisMk) ?? 0;

  let currentDays = 0;
  if (isFull(thisMk)) {
    const blk = blocks.find(b => b.months.includes(thisMk));
    currentDays = blk ? blk.totalDays : 0;
  } else if (cntThis > 0) {
    const prevMk = prevMonthKey(thisMk);
    const blk = blocks.find(b => b.months[b.months.length - 1] === prevMk);
    currentDays = (blk?.totalDays ?? 0) + cntThis;
  } else {
    currentDays = 0;
  }

  let longestDays = 0;
  for (const b of blocks) {
    if (b.totalDays > longestDays) longestDays = b.totalDays;
    const nextMk = nextMonthKey(b.months[b.months.length - 1]);
    const cntNext = byMonth.get(nextMk) ?? 0;
    if (!isFull(nextMk) && cntNext > 0) {
      const withPartial = b.totalDays + cntNext;
      if (withPartial > longestDays) longestDays = withPartial;
    }
  }

  return { currentDays, longestDays };
}

@Injectable({ providedIn: 'root' })
export class HabitService {
  private readonly _state$ = new BehaviorSubject<Habit[]>(this.load());
  /** Öffentliche Liste aller Habits (reaktiv) */
  readonly habits$ = this._state$.asObservable();

  // ======= Öffentliche API =======

  addHabit(
    name: string,
    repeats: number,
    period: Period = 'day',
    notifications: HabitNotification[] = []
  ): string {
    const target = Math.max(1, Math.floor(repeats || 1));
    const today = dateKeyLocal();
    const id = uid();

    const newHabit: Habit = {
      id,
      name: name.trim(),
      target,
      period,
      todayCount: 0,
      lastCountDate: today,
      lastFullCompleteDate: undefined,
      currentStreak: 0,
      longestStreak: 0,
      completedDays: [],
      notifications: notifications ?? [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const next = [...this.normalizeAll(this._state$.value), newHabit];
    const withDerived = next.map(h => this.recomputeDerived(h));
    this.commit(withDerived);
    return id;
  }

  /** Tages-/Wochen-/Monats-"Check-in" */
  complete(id: string): void {
    const today = dateKeyLocal();

    const next = this._state$.value.map((h) => {
      if (h.id !== id) return this.normalize(h);
      let habit = this.normalize({ ...h });

      if (habit.period === 'day') {
        if (habit.todayCount >= habit.target) return this.recomputeDerived(habit);
        habit.todayCount = Math.min(habit.target, habit.todayCount + 1);
        if (habit.todayCount === habit.target) {
          if (!habit.completedDays.includes(today)) {
            habit.completedDays = [...habit.completedDays, today];
          }
          habit.lastFullCompleteDate = today;
        }
        habit.updatedAt = nowIso();
        return this.recomputeDerived(habit);
      }

      if (habit.period === 'week') {
        if (!habit.completedDays.includes(today)) {
          habit.completedDays = [...habit.completedDays, today];
        }
        const wk = weekKeyOf(today);
        habit.todayCount = habit.completedDays.filter(d => weekKeyOf(d) === wk).length;
        habit.updatedAt = nowIso();
        return this.recomputeDerived(habit);
      }

      // month
      if (!habit.completedDays.includes(today)) {
        habit.completedDays = [...habit.completedDays, today];
      }
      const mk = monthKeyOf(today);
      habit.todayCount = habit.completedDays.filter(d => monthKeyOf(d) === mk).length;
      habit.updatedAt = nowIso();
      return this.recomputeDerived(habit);
    });

    this.commit(next);
  }

  /** „Gestern erledigt“ – trägt den Tag in die Historie ein (daily & weekly sinnvoll). */
  markYesterdayComplete(id: string): void {
    const yesterday = yesterdayKeyLocal();

    const next = this._state$.value.map((h) => {
      if (h.id !== id) return this.normalize(h);
      let habit = this.normalize({ ...h });

      if (!habit.completedDays.includes(yesterday)) {
        habit.completedDays = [...habit.completedDays, yesterday];
      }

      const today = dateKeyLocal();
      if (habit.period === 'week') {
        const wk = weekKeyOf(today);
        habit.todayCount = habit.completedDays.filter(d => weekKeyOf(d) === wk).length;
      } else if (habit.period === 'month') {
        const mk = monthKeyOf(today);
        habit.todayCount = habit.completedDays.filter(d => monthKeyOf(d) === mk).length;
      }

      habit.updatedAt = nowIso();
      return this.recomputeDerived(habit);
    });

    this.commit(next);
  }

  /** OPTIONAL: „Undo“ heutiger Eintrag */
  undo(id: string): void {
    const today = dateKeyLocal();

    const next = this._state$.value.map((h) => {
      if (h.id !== id) return this.normalize(h);
      let habit = this.normalize({ ...h });

      if (habit.period === 'day') {
        if (habit.todayCount > 0) {
          if (habit.todayCount === habit.target && habit.lastFullCompleteDate === today) {
            habit.completedDays = habit.completedDays.filter(k => k !== today);
            habit.lastFullCompleteDate = undefined;
          }
          habit.todayCount -= 1;
          habit.updatedAt = nowIso();
        }
      } else if (habit.period === 'week') {
        if (habit.completedDays.includes(today)) {
          habit.completedDays = habit.completedDays.filter(k => k !== today);
        }
        const wk = weekKeyOf(today);
        habit.todayCount = habit.completedDays.filter(d => weekKeyOf(d) === wk).length;
        habit.updatedAt = nowIso();
      } else if (habit.period === 'month') {
        if (habit.completedDays.includes(today)) {
          habit.completedDays = habit.completedDays.filter(k => k !== today);
        }
        const mk = monthKeyOf(today);
        habit.todayCount = habit.completedDays.filter(d => monthKeyOf(d) === mk).length;
        habit.updatedAt = nowIso();
      }

      return this.recomputeDerived(habit);
    });

    this.commit(next);
  }

  /** Entfernt ein Habit. */
  deleteHabit(id: string): void {
    const next = this._state$.value.filter((h) => h.id !== id);
    this.commit(next);
  }
  // Aliase
  delete(id: string) { this.deleteHabit(id); }
  remove(id: string) { this.deleteHabit(id); }
  removeHabit(id: string) { this.deleteHabit(id); }

  /** Fortschritt für UI */
  progressFor(id: string): Progress | null {
    const h = this._state$.value.find((x) => x.id === id);
    if (!h) return null;

    const habit = this.normalize(h);

    if (habit.period === 'day') {
      const count = Math.max(0, Math.min(habit.target, habit.todayCount));
      const percent = Math.max(0, Math.min(1, count / Math.max(1, habit.target)));
      return { count, target: habit.target, percent };
    }

    if (habit.period === 'week') {
      const wk = weekKeyOf(dateKeyLocal());
      const count = habit.completedDays.filter(d => weekKeyOf(d) === wk).length;
      const clipped = Math.max(0, Math.min(habit.target, count));
      const percent = Math.max(0, Math.min(1, clipped / Math.max(1, habit.target)));
      return { count: clipped, target: habit.target, percent };
    }

    // month
    const mk = monthKeyOf(dateKeyLocal());
    const count = habit.completedDays.filter(d => monthKeyOf(d) === mk).length;
    const clipped = Math.max(0, Math.min(habit.target, count));
    const percent = Math.max(0, Math.min(1, clipped / Math.max(1, habit.target)));
    return { count: clipped, target: habit.target, percent };
  }

  // ===== Momentum-APIs (NEU) =====
  /** Momentum-Tage der *aktuellen* Serie – für Farbgebung von Current (alle Perioden). */
  currentMomentumDays(id: string): number {
    const h = this._state$.value.find(x => x.id === id);
    if (!h) return 0;
    const today = dateKeyLocal();
    const all = Array.from(new Set(h.completedDays)).sort();

    if (h.period === 'day') {
      return computeMomentumDailyDays(all, today).currentDays;
    }
    if (h.period === 'week') {
      return computeMomentumWeeklyDays(all, h.target, today).currentDays;
    }
    // month
    return computeMomentumMonthlyDays(all, h.target, today).currentDays;
  }

  /** Höchste jemals erreichte Momentum-Tage – für Farbgebung von Longest (alle Perioden). */
  longestMomentumDays(id: string): number {
    const h = this._state$.value.find(x => x.id === id);
    if (!h) return 0;
    const today = dateKeyLocal();
    const all = Array.from(new Set(h.completedDays)).sort();

    if (h.period === 'day') {
      return computeMomentumDailyDays(all, today).longestDays;
    }
    if (h.period === 'week') {
      return computeMomentumWeeklyDays(all, h.target, today).longestDays;
    }
    // month
    return computeMomentumMonthlyDays(all, h.target, today).longestDays;
  }

  // Public getters
  currentStreak(id: string): number {
    const h = this._state$.value.find((x) => x.id === id);
    if (!h) return 0;
    const hh = this.recomputeDerived(this.normalize(h));
    return hh.currentStreak;
  }
  getCurrentStreak(id: string): number { return this.currentStreak(id); }

  longestStreak(id: string): number {
    const h = this._state$.value.find((x) => x.id === id);
    if (!h) return 0;
    const hh = this.recomputeDerived(this.normalize(h));
    return hh.longestStreak;
  }
  getLongestStreak(id: string): number { return this.longestStreak(id); }

  // === Notifications ===
  getHabitByIdSync(id: string): Habit | undefined {
    return this._state$.value.find(h => h.id === id);
  }
  async getHabitById(id: string): Promise<Habit | undefined> {
    return this.getHabitByIdSync(id);
  }
  updateHabitNotifications(id: string, notifications: HabitNotification[]): void {
    const next = this._state$.value.map(h => {
      if (h.id !== id) return h;
      return this.recomputeDerived({
        ...h,
        notifications: notifications ?? [],
        updatedAt: nowIso(),
      });
    });
    this.commit(next);
  }

  /** Ganzes Habit aktualisieren */
  updateHabit(updated: Habit): void {
    const next = this._state$.value.map(h =>
      h.id === updated.id ? this.recomputeDerived({ ...this.normalize(updated), updatedAt: nowIso() }) : h
    );
    this.commit(next);
  }

  /** ========== Voll-Reset: alles löschen, heute frei lassen ========== */
  async resetHabitCompletely(id: string): Promise<void> {
    const today = dateKeyLocal();
    const next = this._state$.value.map(h => {
      if (h.id !== id) return h;
      const cleared: Habit = {
        ...h,
        completedDays: [],              // gesamte Timeline leer
        todayCount: 0,                  // aktueller Zeitraum leer
        lastCountDate: today,           // Zeitraum startet neu (Tag/Woche/Monat wird beim Rendern als „frei“ gezeigt)
        lastFullCompleteDate: undefined,
        currentStreak: 0,
        longestStreak: 0,
        lastFullCompleteWeek: undefined,
        lastFullCompleteMonth: undefined,
        createdAt: nowIso(),            // Sichtfenster startet „heute“
        updatedAt: nowIso(),
      };
      return this.recomputeDerived(cleared);
    });
    this.commit(next);
  }

  /** ========== Reset-APIs (bestehend) ========== */

  /** Current Streak gezielt auf 0 setzen (ohne Longest zu verringern). */
  async resetCurrentStreak(id: string): Promise<void> {
    const today = dateKeyLocal();

    const next = this._state$.value.map(h => {
      if (h.id !== id) return h;
      let hh = this.normalize({ ...h });
      const prevLongest = hh.longestStreak;

      if (hh.period === 'day') {
        // „heute“ rausnehmen → current=0
        hh.completedDays = hh.completedDays.filter(k => k !== today);
        hh.todayCount = 0;
        hh.lastFullCompleteDate = undefined;
      } else if (hh.period === 'week') {
        const wk = weekKeyOf(today);
        const inWeek = hh.completedDays.filter(d => weekKeyOf(d) === wk).sort();
        const needBelow = hh.target - 1;
        const count = inWeek.length;
        if (count > needBelow) {
          const toRemove = count - needBelow;
          const removeSet = new Set(inWeek.slice(-toRemove));
          hh.completedDays = hh.completedDays.filter(d => !(weekKeyOf(d) === wk && removeSet.has(d)));
        }
        hh.todayCount = Math.min(hh.target - 1, Math.max(0, hh.completedDays.filter(d => weekKeyOf(d) === wk).length));
      } else if (hh.period === 'month') {
        const mk = monthKeyOf(today);
        const inMonth = hh.completedDays.filter(d => monthKeyOf(d) === mk).sort();
        const needBelow = hh.target - 1;
        const count = inMonth.length;
        if (count > needBelow) {
          const toRemove = count - needBelow;
          const removeSet = new Set(inMonth.slice(-toRemove));
          hh.completedDays = hh.completedDays.filter(d => !(monthKeyOf(d) === mk && removeSet.has(d)));
        }
        hh.todayCount = Math.min(hh.target - 1, Math.max(0, hh.completedDays.filter(d => monthKeyOf(d) === mk).length));
      }

      hh.updatedAt = nowIso();
      hh = this.recomputeDerived(hh);
      // Longest nie kleiner machen
      if (hh.longestStreak < prevLongest) hh.longestStreak = prevLongest;
      return hh;
    });

    this.commit(next);
  }

  /** Longest explizit auf aktuellen Current setzen (Historie bleibt). */
  async resetLongestStreak(id: string): Promise<void> {
    const next = this._state$.value.map(h => {
      if (h.id !== id) return h;
      let hh = this.recomputeDerived(this.normalize({ ...h }));
      const current = hh.currentStreak;
      hh.longestStreak = current; // explizites Setzen
      hh.updatedAt = nowIso();
      return hh;
    });
    this.commit(next);
  }

  /**
   * Timeline komplett leeren. Optional Longest behalten (Default=true).
   * Setzt current immer auf 0 und (optional) start „neu“ durch createdAt=now.
   */
  async resetTimelineData(id: string, preserveLongest = true, resetStartToToday = true): Promise<void> {
    const today = dateKeyLocal();
    const next = this._state$.value.map(h => {
      if (h.id !== id) return h;
      let hh: Habit = this.normalize({ ...h });
      const prevLongest = hh.longestStreak;

      hh.completedDays = [];
      hh.todayCount = 0;
      hh.lastCountDate = today;
      hh.lastFullCompleteDate = undefined;
      if (resetStartToToday) hh.createdAt = nowIso();
      hh.updatedAt = nowIso();

      hh = this.recomputeDerived(hh);
      // Longest behalten, wenn gewünscht
      if (preserveLongest && hh.longestStreak < prevLongest) {
        hh.longestStreak = prevLongest;
      }
      // Current nach Timeline-Reset = 0
      hh.currentStreak = 0;
      return hh;
    });
    this.commit(next);
  }

  // ======= Interne Helfer =======

  /** Stellt sicher, dass der Zähler beim Periodenwechsel zurückgesetzt wird. */
  private normalize(h: Habit): Habit {
    const today = dateKeyLocal();
    const safe: Habit = {
      ...h,
      period: (h as any).period ?? 'day',
      target: Math.max(1, Math.floor(h.target || 1)),
      notifications: Array.isArray((h as any).notifications) ? h.notifications : [],
      completedDays: Array.isArray((h as any).completedDays) ? h.completedDays : [],
    };

    if (!safe.lastCountDate) {
      return { ...safe, lastCountDate: today };
    }

    const last = safe.lastCountDate;
    let sameInterval = true;

    if (safe.period === 'day') {
      sameInterval = (last === today);
    } else if (safe.period === 'week') {
      sameInterval = (weekKeyOf(last) === weekKeyOf(today));
    } else if (safe.period === 'month') {
      sameInterval = (monthKeyOf(last) === monthKeyOf(today));
    }

    if (sameInterval) {
      return safe;
    }

    return {
      ...safe,
      todayCount: 0,
      lastCountDate: today,
      updatedAt: nowIso(),
    };
  }

  private normalizeAll(list: Habit[]): Habit[] {
    let changed = false;
    const normalized = list.map((h) => {
      const n = this.normalize(h);
      if (n !== h) changed = true;
      return n;
    });
    if (changed) this.commit(normalized);
    return normalized;
  }

  /**
   * Leite current/Marker neu ab.
   * WICHTIG: longestStreak ist ein persistierter Rekord und wird **nur erhöht**,
   * wenn der aktuelle Streak ihn übertrifft. Historische Maxima aus completedDays
   * überschreiben longestStreak NICHT mehr automatisch (damit „Reset Longest“ wirkt).
   */
  private recomputeDerived(h: Habit): Habit {
    const today = dateKeyLocal();

    if (h.period === 'day') {
      const { current, /*histLongest,*/ lastFullDate } = computeDaily(h.completedDays, today);
      const newLongest = Math.max(h.longestStreak ?? 0, current);
      return {
        ...h,
        currentStreak: current,
        longestStreak: newLongest,
        lastFullCompleteDate: lastFullDate,
      };
    }

    if (h.period === 'week') {
      const { current, /*histLongest,*/ lastFullWeek } = computeWeekly(h.completedDays, h.target, today);
      const newLongest = Math.max(h.longestStreak ?? 0, current);
      return {
        ...h,
        currentStreak: current,
        longestStreak: newLongest,
        lastFullCompleteWeek: lastFullWeek,
      };
    }

    // month
    const { current, /*histLongest,*/ lastFullMonth } = computeMonthly(h.completedDays, h.target, today);
    const newLongest = Math.max(h.longestStreak ?? 0, current);
    return {
      ...h,
      currentStreak: current,
      longestStreak: newLongest,
      lastFullCompleteMonth: lastFullMonth,
    };
  }

  private commit(list: Habit[]): void {
    this._state$.next(list);
    this.save(list);
  }

  // ======= Persistenz =======

  private load(): Habit[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as any[];
      const list: Habit[] = (parsed ?? []).map((h) => {
        const created = h?.createdAt ? new Date(h.createdAt).toISOString() : nowIso();
        const updated = h?.updatedAt ? new Date(h.updatedAt).toISOString() : nowIso();
        const lastCount = h?.lastCountDate || dateKeyLocal();

        const out: Habit = {
          id: h.id,
          name: h.name,
          target: Math.max(1, h?.target ?? h?.repeats ?? 1),
          period: (h?.period ?? 'day') as Period,

          todayCount: Math.max(0, h?.todayCount ?? 0),
          lastCountDate: lastCount,

          lastFullCompleteDate: h?.lastFullCompleteDate,
          currentStreak: Math.max(0, h?.currentStreak ?? 0),
          longestStreak: Math.max(0, h?.longestStreak ?? 0),

          completedDays: Array.isArray(h?.completedDays) ? h.completedDays : [],

          notifications: Array.isArray(h?.notifications) ? h.notifications : [],

          createdAt: created,
          updatedAt: updated,

          lastFullCompleteWeek: h?.lastFullCompleteWeek,
          lastFullCompleteMonth: h?.lastFullCompleteMonth,
        };
        return out;
      });

      // Normalisieren + Ableitungen frisch berechnen
      const normalized = list.map(h => this.normalize(h)).map(h => this.recomputeDerived(h));
      // Beim Laden gleich speichern, falls Migration etwas geändert hat
      this.save(normalized);
      return normalized;
    } catch {
      return [];
    }
  }

  private save(list: Habit[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // z. B. Speicher voll / privater Modus – ignorieren
    }
  }
}
