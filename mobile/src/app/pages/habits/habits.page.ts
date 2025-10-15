// mobile/src/app/pages/habits/habits.page.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { HabitService } from '../../habit.service';

@Component({
  standalone: true,
  selector: 'app-habits',
  templateUrl: './habits.page.html',
  styleUrls: ['./habits.page.scss'],
  imports: [IonicModule, CommonModule, RouterModule],
})
export class HabitsPage {
  private readonly habitSvc = inject(HabitService);
  readonly habits$ = this.habitSvc.habits$;

  // ==== Fortschritt / Anzeige ====
  progress(id: string): number {
    const p = this.habitSvc.progressFor(id);
    return p ? p.percent : 0;
  }
  progressText(id: string): string {
    const p = this.habitSvc.progressFor(id);
    return p ? `${p.count} / ${p.target}` : '';
  }
  dayDone(id: string): boolean {
    const p = this.habitSvc.progressFor(id);
    return !!p && p.count >= p.target;
  }
  currentStreak(id: string): number {
    const svc: any = this.habitSvc as any;
    return (svc.currentStreak?.(id) ?? svc.getCurrentStreak?.(id) ?? 0) as number;
  }
  longestStreak(id: string): number {
    const svc: any = this.habitSvc as any;
    return (svc.longestStreak?.(id) ?? svc.getLongestStreak?.(id) ?? 0) as number;
  }
  trackById = (_: number, h: any) => h.id;

  /** Farbskala für Streak-Werte */
  private colorForStreak(value: number): string {
    if (value >= 365) return '#ef4444'; // rot
    if (value >= 186) return '#d946ef'; // magenta
    if (value >= 93)  return '#3b82f6'; // blau
    if (value >= 31)  return '#06b6d4'; // cyan
    if (value >= 7)   return '#22c55e'; // grün
    return '#ffc400';                   // gelb (0–6)
  }

  frameColor(id: string): string {
    return this.colorForStreak(this.currentStreak(id));
  }

  /** NEU: Textfarbe weiß, wenn currentStreak == 0; sonst skaliert */
  streakTextColor(id: string): string {
    const cur = this.currentStreak(id);
    if (cur <= 0) return '#ffffff';
    return this.colorForStreak(cur);
  }

  // ==== Hold-Geste & „Gestern“-Flow (wie zuvor, unverändert relevante Teile) ====

  private static readonly HOLD_MS = 700;
  private _holdPct = new Map<string, number>();
  private _raf = new Map<string, number>();
  private _start = new Map<string, number>();
  private _completedThisHold = new Map<string, boolean>();
  private _noHold = new Set<string>();

  holdProgress(id: string): number { return this._holdPct.get(id) ?? 0; }
  noHoldAnim(id: string): boolean { return this._noHold.has(id); }

  startHold(id: string, ev: PointerEvent): void {
    if (!ev.isPrimary) return;
    ev.preventDefault();
    try { (ev.currentTarget as Element)?.setPointerCapture?.(ev.pointerId); } catch {}
    this.cancelRaf(id);
    this._completedThisHold.set(id, false);
    this._start.set(id, performance.now());
    this._holdPct.set(id, 0);
    this._noHold.delete(id);
    this.loop(id);
  }

  endHold(id: string): void {
    this.cancelRaf(id);
    this._start.delete(id);
    const wasCompleted = this._completedThisHold.get(id) === true;
    if (wasCompleted) {
      this._noHold.add(id);
      this._holdPct.set(id, 0);
      requestAnimationFrame(() => this._noHold.delete(id));
    } else {
      this._holdPct.set(id, 0);
    }
    this._completedThisHold.delete(id);
  }

  private loop(id: string): void {
    const start = this._start.get(id);
    if (start == null) return;
    const now = performance.now();
    const pct = Math.min(1, (now - start) / HabitsPage.HOLD_MS);
    this._holdPct.set(id, pct);
    if (pct >= 1 && !this._completedThisHold.get(id)) {
      this._completedThisHold.set(id, true);
      this.onCompleteRequest(id);
    } else {
      const handle = requestAnimationFrame(() => this.loop(id));
      this._raf.set(id, handle);
    }
  }
  private cancelRaf(id: string): void {
    const handle = this._raf.get(id);
    if (handle != null) { cancelAnimationFrame(handle); this._raf.delete(id); }
  }

  // ======= Gestern/Heute-Flow =======
  chooseDayOpen = false;
  chooseDayInputs: any[] = [];
  chooseDayButtons: any[] = [];
  private pendingHabitId: string | null = null;

  private async fetchHabit(id: string): Promise<any | null> {
    const svc: any = this.habitSvc as any;
    const fn = svc.getHabitById ?? svc.getHabit ?? svc.findById ?? svc.findHabitById ?? null;
    if (!fn) return null;
    const res = fn.call(svc, id);
    return res instanceof Promise ? await res : res;
  }

  private allowYesterdayOption(h: any): boolean {
    if (!h || h.period !== 'day') return false;
    const today = this.todayKey();
    const yesterday = this.prevDayKey();

    const createdKey = this.localKeyFromIso(h.createdAt);
    if (!createdKey || createdKey >= today) return false;

    if (h.lastFullCompleteDate === yesterday) return false;
    if (h.lastFullCompleteDate === today) return false;

    const p = this.habitSvc.progressFor(h.id);
    if (p && p.count >= p.target) return false;

    return true;
  }

  private async onCompleteRequest(id: string) {
    this.pendingHabitId = id;

    const h = await this.fetchHabit(id);
    if (!h) { this.habitSvc.complete(id); return; }

    const p = this.habitSvc.progressFor(id);
    if (p && p.count >= p.target) { return; }

    if (this.allowYesterdayOption(h)) {
      this.chooseDayInputs = [
        { type: 'radio', label: 'Yesterday', value: 'yesterday', checked: true },
        { type: 'radio', label: 'Today', value: 'today' },
      ];
      this.chooseDayButtons = [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Confirm', role: 'confirm', handler: (value: 'yesterday' | 'today') => this.applyChooseDay(value) },
      ];
      this.chooseDayOpen = true;
    } else {
      this.habitSvc.complete(id);
    }
  }

  private applyChooseDay(choice: 'yesterday' | 'today') {
    const id = this.pendingHabitId;
    this.chooseDayOpen = false;
    this.pendingHabitId = null;
    if (!id) return;

    if (choice === 'yesterday') this.markYesterday(id);
    else this.habitSvc.complete(id);
  }

  private markYesterday(id: string): void {
    const svc: any = this.habitSvc as any;
    if (typeof svc.markYesterdayComplete === 'function') {
      svc.markYesterdayComplete(id);
    } else if (typeof svc.completeForDay === 'function') {
      svc.completeForDay(id, 'yesterday');
    } else if (typeof svc.retroComplete === 'function') {
      svc.retroComplete(id, -1);
    } else {
      this.habitSvc.complete(id);
    }
  }

  private prevDayKey(): string {
    const d = new Date(); d.setDate(d.getDate() - 1); return this.dateKeyLocal(d);
  }
  private todayKey(): string { return this.dateKeyLocal(new Date()); }
  private dateKeyLocal(d: Date): string {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  private localKeyFromIso(iso?: string): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(+d)) return null;
    return this.dateKeyLocal(d);
  }
}
