// mobile/src/app/pages/settings/settings.page.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonList, IonItem, IonButton, IonAlert, IonIcon
} from '@ionic/angular/standalone';

import { HabitService } from '../../habit.service';

import { addIcons } from 'ionicons';
import { refreshOutline, refreshCircleOutline, alarmOutline } from 'ionicons/icons';

@Component({
  standalone: true,
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    CommonModule, RouterModule, // <<— WICHTIG für [routerLink]
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonList, IonItem, IonButton, IonAlert, IonIcon,
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

  currentStreak(id: string): number {
    const svc: any = this.habitSvc;
    return (svc.currentStreak?.(id) ?? svc.getCurrentStreak?.(id) ?? 0) as number;
  }
  longestStreak(id: string): number {
    const svc: any = this.habitSvc;
    return (svc.longestStreak?.(id) ?? svc.getLongestStreak?.(id) ?? 0) as number;
  }

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

  // Delete-Alert
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

  // Reset-Flow (mit Mehrfachauswahl)
  resetChoiceOpen = false;
  resetConfirmOpen = false;
  resetChoiceInputs: any[] = [];
  resetChoiceButtons: any[] = [];
  resetConfirmButtons: any[] = [];
  selectedResetHabitId: string | null = null;
  selectedResetHabitName: string | null = null;
  resetChoice: Array<'current' | 'longest'> = [];

  onResetStreakClick(habit: any, ev?: Event) {
    ev?.stopPropagation();
    this.selectedResetHabitId = habit?.id ?? null;
    this.selectedResetHabitName = habit?.name ?? null;

    this.resetChoiceInputs = [
      { type: 'checkbox', label: 'Current streak', value: 'current', checked: true },
      { type: 'checkbox', label: 'Longest streak', value: 'longest' },
    ];
    this.resetChoiceButtons = [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Continue', role: 'confirm',
        handler: (values: Array<'current' | 'longest'>) => { this.resetChoice = values ?? []; },
      },
    ];
    this.resetChoiceOpen = true;
  }

  proceedAfterChoiceIfAnyPublicAdapter() {
    this.resetChoiceOpen = false;
    if (this.resetChoice.length > 0) {
      this.resetConfirmButtons = [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Confirm', role: 'confirm',
          handler: async () => { await this.applyReset(); },
        },
      ];
      this.resetConfirmOpen = true;
    }
  }

  get resetConfirmMessage(): string {
    const name = this.selectedResetHabitName || '';
    const parts = [];
    if (this.resetChoice.includes('current')) parts.push('current streak');
    if (this.resetChoice.includes('longest')) parts.push('longest streak');
    const what = parts.join(' and ');
    return `This will permanently reset the ${what} for “${name}”. This action cannot be undone.`;
    // Deutsch im Code-Kommentar: Der Text ist absichtlich Englisch (App-Sprache).
  }

  private async applyReset() {
    const id = this.selectedResetHabitId;
    if (!id || this.resetChoice.length === 0) {
      this.resetConfirmOpen = false;
      return;
    }
    const svc: any = this.habitSvc;
    try {
      const upd = await (svc.getHabitById?.(id) ?? svc.findHabitById?.(id));
      if (!upd) return;

      if (this.resetChoice.includes('current')) upd.currentStreak = 0;
      if (this.resetChoice.includes('longest')) upd.longestStreak = 0;

      await (svc.updateHabit?.(upd) ?? svc.saveHabit?.(upd) ?? svc.upsertHabit?.(upd));
    } finally {
      this.resetConfirmOpen = false;
      this.resetChoice = [];
      this.selectedResetHabitId = null;
      this.selectedResetHabitName = null;
    }
  }
}
