import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

// Deutsch: Standalone-Bausteine EXPLIZIT importieren, inkl. IonIcon
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonList, IonItem, IonButton, IonAlert, IonIcon
} from '@ionic/angular/standalone';

import { RouterModule } from '@angular/router';
import { HabitService } from '../../habit.service';

// Deutsch: Ionicons registrieren (Reset + Alarm)
import { addIcons } from 'ionicons';
import { refreshOutline, refreshCircleOutline, alarmOutline } from 'ionicons/icons';

@Component({
  standalone: true,
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    CommonModule,
    RouterModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonList, IonItem, IonButton, IonAlert, IonIcon
  ],
})
export class SettingsPage {
  private readonly habitSvc = inject(HabitService);

  constructor() {
    // Deutsch: Icons einmalig für diese Page registrieren
    addIcons({
      'refresh-outline': refreshOutline,
      'refresh-circle-outline': refreshCircleOutline,
      'alarm-outline': alarmOutline,
    });
  }

  readonly habits$ = (this.habitSvc as any).habits$;
  trackById = (_: number, h: any) => h?.id;

  // --- Streak-Werte aus dem Service ---
  currentStreak(id: string): number {
    const svc: any = this.habitSvc;
    return (svc.currentStreak?.(id) ?? svc.getCurrentStreak?.(id) ?? 0) as number;
  }
  longestStreak(id: string): number {
    const svc: any = this.habitSvc;
    return (svc.longestStreak?.(id) ?? svc.getLongestStreak?.(id) ?? 0) as number;
  }

  // --- Farbskala ---
  private colorForStreakDays(days: number): string {
    if (days >= 365) return '#ef4444';
    if (days >= 186) return '#d946ef';
    if (days >= 93)  return '#3b82f6';
    if (days >= 31)  return '#06b6d4';
    if (days >= 7)   return '#22c55e';
    return '#ffc400';
  }
  colorCurrent(id: string): string {
    const everCompleted = this.longestStreak(id) > 0;
    if (!everCompleted) return '#ffffff';
    return this.colorForStreakDays(this.currentStreak(id));
  }
  colorLongest(id: string): string {
    const d = this.longestStreak(id);
    if (d <= 0) return '#ffffff';
    return this.colorForStreakDays(d);
  }

  // ===== Delete-Dialog =====
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

  // ===== Reset-Flow =====
  resetChoiceOpen = false;
  resetConfirmOpen = false;
  resetChoiceInputs: any[] = [];
  resetChoiceButtons: any[] = [];
  resetConfirmButtons: any[] = [];

  resetChoice: 'current' | 'longest' | null = null;
  selectedResetHabitId: string | null = null;
  selectedResetHabitName: string | null = null;

  onResetStreakClick(habit: any, ev?: Event) {
    ev?.stopPropagation();
    this.selectedResetHabitId = habit?.id ?? null;
    this.selectedResetHabitName = habit?.name ?? null;
    this.openResetChoiceAlert();
  }

  private openResetChoiceAlert() {
    this.resetChoiceInputs = [
      { type: 'radio', label: 'Current streak', value: 'current', checked: true },
      { type: 'radio', label: 'Longest streak', value: 'longest' },
    ];
    this.resetChoiceButtons = [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Continue',
        role: 'confirm',
        handler: (value: 'current' | 'longest') => {
          this.resetChoice = value ?? 'current';
        },
      },
    ];
    this.resetChoiceOpen = true;
  }

  proceedAfterChoiceIfAnyPublicAdapter() {
    this.resetChoiceOpen = false;
    if (this.resetChoice) this.openResetConfirmAlert();
  }

  get resetConfirmMessage(): string {
    const which = this.resetChoice === 'current' ? 'current' : 'longest';
    const name = this.selectedResetHabitName || '';
    return `This will permanently reset the ${which} streak for “${name}”. This action cannot be undone.`;
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
    const choice = this.resetChoice;
    if (!id || !choice) {
      this.resetConfirmOpen = false;
      return;
    }
    const svc: any = this.habitSvc;

    try {
      if (choice === 'current') {
        if (svc.resetCurrentStreak) {
          await svc.resetCurrentStreak(id);
        } else {
          const upd = await (svc.getHabitById?.(id) ?? svc.findHabitById?.(id));
          if (upd) {
            upd.currentStreak = 0;
            await (svc.updateHabit?.(upd) ?? svc.saveHabit?.(upd) ?? svc.upsertHabit?.(upd));
          }
        }
      } else {
        if (svc.resetLongestStreak) {
          await svc.resetLongestStreak(id);
        } else {
          const upd = await (svc.getHabitById?.(id) ?? svc.findHabitById?.(id));
          if (upd) {
            upd.longestStreak = 0;
            await (svc.updateHabit?.(upd) ?? svc.saveHabit?.(upd) ?? svc.upsertHabit?.(upd));
          }
        }
      }
    } finally {
      this.resetConfirmOpen = false;
      this.resetChoice = null;
      this.selectedResetHabitId = null;
      this.selectedResetHabitName = null;
    }
  }
}
