// mobile/src/app/habit.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { HabitNotification } from './services/notification.service'; // nur Typ importieren

export type Period = 'day' | 'week' | 'month';

export interface Habit {
  id: string;
  name: string;
  /** Ziel / Wiederholungen pro Zeitraum */
  target: number;

  /** Zeitraum (neu: 'day' | 'week' | 'month') */
  period: Period;

  /** Zähler für HEUTE (lokales Datum) – für 'day' genutzt; für andere Perioden kannst du bei Bedarf erweitern */
  todayCount: number;
  /** Letztes Datum, an dem der todayCount gezählt wurde (YYYY-MM-DD, lokal) */
  lastCountDate?: string;

  /** Datum (YYYY-MM-DD, lokal), an dem zuletzt ein Tag vollständig erfüllt wurde */
  lastFullCompleteDate?: string;

  /** Aktuelle Streak (aufeinanderfolgende Tage mit Vollerfüllung) */
  currentStreak: number;
  /** Längste Streak historisch */
  longestStreak: number;

  /** Neu: gespeicherte Reminder für dieses Habit */
  notifications: HabitNotification[];

  createdAt: string; // ISO
  updatedAt: string; // ISO
}

type Progress = { count: number; target: number; percent: number };

const STORAGE_KEY = 'mht_habits_v1';

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
function nowIso(): string {
  return new Date().toISOString();
}
function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return 'h_' + Math.random().toString(36).slice(2, 10);
}

@Injectable({ providedIn: 'root' })
export class HabitService {
  private readonly _state$ = new BehaviorSubject<Habit[]>(this.load());
  /** Öffentliche Liste aller Habits (reaktiv) */
  readonly habits$ = this._state$.asObservable();

  // ======= Öffentliche API, die von deinen Seiten genutzt wird =======

  /**
   * Deutsch: Neues Habit anlegen.
   * Rückgabe ist die neue ID (damit Add-Habit danach Notifications planen kann).
   */
  addHabit(name: string, repeats: number, period: Period = 'day', notifications: HabitNotification[] = []): string {
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
      notifications: notifications ?? [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const next = [...this.normalizeAll(this._state$.value), newHabit];
    this.commit(next);
    return id;
  }

  /** Erhöht die heutige Zählung um 1 (bis max. target). Erhöht Streak **einmal** wenn Ziel erreicht wurde. */
  complete(id: string): void {
    const today = dateKeyLocal();
    const yesterday = yesterdayKeyLocal();

    const next = this._state$.value.map((h) => {
      if (h.id !== id) return this.normalize(h);

      let habit = this.normalize(h);

      // Bereits voll? Dann keine Doppel-Erhöhung und keine zweite Streak-Erhöhung
      if (habit.todayCount >= habit.target) {
        return habit;
      }

      habit.todayCount = Math.min(habit.target, habit.todayCount + 1);
      habit.updatedAt = nowIso();

      // Gerade die Schwelle (== target) erreicht?
      if (habit.todayCount === habit.target) {
        if (habit.lastFullCompleteDate === today) {
          // Heute schon gezählt -> nichts tun
        } else if (habit.lastFullCompleteDate === yesterday) {
          habit.currentStreak += 1;
          habit.lastFullCompleteDate = today;
        } else {
          habit.currentStreak = 1;
          habit.lastFullCompleteDate = today;
        }
        habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);
      }

      return habit;
    });

    this.commit(next);
  }

  /** Deutsch: „Gestern erledigt“ explizit markieren (für deinen Dialog). */
  markYesterdayComplete(id: string): void {
    const today = dateKeyLocal();
    const yesterday = yesterdayKeyLocal();

    const next = this._state$.value.map((h) => {
      if (h.id !== id) return this.normalize(h);

      const habit = this.normalize({ ...h });

      // Nur Streak-Logik für „gestern“ setzen
      if (habit.lastFullCompleteDate === today) {
        // already counted today – nichts tun
        return habit;
      }

      if (habit.lastFullCompleteDate === yesterday) {
        // schon gestern gezählt
        return habit;
      }

      // „Gestern“ als erfüllt markieren + Streak fortsetzen/setzen
      if (habit.currentStreak > 0 && habit.lastFullCompleteDate) {
        // Wenn vorgestern erfüllt war, reiht sich gestern korrekt ein
        habit.currentStreak += 1;
      } else {
        habit.currentStreak = Math.max(1, habit.currentStreak);
      }
      habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);
      habit.lastFullCompleteDate = today; // wir „ziehen“ die Serie bis heute – optional anders gestalten
      habit.updatedAt = nowIso();

      return habit;
    });

