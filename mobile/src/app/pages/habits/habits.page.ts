// mobile/src/app/pages/habits/habits.page.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { HabitService } from '../../habit.service'; // <— Pfad zu deinem Service

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

  /** Farbskala für Streak-Werte (Grenzen: 0–6 gelb, ≥7 grün, ≥31 cyan, ≥93 blau, ≥186 magenta, ≥365 rot). */
  private colorForStreak(value: number): string {
    if (value >= 365) return '#ef4444'; // rot
    if (value >= 186) return '#d946ef'; // magenta
    if (value >= 93)  return '#3b82f6'; // blau
    if (value >= 31)  return '#06b6d4'; // cyan
    if (value >= 7)   return '#22c55e'; // grün
    return '#ffc400';                   // gelb (0–6)
  }

  /** Rahmenfarbe (immer nach Skala, auch wenn noch nie abgeschlossen). */
  frameColor(id: string): string {
    return this.colorForStreak(this.currentStreak(id));
  }

  /**
   * Textfarbe der Streak-Zahl:
   * - Weiß, wenn das Habit *noch nie* abgeschlossen wurde (longestStreak === 0)
   * - sonst nach Streak-Skala.
   */
  streakTextColor(id: string): string {
    const everCompleted = this.longestStreak(id) > 0;
    return everCompleted ? this.colorForStreak(this.currentStreak(id)) : '#ffffff';
  }

  // ==== Hold-Geste (unverändert) ====
  private static readonly HOLD_MS = 700;

  private _holdPct = new Map<string, number>(); // 0..1 -> CSS-Var --hold
  private _raf = new Map<string, number>();
  private _start = new Map<string, number>();
  private _completedThisHold = new Map<string, boolean>();
  private _noHold = new Set<string>(); // steuert Klasse .no-hold-anim

  holdProgress(id: string): number {
    return this._holdPct.get(id) ?? 0;
  }
  noHoldAnim(id: string): boolean {
    return this._noHold.has(id);
  }

  startHold(id: string, ev: PointerEvent): void {
    if (!ev.isPrimary) return;
    ev.preventDefault();
    try {
      (ev.currentTarget as Element)?.setPointerCapture?.(ev.pointerId);
    } catch { /* ignore */ }

    this.cancelRaf(id);
    this._completedThisHold.set(id, false);
    this._start.set(id, performance.now());
    this._holdPct.set(id, 0);
    this._noHold.delete(id); // beim Füllen normal animieren
    this.loop(id);
  }

  endHold(id: string): void {
    this.cancelRaf(id);
    this._start.delete(id);

    const wasCompleted = this._completedThisHold.get(id) === true;

    // Nach Erfolg: Overlay ohne Rück-Animation ausblenden
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
      this.habitSvc.complete(id);
      // bleibt voll bis pointerup; Reset in endHold()
    } else {
      const handle = requestAnimationFrame(() => this.loop(id));
      this._raf.set(id, handle);
    }
  }

  private cancelRaf(id: string): void {
    const handle = this._raf.get(id);
    if (handle != null) {
      cancelAnimationFrame(handle);
      this._raf.delete(id);
    }
  }
}
