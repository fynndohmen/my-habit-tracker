import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Ionic Standalone
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
  IonContent, IonList, IonItem, IonButton, IonModal, IonDatetime
} from '@ionic/angular/standalone';

import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HabitService } from '../../habit.service';
import { NotificationService, HabitNotification as Notif } from '../../services/notification.service';

@Component({
  standalone: true,
  selector: 'app-edit-notifications',
  templateUrl: './edit-notifications.page.html',
  styleUrls: ['./edit-notifications.page.scss'],
  imports: [
    CommonModule, FormsModule, RouterModule,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
    IonContent, IonList, IonItem, IonButton, IonModal, IonDatetime
  ],
})
export class EditNotificationsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly habitSvc = inject(HabitService);
  private readonly notifSvc = inject(NotificationService);

  habitId = '';
  habitName = '';
  notifications: Notif[] = [];
  /** true, wenn beim Öffnen bereits Einträge vorhanden waren */
  hadAnyAtOpen = false;

  // Modal-State
  notifOpen = false;
  notifTimeIso = this.isoNowRounded();
  tempDays: number[] = []; // 0..6 (Mo..So)
  readonly WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  constructor() {
    // Route-Param lesen & Daten laden
    this.habitId = this.route.snapshot.paramMap.get('id') ?? '';
    const habit = this.habitSvc.getHabitByIdSync(this.habitId);
    if (habit) {
      this.habitName = habit.name;
      this.notifications = [...(habit.notifications ?? [])];
      this.hadAnyAtOpen = (habit.notifications?.length ?? 0) > 0;
    }
  }

  /** Button-Logik: Wenn beim Öffnen schon Einträge da waren, Button immer zeigen.
   *  Wenn nicht: erst zeigen, sobald mind. 1 Eintrag hinzugefügt wurde. */
  get showSave(): boolean {
    return this.hadAnyAtOpen || this.notifications.length > 0;
  }

  trackByIndex = (index: number, _item: Notif) => index;

  formatTime(h: number, m: number): string {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  formatDays(days: number[]): string {
    const labels = this.WEEKDAYS;
    return labels.filter((_, i) => days.includes(i)).join(', ');
  }

  // ===== Modal =====
  openNotifModal(): void {
    this.notifTimeIso = this.isoNowRounded();
    this.tempDays = [];
    this.notifOpen = true;
  }
  closeNotif(): void { this.notifOpen = false; }

  onTimePicked(ev: CustomEvent) {
    const val = (ev.detail as any)?.value;
    if (typeof val === 'string') this.notifTimeIso = val;
  }

  toggleDay(idx: number): void {
    const i = this.tempDays.indexOf(idx);
    if (i >= 0) this.tempDays.splice(i, 1); else this.tempDays.push(idx);
    this.tempDays.sort((a, b) => a - b);
  }

  /** Modal „Save“: nur lokal übernehmen – **kein** Persist/Scheduling hier */
  confirmNotif(): void {
    const d = new Date(this.notifTimeIso || new Date());
    const hour = d.getHours();
    const minute = d.getMinutes();

    // Default: ohne Auswahl → jeden Tag
    const days = this.tempDays.length ? [...this.tempDays] : [0,1,2,3,4,5,6];

    this.notifications.push({ hour, minute, days });
    this.notifOpen = false;
  }

  removeNotif(i: number): void {
    this.notifications.splice(i, 1);
    // Persist/Scheduling erst beim Seiten-Save
  }

  // ===== Persistenz & Scheduling NUR bei Seiten-Save =====
  async saveAndExit(): Promise<void> {
    if (!this.habitId) { await this.router.navigateByUrl('/settings'); return; }

    const habit = this.habitSvc.getHabitByIdSync(this.habitId);
    const oldNotifs = habit?.notifications ?? [];

    // 1) Service-Status aktualisieren
    this.habitSvc.updateHabitNotifications(this.habitId, this.notifications);

    // 2) Local Notifications neu planen (erst alte canceln)
    try {
      await this.notifSvc.cancelForHabit(this.habitId, oldNotifs);
      const granted = await this.notifSvc.ensurePermission();
      if (granted) {
        await this.notifSvc.scheduleForHabit(this.habitId, habit?.name ?? this.habitName, this.notifications);
      }
    } catch {
      // silent
    }

    await this.router.navigateByUrl('/settings');
  }

  private isoNowRounded(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString();
  }
}
