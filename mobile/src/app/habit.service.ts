import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { HabitNotification } from './services/notification.service';

export type Period = 'day' | 'week' | 'month';

export interface Habit {
  id: string;
  name: string;
  target: number;
  period: Period;
  todayCount: number;
  lastCountDate?: string;
  lastFullCompleteDate?: string;
  currentStreak: number;
  longestStreak: number;
  notifications: HabitNotification[];
  completedDays?: string[]; // 'YYYY-MM-DD'
  createdAt: string;
  updatedAt: string;
}

type Progress = { count: number; target: number; percent: number };

const STORAGE_KEY = 'mht_habits_v1';

function dateKeyLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function yesterdayKeyLocal(): string { const d = new Date(); d.setDate(d.getDate() - 1); return dateKeyLocal(d); }
function nowIso(): string { return new Date().toISOString(); }
function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  return 'h_' + Math.random().toString(36).slice(2, 10);
}

@Injectable({ providedIn: 'root' })
export class HabitService {
  private readonly _state$ = new BehaviorSubject<Habit[]>(this.load());
  readonly habits$ = this._state$.asObservable();

  // ===== API =====

  addHabit(name: string, repeats: number, period: Period = 'day', notifications: HabitNotification[] = []): string {
    const target = Math.max(1, Math.floor(repeats || 1));
    const id = uid();
    const today = dateKeyLocal();
    const newHabit: Habit = {
      id, name: name.trim(), target, period,
      todayCount: 0, lastCountDate: today,
      lastFullCompleteDate: undefined,
      currentStreak: 0, longestStreak: 0,
      notifications: notifications ?? [],
      completedDays: [],
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    const next = [...this.normalizeAll(this._state$.value), newHabit];
    this.commit(next);
    return id;
  }

  complete(id: string): void {
    const today = dateKeyLocal();
    const yesterday = yesterdayKeyLocal();

    const next = this._state$.value.map(h => {
      if (h.id !== id) return this.normalize(h);
      const habit = this.normalize({ ...h });

      if (habit.todayCount >= habit.target) return habit;

      habit.todayCount = Math.min(habit.target, habit.todayCount + 1);
      habit.updatedAt = nowIso();

      if (habit.todayCount === habit.target) {
        if (habit.lastFullCompleteDate === today) {
          // schon gezählt
        } else if (habit.lastFullCompleteDate === yesterday) {
          habit.currentStreak += 1;
          habit.lastFullCompleteDate = today;
        } else {
          habit.currentStreak = 1;
          habit.lastFullCompleteDate = today;
        }
        habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);
        this.addCompletedDay(habit, today);
      }
      return habit;
    });

    this.commit(next);
  }

  markYesterdayComplete(id: string): void {
    const today = dateKeyLocal();
    const yesterday = yesterdayKeyLocal();

    const next = this._state$.value.map(h => {
      if (h.id !== id) return this.normalize(h);
      const habit = this.normalize({ ...h });

      if (habit.lastFullCompleteDate === today) return habit;     // schon heute gezählt
      if (habit.lastFullCompleteDate === yesterday) return habit; // gestern schon drin

      // gestern nachtragen
      if (habit.lastFullCompleteDate) {
        const last = new Date(habit.lastFullCompleteDate + 'T00:00:00');
        const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        twoDaysAgo.setHours(0,0,0,0);
        if (last.getTime() === twoDaysAgo.getTime()) {
          habit.currentStreak = Math.max(1, habit.currentStreak) + 1;
        } else {
          habit.currentStreak = 1;
        }
      } else {
        habit.currentStreak = 1;
      }

      habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);
      habit.lastFullCompleteDate = yesterday;
      this.addCompletedDay(habit, yesterday);
      habit.updatedAt = nowIso();
      return habit;
    });

