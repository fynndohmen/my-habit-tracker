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

  /**
   * Zusatz für gefahrlosen Current-Reset (ohne Historie zu löschen):
   * - streakBarriers: Liste harter Grenzen (YYYY-MM-DD); beim Rückwärtszählen muss cursor > Barriere bleiben
   * - streakEpoch: inklusiver Start der *aktuellen* Serie (YYYY-MM-DD); cursor darf nicht kleiner sein
   */
  streakBarriers?: string[];
  streakEpoch?: string;
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
/**
 * Tages-Streaks (period='day'):
 * - minExclusive: harte Sperre (z. B. letzte Barriere: „> minExclusive“)
 * - minInclusive: Epoch (aktueller Serienstart) – zählt nur solange cursor >= minInclusive
 */
function computeDaily(
  allDays: string[],
  todayKey: string,
  minExclusive?: string,
  minInclusive?: string,
) {
  const days = Array.from(new Set(allDays)).sort(); // aufsteigend
  if (days.length === 0) {
    return { current: 0, histLongest: 0, lastFullDate: undefined as string | undefined };
  }

  // historisches Maximum (nur informativ)
  let histLongest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = (dayDiff(days[i], days[i - 1]) === 1) ? run + 1 : 1;
    if (run > histLongest) histLongest = run;
  }

  // aktueller Streak rückwärts ab heute – respektiert Sperren/Epoch
  let current = 0;
  const set = new Set(days);
  let cursor = todayKey;
  while (set.has(cursor)) {
    if (minExclusive && !(cursor > minExclusive)) break;
    if (minInclusive && cursor < minInclusive) break;

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

  // aktueller Streak: bis zur letzten vollen Woche (wenn diese Woche nicht voll ist)
  const thisWeek = weekKeyOf(todayKey);
  const start = ((byWeek.get(thisWeek) ?? 0) >= targetPerWeek) ? thisWeek : prevIsoWeek(thisWeek);

  let current = 0;
  let cursor = start;
  while ((byWeek.get(cursor) ?? 0) >= targetPerWeek) {
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

  // aktueller Streak: bis zum letzten vollen Monat (wenn dieser Monat nicht voll ist)
  const thisMonth = monthKeyOf(todayKey);
  const start = ((byMonth.get(thisMonth) ?? 0) >= targetPerMonth) ? thisMonth : prevMonthKey(thisMonth);

  let current = 0;
  let cursor = start;
  while ((byMonth.get(cursor) ?? 0) >= targetPerMonth) {
    current++;
    cursor = prevMonthKey(cursor);
  }

  const lastFullMonth = [...months].reverse().find(mk => (byMonth.get(mk) ?? 0) >= targetPerMonth);
  return { current, histLongest, lastFullMonth };
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
      streakBarriers: [],
      streakEpoch: undefined,
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

  /**
   * **Aktuelle Momentum-Tage** (für Farbe auf der Main-Seite).
   * Respektiert für daily die Barriere(n) *und* den Epoch-Start.
   */
  currentMomentumDays(id: string): number {
    const h = this._state$.value.find((x) => x.id === id);
    if (!h) return 0;
    const habit = this.normalize(h);
    const allDays = Array.from(new Set(habit.completedDays ?? [])).sort();
    if (!allDays.length) return 0;

    const today = dateKeyLocal();

    if (habit.period === 'day') {
      const set = new Set(allDays);
      if (!set.has(today)) return 0;

      const barrier = (habit.streakBarriers && habit.streakBarriers.length)
        ? habit.streakBarriers.reduce((a, b) => (a > b ? a : b))
        : undefined;

      const epoch = habit.streakEpoch;

      let run = 0;
      let cursor = today;
      while (set.has(cursor)) {
        if (barrier && !(cursor > barrier)) break;
        if (epoch && cursor < epoch) break;

        run++;
        const d = keyToDate(cursor);
        d.setDate(d.getDate() - 1);
        cursor = dateKeyLocal(d);
      }
      return run;
    }

    if (habit.period === 'week') {
      const target = Math.max(1, habit.target || 1);
      const byWeek = new Map<string, number>();
      for (const k of allDays) {
        const wk = weekKeyOf(k);
        byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
      }

      const todayWk = weekKeyOf(today);
      const cntThis = byWeek.get(todayWk) ?? 0;
      const isThisFull = cntThis >= target;

      const sumFullWeeksFrom = (startWk: string): number => {
        let days = 0, wk = startWk;
        while ((byWeek.get(wk) ?? 0) >= target) {
          days += byWeek.get(wk)!;
          wk = prevIsoWeek(wk);
        }
        return days;
      };

      if (isThisFull) return sumFullWeeksFrom(todayWk);
      if (cntThis > 0) {
        const prev = prevIsoWeek(todayWk);
        if ((byWeek.get(prev) ?? 0) >= target) {
          return sumFullWeeksFrom(prev) + cntThis;
        }
        return cntThis;
      }
      return 0;
    }

    // month
    if (habit.period === 'month') {
      const target = Math.max(1, habit.target || 1);
      const byMonth = new Map<string, number>();
      for (const k of allDays) {
        const mk = monthKeyOf(k);
        byMonth.set(mk, (byMonth.get(mk) ?? 0) + 1);
      }

      const thisMonth = monthKeyOf(today);
      const cntThis = byMonth.get(thisMonth) ?? 0;
      const isThisFull = cntThis >= target;

      const sumFullMonthsFrom = (startMk: string): number => {
        let days = 0, mk = startMk;
        while ((byMonth.get(mk) ?? 0) >= target) {
          days += byMonth.get(mk)!;
          mk = prevMonthKey(mk);
        }
        return days;
      };

      if (isThisFull) return sumFullMonthsFrom(thisMonth);
      if (cntThis > 0) {
        const prev = prevMonthKey(thisMonth);
        if ((byMonth.get(prev) ?? 0) >= target) {
          return sumFullMonthsFrom(prev) + cntThis;
        }
        return cntThis;
      }
      return 0;
    }

    return 0;
  }
  getCurrentMomentumDays(id: string): number { return this.currentMomentumDays(id); }

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

  /** ========== Reset-APIs ========== */

  /** Current Streak gezielt auf 0 setzen (ohne Longest zu verringern). */
  async resetCurrentStreak(id: string): Promise<void> {
    const today = dateKeyLocal();
    const yesterday = yesterdayKeyLocal();

    const next = this._state$.value.map(h => {
      if (h.id !== id) return h;
      let hh = this.normalize({ ...h });
      const prevLongest = hh.longestStreak;

      if (hh.period === 'day') {
        // 1) Heutigen DONE-Eintrag (falls vorhanden) entfernen -> heutiger Tick wird frei
        if (hh.completedDays.includes(today)) {
          hh.completedDays = hh.completedDays.filter(k => k !== today);
        }
        // 2) Aktuellen Zähler leeren
        hh.todayCount = 0;
        hh.lastFullCompleteDate = undefined;

        // 3) Grenzen für die *aktuelle* Serie setzen:
        //    - Barriere = gestern (verhindert Brücken in die alte Serie)
        const barriers = Array.isArray(hh.streakBarriers) ? hh.streakBarriers : [];
        if (!barriers.includes(yesterday)) barriers.push(yesterday);
        hh.streakBarriers = barriers;
        //    - Epoch = heute (nur zur Absicherung; sichtbares Verhalten: Current bleibt 0 bis erneut erledigt)
        hh.streakEpoch = today;

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
      hh.streakBarriers = [];
      hh.streakEpoch = undefined;
      if (resetStartToToday) hh.createdAt = nowIso();
      hh.updatedAt = nowIso();

      hh = this.recomputeDerived(hh);
      if (preserveLongest && hh.longestStreak < prevLongest) {
        hh.longestStreak = prevLongest;
      }
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
      streakBarriers: Array.isArray((h as any).streakBarriers) ? (h as any).streakBarriers : [],
      streakEpoch: (h as any).streakEpoch,
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
   * überschreiben longestStreak NICHT automatisch (damit „Reset Longest“ wirkt).
   */
  private recomputeDerived(h: Habit): Habit {
    const today = dateKeyLocal();

    if (h.period === 'day') {
      const barrier = (h.streakBarriers && h.streakBarriers.length)
        ? h.streakBarriers.reduce((a, b) => (a > b ? a : b))
        : undefined;

      const epoch = h.streakEpoch;

      const { current, /*histLongest,*/ lastFullDate } =
        computeDaily(h.completedDays, today, barrier, epoch);
      const newLongest = Math.max(h.longestStreak ?? 0, current);
      return {
        ...h,
        currentStreak: current,
        longestStreak: newLongest,
        lastFullCompleteDate: lastFullDate,
      };
    }

    if (h.period === 'week') {
      const { current, /*histLongest,*/ lastFullWeek } =
        computeWeekly(h.completedDays, h.target, today);
      const newLongest = Math.max(h.longestStreak ?? 0, current);
      return {
        ...h,
        currentStreak: current,
        longestStreak: newLongest,
        lastFullCompleteWeek: lastFullWeek,
      };
    }

    // month
    const { current, /*histLongest,*/ lastFullMonth } =
      computeMonthly(h.completedDays, h.target, today);
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

          streakBarriers: Array.isArray(h?.streakBarriers) ? h.streakBarriers : [],
          streakEpoch: h?.streakEpoch,
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
