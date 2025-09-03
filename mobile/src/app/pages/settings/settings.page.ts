import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HabitService } from '../../habit.service';

@Component({
  standalone: true,
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [IonicModule, CommonModule],
})
export class SettingsPage {
  private readonly habitSvc = inject(HabitService);

  readonly habits$ = this.habitSvc.habits$;
  trackById = (_: number, h: any) => h.id;

  currentStreak(id: string): number {
    const svc: any = this.habitSvc as any;
    return (svc.currentStreak?.(id) ?? svc.getCurrentStreak?.(id) ?? 0) as number;
  }
  longestStreak(id: string): number {
    const svc: any = this.habitSvc as any;
    return (svc.longestStreak?.(id) ?? svc.getLongestStreak?.(id) ?? 0) as number;
  }

  /** true, wenn das Habit mindestens einmal voll abgeschlossen wurde */
  private everCompleted(id: string): boolean {
    return this.longestStreak(id) > 0;
  }

  // ==== Farben je Streak (wie bisher) ====
  private palette = {
    yellow:  '#ffc400',
    green:   '#16a34a',
    cyan:    '#06b6d4',
    blue:    '#2563eb',
    magenta: '#d946ef',
    red:     '#ef4444',
  };
  colorForStreakDays(days: number): string {
    if (days >= 365) return this.palette.red;
    if (days >= 183) return this.palette.magenta;
    if (days >= 93)  return this.palette.blue;
    if (days >= 31)  return this.palette.cyan;
    if (days >= 7)   return this.palette.green;
    return this.palette.yellow;
  }

  /** Wunsch: Wenn noch nie abgeschlossen → Text weiß. */
  colorCurrent(id: string): string {
    if (!this.everCompleted(id)) return '#ffffff';
    return this.colorForStreakDays(this.currentStreak(id));
  }
  colorLongest(id: string): string {
    const days = this.longestStreak(id);
    if (days <= 0) return '#ffffff';
    return this.colorForStreakDays(days);
  }

  // ==== Delete-Dialog ====
  alertOpen = false;
  private pendingDeleteId: string | null = null;

  confirmDelete(id: string, ev?: Event) {
    ev?.stopPropagation();
    this.pendingDeleteId = id;
    this.alertOpen = true;
  }

  get alertButtons() {
    return [
      {
        text: 'Cancel',
        role: 'cancel',
        handler: () => {
          this.alertOpen = false;
          this.pendingDeleteId = null;
        },
      },
      {
        text: 'Confirm',
        role: 'confirm',
        handler: () => this.doDelete(),
      },
    ] as any[];
  }

  private doDelete() {
    if (!this.pendingDeleteId) return;
    const svc: any = this.habitSvc as any;
    svc.delete?.(this.pendingDeleteId)
      ?? svc.deleteHabit?.(this.pendingDeleteId)
      ?? svc.remove?.(this.pendingDeleteId)
      ?? svc.removeHabit?.(this.pendingDeleteId);
    this.alertOpen = false;
    this.pendingDeleteId = null;
  }
}
