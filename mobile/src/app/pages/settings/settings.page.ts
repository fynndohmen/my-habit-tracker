// mobile/src/app/pages/settings/settings.page.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

// Ionic Standalone
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonList, IonItem, IonButton, IonAlert, IonIcon
} from '@ionic/angular/standalone';

import { RouterModule } from '@angular/router';
import { HabitService } from '../../habit.service';
import { addIcons } from 'ionicons';
import { refreshOutline, refreshCircleOutline, alarmOutline } from 'ionicons/icons';

// Timeline
import { CheckinTimelineComponent } from '../../components/checkin-timeline/checkin-timeline.component';

@Component({
  standalone: true,
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    CommonModule,
    RouterModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonList, IonItem, IonButton, IonAlert, IonIcon,
    CheckinTimelineComponent
  ],
})
export class SettingsPage {
  private readonly habitSvc = inject(HabitService);

  constructor() {
    addIcons({
      'refresh-outline': refreshOutline,
      'refresh-circle-outline': refreshCircleOutline,
      'alarm-outline': alarmOutline,
    });
  }

  readonly habits$ = (this.habitSvc as any).habits$;
  trackById = (_: number, h: any) => h?.id;

  // ===== Streak-Farben (TAGES-Momentum über alle Perioden) =====
  private colorForStreakDays(days: number): string {
    if (days >= 365) return '#ef4444';
    if (days >= 186) return '#d946ef';
    if (days >= 93)  return '#3b82f6';
    if (days >= 31)  return '#06b6d4';
    if (days >= 7)   return '#22c55e';
    return '#ffc400';
  }

  currentStreak(id: string): number {
    const svc: any = this.habitSvc;
    return (svc.currentStreak?.(id) ?? svc.getCurrentStreak?.(id) ?? 0) as number;
  }
  longestStreak(id: string): number {
    const svc: any = this.habitSvc;
    return (svc.longestStreak?.(id) ?? svc.getLongestStreak?.(id) ?? 0) as number;
  }

  /** Current: 0 => weiß, sonst Momentum-Farbe */
  colorCurrent(id: string): string {
    const svc: any = this.habitSvc as any;
    const days = (svc.currentMomentumDays?.(id) ?? 0) as number;
    if (days <= 0) return '#ffffff';
    return this.colorForStreakDays(days);
  }

  /** Longest: 0 => weiß, sonst höchste Momentum-Farbe jemals */
  colorLongest(id: string): string {
    const svc: any = this.habitSvc as any;
    const days = (svc.longestMomentumDays?.(id) ?? 0) as number;
    if (days <= 0) return '#ffffff';
    return this.colorForStreakDays(days);
  }

  // ===== Löschen =====
  alertOpen = false;
  alertButtons: any[] = [];
  private pendingDeleteId: string | null = null;

  confirmDelete(id: string, ev?: Event) {
    ev?.stopPropagation();
    this.pendingDeleteId = id;
    this.alertButtons = [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Delete', role: 'destructive', handler: () => this.doDelete() },
    ];
    this.alertOpen = true;
  }
  private doDelete() {
    if (!this.pendingDeleteId) return;
    const svc: any = this.habitSvc;
    svc.deleteHabit?.(this.pendingDeleteId)
      ?? svc.removeHabit?.(this.pendingDeleteId)
      ?? svc.delete?.(this.pendingDeleteId)
      ?? svc.remove?.(this.pendingDeleteId);
    this.pendingDeleteId = null;
    this.alertOpen = false;
  }

  // ===== Reset (einzige Option: alles zurücksetzen) =====
  resetConfirmOpen = false;
  resetConfirmButtons: any[] = [];
  private selectedResetHabitId: string | null = null;
  private selectedResetHabitName: string | null = null;

  /**
   * Klick auf „Reset“ in der Karte → einfacher Confirm-Dialog.
   * Setzt ALLE Streakdaten zurück (current, longest, timeline) und lässt das Habit
   * wie „neu angelegt“ starten (Progress 0, Streaks 0/weiß, Timeline neutraler Tick).
   */
  onResetClick(habit: any, ev?: Event) {
    ev?.stopPropagation();
    this.selectedResetHabitId = habit?.id ?? null;
    this.selectedResetHabitName = habit?.name ?? null;
    this.openResetConfirmAlert();
  }

  private openResetConfirmAlert() {
    this.resetConfirmButtons = [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Confirm', role: 'confirm', handler: async () => { await this.applyReset(); } },
    ];
    this.resetConfirmOpen = true;
  }

  private async applyReset() {
    const id = this.selectedResetHabitId;
    if (!id) { this.resetConfirmOpen = false; return; }
    try {
      // Führt den kompletten Reset durch (current, longest, timeline, createdAt->now)
      await this.habitSvc.resetHabitCompletely(id);
    } finally {
      this.resetConfirmOpen = false;
      this.selectedResetHabitId = null;
      this.selectedResetHabitName = null;
    }
  }
}
