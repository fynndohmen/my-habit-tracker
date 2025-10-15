// mobile/src/app/pages/settings/settings.page.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonList, IonItem, IonButton, IonAlert, IonIcon
} from '@ionic/angular/standalone';
import { RouterModule } from '@angular/router';
import { HabitService } from '../../habit.service';

// Icons
import { addIcons } from 'ionicons';
import { refreshOutline, alarmOutline } from 'ionicons/icons';

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
    CheckinTimelineComponent,
  ],
})
export class SettingsPage {
  private readonly habitSvc = inject(HabitService);

  constructor() {
    addIcons({
      'refresh-outline': refreshOutline,
      'alarm-outline': alarmOutline,
    });
  }

  readonly habits$ = (this.habitSvc as any).habits$;
  trackById = (_: number, h: any) => h?.id;

  // ======== Streak-Farben =========
  /** Farbskala: 0–6 gelb, ≥7 grün, ≥31 cyan, ≥93 blau, ≥186 magenta, ≥365 rot */
  private colorForStreakDays(days: number): string {
    if (days >= 365) return '#ef4444';
    if (days >= 186) return '#d946ef';
    if (days >= 93)  return '#3b82f6';
    if (days >= 31)  return '#06b6d4';
    if (days >= 7)   return '#22c55e';
    return '#ffc400';
  }

  /** FIX: current==0 => immer weiß, sonst Skala */
  colorCurrent(id: string): string {
    const c = this.currentStreak(id);
    return c <= 0 ? '#ffffff' : this.colorForStreakDays(c);
  }

  /** longest==0 => weiß, sonst Skala */
  colorLongest(id: string): string {
    const d = this.longestStreak(id);
    return d <= 0 ? '#ffffff' : this.colorForStreakDays(d);
  }

  // ======== Werte aus Service (verträglich zu Varianten) ========
  currentStreak(id: string): number {
    const svc: any = this.habitSvc;
    return (svc.currentStreak?.(id) ?? svc.getCurrentStreak?.(id) ?? 0) as number;
  }
  longestStreak(id: string): number {
    const svc: any = this.habitSvc;
    return (svc.longestStreak?.(id) ?? svc.getLongestStreak?.(id) ?? 0) as number;
  }

  // ======== Delete ========
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

  // ======== Reset-Flow (current / longest / both) ========
  resetChoiceOpen = false;
  resetConfirmOpen = false;
  resetChoiceInputs: any[] = [];
  resetChoiceButtons: any[] = [];
  resetConfirmButtons: any[] = [];

  resetChoice: Array<'current'|'longest'> = [];
  selectedResetHabitId: string | null = null;
  selectedResetHabitName: string | null = null;

  get resetChoiceHeader(): string { return 'Choose streak data to reset'; }
  get resetConfirmHeader(): string { return 'Confirm reset'; }
  get resetConfirmMessage(): string {
    const name = this.selectedResetHabitName || '';
    const parts = this.resetChoice.includes('current') && this.resetChoice.includes('longest')
      ? 'current and longest streak'
      : this.resetChoice.includes('current')
        ? 'current streak'
        : 'longest streak';
    return `This will permanently reset the ${parts} for “${name}”. This action cannot be undone.`;
  }

  onResetStreakClick(habit: any, ev?: Event) {
    ev?.stopPropagation();
    this.selectedResetHabitId = habit?.id ?? null;
    this.selectedResetHabitName = habit?.name ?? null;

    // Mehrfachauswahl erlaubt
    this.resetChoiceInputs = [
      { type: 'checkbox', label: 'Current streak', value: 'current', checked: true },
      { type: 'checkbox', label: 'Longest streak', value: 'longest' },
    ];
    this.resetChoiceButtons = [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Continue',
        role: 'confirm',
        handler: (values: Array<'current'|'longest'>) => {
          this.resetChoice = Array.isArray(values) ? values : [];
        },
      },
    ];
    this.resetChoiceOpen = true;
  }

  proceedAfterChoiceIfAnyPublicAdapter() {
    this.resetChoiceOpen = false;
    if (this.resetChoice.length > 0) this.openResetConfirmAlert();
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
    const choices = this.resetChoice;
    if (!id || choices.length === 0) {
      this.resetConfirmOpen = false;
      return;
    }
    const svc: any = this.habitSvc;

    try {
      // --- CURRENT zurücksetzen: current=0, heute wieder offen; LONGEST UNVERÄNDERT ---
      if (choices.includes('current')) {
        const upd = await (svc.getHabitById?.(id) ?? svc.findHabitById?.(id));
        if (upd) {
          upd.currentStreak = 0;
          // „heute offen“ erzwingen:
          const today = this.todayKey();
          if (upd.lastFullCompleteDate === today) {
            upd.lastFullCompleteDate = undefined;
          }
          upd.todayCount = 0;
          // LONGEST NICHT anfassen!
          await (svc.updateHabit?.(upd) ?? svc.saveHabit?.(upd) ?? svc.upsertHabit?.(upd));
        }
      }

      // --- LONGEST zurücksetzen: auf aktuellen current setzen ---
      if (choices.includes('longest')) {
        const upd = await (svc.getHabitById?.(id) ?? svc.findHabitById?.(id));
        if (upd) {
          upd.longestStreak = Math.max(0, upd.currentStreak ?? 0);
          await (svc.updateHabit?.(upd) ?? svc.saveHabit?.(upd) ?? svc.upsertHabit?.(upd));
        }
      }
    } finally {
      this.resetConfirmOpen = false;
      this.resetChoice = [];
      this.selectedResetHabitId = null;
      this.selectedResetHabitName = null;
    }
  }

  private todayKey(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