    this.commit(next);
  }

  undo(id: string): void {
    const today = dateKeyLocal();

    const next = this._state$.value.map(h => {
      if (h.id !== id) return this.normalize(h);
      const habit = this.normalize({ ...h });

      if (habit.todayCount > 0) {
        if (habit.todayCount === habit.target && habit.lastFullCompleteDate === today) {
          habit.lastFullCompleteDate = undefined;
          this.removeCompletedDay(habit, today);
        }
        habit.todayCount -= 1;
        habit.updatedAt = nowIso();
      }
      return habit;
    });

    this.commit(next);
  }

  deleteHabit(id: string): void {
    const next = this._state$.value.filter(h => h.id !== id);
    this.commit(next);
  }
  delete(id: string) { this.deleteHabit(id); }
  remove(id: string) { this.deleteHabit(id); }
  removeHabit(id: string) { this.deleteHabit(id); }

  progressFor(id: string): Progress | null {
    const habit = this._state$.value.find(h => h.id === id);
    if (!habit) return null;
    const h = this.normalize(habit);
    const count = Math.max(0, Math.min(h.target, h.todayCount));
    const percent = Math.max(0, Math.min(1, count / Math.max(1, h.target)));
    return { count, target: h.target, percent };
  }

  currentStreak(id: string): number {
    const h = this._state$.value.find(x => x.id === id);
    return h ? this.normalize(h).currentStreak : 0;
  }
  getCurrentStreak(id: string) { return this.currentStreak(id); }

  longestStreak(id: string): number {
    const h = this._state$.value.find(x => x.id === id);
    return h ? this.normalize(h).longestStreak : 0;
  }
  getLongestStreak(id: string) { return this.longestStreak(id); }

  getHabitByIdSync(id: string) { return this._state$.value.find(h => h.id === id); }
  async getHabitById(id: string) { return this.getHabitByIdSync(id); }

  updateHabitNotifications(id: string, notifications: HabitNotification[]): void {
    const next = this._state$.value.map(h => h.id === id ? { ...h, notifications: notifications ?? [], updatedAt: nowIso() } : h);
    this.commit(next);
  }

  updateHabit(updated: Habit): void {
    const next = this._state$.value.map(h => h.id === updated.id ? { ...this.normalize(updated), updatedAt: nowIso() } : h);
    this.commit(next);
  }

  resetCurrentStreak(id: string): void {
    const today = dateKeyLocal();
    const next = this._state$.value.map(h => {
      if (h.id !== id) return this.normalize(h);
      const habit = this.normalize({ ...h });
      habit.currentStreak = 0;
      if (habit.lastFullCompleteDate === today) habit.lastFullCompleteDate = undefined;
      habit.todayCount = 0;
      this.removeCompletedDay(habit, today);
      habit.updatedAt = nowIso();
      return habit;
    });
    this.commit(next);
  }

  resetLongestStreak(id: string): void {
    const next = this._state$.value.map(h => {
      if (h.id !== id) return this.normalize(h);
      const habit = this.normalize({ ...h });
      habit.longestStreak = habit.currentStreak; // Farbe unverändert (nur Zahl)
      habit.updatedAt = nowIso();
      return habit;
    });
    this.commit(next);
  }

  // ===== Helpers =====

  private addCompletedDay(h: Habit, key: string) {
    if (!h.completedDays) h.completedDays = [];
    if (!h.completedDays.includes(key)) {
      h.completedDays.push(key);
      h.completedDays.sort();
    }
  }
  private removeCompletedDay(h: Habit, key: string) {
    if (!h.completedDays) return;
    const i = h.completedDays.indexOf(key);
    if (i >= 0) h.completedDays.splice(i, 1);
  }

  /** Rekonstruiert/ergänzt completedDays so, dass sie mindestens currentStreak umfasst. */
  private ensureCompletedDays(h: Habit): Habit {
    const list = Array.isArray(h.completedDays) ? [...h.completedDays] : [];
    const needed = Math.max(0, h.currentStreak | 0);

    // nichts zu tun
    if (needed === 0) return { ...h, completedDays: [] };

    // Ende der Serie bestimmen
    let endKey = h.lastFullCompleteDate;
    if (!endKey) {
      // Heuristik: heute voll -> Ende heute, sonst gestern
      endKey = (h.todayCount >= Math.max(1, h.target)) ? dateKeyLocal() : yesterdayKeyLocal();
    }

    // reconstruct trailing streak
    const end = new Date(endKey + 'T00:00:00');
    if (isNaN(+end)) return { ...h, completedDays: list };

    const seq: string[] = [];
    for (let i = needed - 1; i >= 0; i--) {
      const d = new Date(end); d.setDate(d.getDate() - i);
      seq.push(dateKeyLocal(d));
    }

    const set = new Set([...list, ...seq]);
    const merged = Array.from(set).sort();
    return { ...h, completedDays: merged };
  }

  private normalize(h: Habit): Habit {
    const today = dateKeyLocal();

    let next: Habit = {
      ...h,
      period: (h as any).period ?? 'day',
      notifications: Array.isArray((h as any).notifications) ? (h as any).notifications : [],
      completedDays: Array.isArray((h as any).completedDays) ? (h as any).completedDays : [],
    };

    // Tageszähler bei Datumssprung zurücksetzen
    if (!next.lastCountDate || next.lastCountDate !== today) {
      next = { ...next, todayCount: 0, lastCountDate: today, updatedAt: nowIso() };
    }

    // completedDays sicherstellen
    next = this.ensureCompletedDays(next);
    return next;
  }

  private normalizeAll(list: Habit[]): Habit[] {
    let changed = false;
    const normalized = list.map(h => {
      const n = this.normalize(h);
      if (JSON.stringify(n) !== JSON.stringify(h)) changed = true;
      return n;
    });
    if (changed) this.commit(normalized);
    return normalized;
  }

  private commit(list: Habit[]): void {
    this._state$.next(list);
    this.save(list);
  }

  private load(): Habit[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as any[];
      const list = (parsed ?? []).map((h) =>
        this.normalize({
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
          completedDays: Array.isArray(h?.completedDays) ? h.completedDays : [],
          createdAt: h?.createdAt ?? nowIso(),
          updatedAt: h?.updatedAt ?? nowIso(),
        }),
      );
      // Backfill-Ergebnis sofort persistieren
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
      return list;
    } catch {
      return [];
    }
  }

  private save(list: Habit[]): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
  }
}
