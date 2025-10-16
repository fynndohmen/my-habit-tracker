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

  // ===== Streak-Farben wie in der App =====
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

  /** FIX: Wenn current==0 -> immer weiß (unabhängig von Longest) */
  colorCurrent(id: string): string {
    const cur = this.currentStreak(id);
    if (cur <= 0) return '#ffffff';
    return this.colorForStreakDays(cur);
  }
  colorLongest(id: string): string {
    const d = this.longestStreak(id);
    if (d <= 0) return '#ffffff';
    return this.colorForStreakDays(d);
  }

  /** ===== Timeline-Epoch für *tägliche* Habits =====
   * Gibt den **ersten Kalendertag der aktuellen Serie** zurück (YYYY-MM-DD).
   * So trennt die Timeline die aktuelle Serie farblich von der vorherigen.
   * Beispiel: current=1 -> epoch = heute (heutiger Tick bleibt gelb).
   */
  firstDayOfCurrentStreak(id: string): string | undefined {
    const cur = this.currentStreak(id);
    if (cur <= 0) return undefined; // keine Serie aktiv → nichts zu trennen
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (cur - 1));
    return this.dateKeyLocal(d);
  }

  /** lokaler DateKey (YYYY-MM-DD) */
  private dateKeyLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
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
    (svc.deleteHabit?.(this.pendingDeleteId)
      ?? svc.removeHabit?.(this.pendingDeleteId)
      ?? svc.delete?.(this.pendingDeleteId)
      ?? svc.remove?.(this.pendingDeleteId));
    this.pendingDeleteId = null;
    this.alertOpen = false;
  }

  // ===== Reset-Flow: Current / Longest / Timeline =====
  resetChoiceOpen = false;
  resetConfirmOpen = false;

  resetChoiceInputs: any[] = [];
  resetChoiceButtons: any[] = [];
  resetConfirmButtons: any[] = [];

  resetSelection: { current: boolean; longest: boolean; timeline: boolean } = {
    current: true,
    longest: false,
    timeline: false,
  };
  selectedResetHabitId: string | null = null;
  selectedResetHabitName: string | null = null;

  get resetChoiceHeader(): string { return 'Reset data'; }
  get resetConfirmHeader(): string { return 'Confirm reset'; }

  onResetStreakClick(habit: any, ev?: Event) {
    ev?.stopPropagation();
    this.selectedResetHabitId = habit?.id ?? null;
    this.selectedResetHabitName = habit?.name ?? null;
    this.openResetChoiceAlert();
  }

  private openResetChoiceAlert() {
    this.resetChoiceInputs = [
      { type: 'checkbox', label: 'Current streak', value: 'current', checked: this.resetSelection.current },
      { type: 'checkbox', label: 'Longest streak', value: 'longest', checked: this.resetSelection.longest },
      { type: 'checkbox', label: 'Timeline history (also resets current streak)', value: 'timeline', checked: this.resetSelection.timeline },
    ];
    this.resetChoiceButtons = [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Continue',
        role: 'confirm',
        handler: (values: string[] | string) => {
          const arr = Array.isArray(values) ? values : (values ? [values] : []);
          this.resetSelection = {
            current: arr.includes('current'),
            longest: arr.includes('longest'),
            timeline: arr.includes('timeline'),
          };
        },
      },
    ];
    this.resetChoiceOpen = true;
  }

  /** Nur bei role==='confirm' weitermachen */
  onChoiceDismiss(ev: any) {
    this.resetChoiceOpen = false;
    const role = ev?.detail?.role;
    if (role !== 'confirm') return; // Cancel → nichts tun

    const any = this.resetSelection.current || this.resetSelection.longest || this.resetSelection.timeline;
    if (any) this.openResetConfirmAlert();
  }

  get resetConfirmMessage(): string {
    const parts: string[] = [];
    if (this.resetSelection.current) parts.push('current streak');
    if (this.resetSelection.longest) parts.push('longest streak');
    if (this.resetSelection.timeline) parts.push('timeline history (and current streak)');
    const what = parts.join(', ').replace(/, ([^,]*)$/, ' and $1');
    const name = this.selectedResetHabitName || '';
    return `This will reset the ${what} for “${name}”. This action cannot be undone.`;
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
    const svc: any = this.habitSvc;

    try {
      // Timeline zuerst – mit Longest-Preservation abhängig von der Auswahl
      if (this.resetSelection.timeline && typeof svc.resetTimelineData === 'function') {
        const preserveLongest = !this.resetSelection.longest;
        await svc.resetTimelineData(id, preserveLongest, true);
      }

      // Current separat (nur wenn Timeline nicht bereits current auf 0 gesetzt hat)
      if (this.resetSelection.current && !this.resetSelection.timeline && typeof svc.resetCurrentStreak === 'function') {
        await svc.resetCurrentStreak(id);
      }

      // Longest explizit setzen
      if (this.resetSelection.longest && typeof svc.resetLongestStreak === 'function') {
        await svc.resetLongestStreak(id);
      }
    } finally {
      this.resetConfirmOpen = false;
      this.resetSelection = { current: true, longest: false, timeline: false };
      this.selectedResetHabitId = null;
      this.selectedResetHabitName = null;
    }
  }
}
