import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

// Wichtig: Standalone-Bausteine EXPLIZIT importieren, inkl. IonAlert
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
  IonContent, IonList, IonItem, IonButton, IonAlert
} from '@ionic/angular/standalone';

import { HabitService } from '../../habit.service';

@Component({
  standalone: true,
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonList, IonItem, IonButton, IonAlert
  ],
})
export class SettingsPage {
  private readonly habitSvc = inject(HabitService);

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

  // --- Farbskala (Rahmen/“normale” Farben) ---
  private colorForStreakDays(days: number): string {
    if (days >= 365) return '#ef4444'; // rot
    if (days >= 186) return '#d946ef'; // magenta
    if (days >= 93)  return '#3b82f6'; // blau
    if (days >= 31)  return '#06b6d4'; // cyan
    if (days >= 7)   return '#22c55e'; // grün
    return '#ffc400';                  // gelb (1..6)
  }

  // --- Textfarbe: 0 immer WEISS, sonst Skala ---
  colorCurrent(id: string): string {
    const everCompleted = this.longestStreak(id) > 0;
    if (!everCompleted) return '#ffffff'; // noch nie abgeschlossen -> weiß
    return this.colorForStreakDays(this.currentStreak(id));
  }
  colorLongest(id: string): string {
    const d = this.longestStreak(id);
    if (d <= 0) return '#ffffff';
    return this.colorForStreakDays(d);
  }

  // --- Delete-Dialog (deklaratives <ion-alert>) ---
  alertOpen = false;
  alertButtons: any[] = [];
  private pendingDeleteId: string | null = null;

  confirmDelete(id: string, ev?: Event) {
    ev?.stopPropagation();
    this.pendingDeleteId = id;

    // Buttons als neue Referenz setzen (wichtig fürs Binding)
    this.alertButtons = [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Delete', role: 'destructive', handler: () => this.doDelete() },
    ];
    this.alertOpen = true;
  }

  private doDelete() {
    if (!this.pendingDeleteId) return;
    const svc: any = this.habitSvc;
    // mehrere mögliche Methodennamen unterstützen
    svc.deleteHabit?.(this.pendingDeleteId)
      ?? svc.removeHabit?.(this.pendingDeleteId)
      ?? svc.delete?.(this.pendingDeleteId)
      ?? svc.remove?.(this.pendingDeleteId);
    this.pendingDeleteId = null;
    this.alertOpen = false;
  }
}