    this.commit(next);
  }

  /** OPTIONAL: Zählt den heutigen Fortschritt runter (min 0). */
  undo(id: string): void {
    const today = dateKeyLocal();

    const next = this._state$.value.map((h) => {
      if (h.id !== id) return this.normalize(h);
      const habit = this.normalize({ ...h });

      if (habit.todayCount > 0) {
        if (habit.todayCount === habit.target && habit.lastFullCompleteDate === today) {
          habit.lastFullCompleteDate = undefined;
        }
        habit.todayCount -= 1;
        habit.updatedAt = nowIso();
      }
      return habit;
    });

    this.commit(next);
  }

  /** Entfernt ein Habit. */
  deleteHabit(id: string): void {
    const next = this._state$.value.filter((h) => h.id !== id);
    this.commit(next);
  }
  // Alias-Namen
  delete(id: string) { this.deleteHabit(id); }
  remove(id: string) { this.deleteHabit(id); }
  removeHabit(id: string) { this.deleteHabit(id); }

  /** Fortschritt für UI (count/target/percent 0..1) */
  progressFor(id: string): Progress | null {
    const habit = this._state$.value.find((h) => h.id === id);
    if (!habit) return null;
    const h = this.normalize(habit);
    const count = Math.max(0, Math.min(h.target, h.todayCount));
    const percent = Math.max(0, Math.min(1, count / Math.max(1, h.target)));
    return { count, target: h.target, percent };
  }

  currentStreak(id: string): number {
    const h = this._state$.value.find((x) => x.id === id);
    return h ? this.normalize(h).currentStreak : 0;
  }
  getCurrentStreak(id: string): number { return this.currentStreak(id); }

  longestStreak(id: string): number {
    const h = this._state$.value.find((x) => x.id === id);
    return h ? this.normalize(h).longestStreak : 0;
  }
  getLongestStreak(id: string): number { return this.longestStreak(id); }

  /** === Neu: Notifications lesen/schreiben === */

  /** Deutsch: synchrones Lookup (reicht für UI) */
  getHabitByIdSync(id: string): Habit | undefined {
    return this._state$.value.find(h => h.id === id);
  }

  /** Deutsch: async Variante (Kompatibilität) */
  async getHabitById(id: string): Promise<Habit | undefined> {
    return this.getHabitByIdSync(id);
  }

  /** Deutsch: Nur Notifications eines Habits aktualisieren (und speichern) */
  updateHabitNotifications(id: string, notifications: HabitNotification[]): void {
    const next = this._state$.value.map(h => {
      if (h.id !== id) return h;
      return {
        ...h,
        notifications: notifications ?? [],
        updatedAt: nowIso(),
      };
    });
    this.commit(next);
  }

  /** Deutsch: Ganzes Habit aktualisieren (falls du an anderer Stelle mehr änderst) */
  updateHabit(updated: Habit): void {
    const next = this._state$.value.map(h => h.id === updated.id ? { ...this.normalize(updated), updatedAt: nowIso() } : h);
    this.commit(next);
  }

  // ======= Interne Helfer =======

  /** Stellt sicher, dass der Tageszähler beim Datumssprung zurückgesetzt wird. */
  private normalize(h: Habit): Habit {
    const today = dateKeyLocal();

    if (h.lastCountDate && h.lastCountDate === today) {
      // stellt sicher, dass period/notifications immer existieren
      return {
        ...h,
        period: (h as any).period ?? 'day',
        notifications: Array.isArray((h as any).notifications) ? (h as any).notifications : [],
      };
    }

    // Datum hat gewechselt oder war noch nicht gesetzt -> Tageszähler zurücksetzen
    const next: Habit = {
      ...h,
      period: (h as any).period ?? 'day',
      notifications: Array.isArray((h as any).notifications) ? (h as any).notifications : [],
      todayCount: 0,
      lastCountDate: today,
      updatedAt: nowIso(),
    };
    return next;
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

  private commit(list: Habit[]): void {
    this._state$.next(list);
    this.save(list);
  }

  // ======= Persistenz (localStorage) =======

  private load(): Habit[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as any[];
      return (parsed ?? []).map((h) => ({
        id: h.id,
        name: h.name,
        target: Math.max(1, h?.target ?? h?.repeats ?? 1),
        period: (h?.period ?? 'day') as Period,
        todayCount: Math.max(0, h?.todayCount ?? 0),
        lastCountDate: h?.lastCountDate,
        lastFullCompleteDate: h?.lastFullCompleteDate,
        currentStreak: Math.max(0, h?.currentStreak ?? 0),
        longestStreak: Math.max(0, h?.longestStreak ?? 0),
        notifications: Array.isArray(h?.notifications) ? h.notifications : [],
        createdAt: h?.createdAt ?? nowIso(),
        updatedAt: h?.updatedAt ?? nowIso(),
      }));
    } catch {
      return [];
    }
  }

  private save(list: Habit[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignorieren (z. B. Speicher voll / privater Modus)
    }
  }
}
