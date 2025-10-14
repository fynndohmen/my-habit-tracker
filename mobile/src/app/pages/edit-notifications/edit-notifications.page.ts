// mobile/src/app/pages/edit-notifications/edit-notifications.page.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Ionic Standalone
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
  IonContent, IonList, IonItem, IonButton, IonModal, IonDatetime, IonIcon
} from '@ionic/angular/standalone';

import { ActivatedRoute, RouterModule } from '@angular/router';
import { HabitService } from '../../habit.service';
import { NotificationService, HabitNotification as Notif } from '../../services/notification.service';

// Icons
import { addIcons } from 'ionicons';
import { addOutline } from 'ionicons/icons';

@Component({
  standalone: true,
  selector: 'app-edit-notifications',
  templateUrl: './edit-notifications.page.html',
  styleUrls: ['./edit-notifications.page.scss'],
  imports: [
    CommonModule, FormsModule, RouterModule,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
    IonContent, IonList, IonItem, IonButton, IonModal, IonDatetime, IonIcon
  ],
})
export class EditNotificationsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly habitSvc = inject(HabitService);
  private readonly notifSvc = inject(NotificationService);

  habitId = '';
  habitName = '';
  notifications: Notif[] = [];

  // Modal-State
  notifOpen = false;
  notifTimeIso = this.isoNowRounded();
  tempDays: number[] = []; // 0..6 (Mo..So)
  readonly WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  constructor() {
    addIcons({ 'add-outline': addOutline });

    // Route-Param lesen & Daten laden
    this.habitId = this.route.snapshot.paramMap.get('id') ?? '';
    const habit = this.habitSvc.getHabitByIdSync(this.habitId);
    if (habit) {
      this.habitName = habit.name;
      this.notifications = [...(habit.notifications ?? [])];
    }
  }

  /** KORRIGIERT: TrackBy mit 2 Parametern (index, item) */
  trackByIndex = (index: number, _item: Notif) => index;

  formatTime(h: number, m: number): string {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  formatDays(days: number[]): string {
    const labels = ['Mo','Tu','We','Th','Fr','Sa','Su'];
    return labels.filter((_, i) => days.includes(i)).join(', ');
  }

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

  async confirmNotif(): Promise<void> {
    const d = new Date(this.notifTimeIso || new Date());
    const hour = d.getHours();
    const minute = d.getMinutes();

    // Default: ohne Auswahl → jeden Tag
    const days = this.tempDays.length ? [...this.tempDays] : [0,1,2,3,4,5,6];

    this.notifications.push({ hour, minute, days });
    this.notifOpen = false;

    await this.persistAndReschedule();
  }

  removeNotif(i: number): void {
    this.notifications.splice(i, 1);
    this.persistAndReschedule();
  }

  private async persistAndReschedule(): Promise<void> {
    if (!this.habitId) return;
    const habit = this.habitSvc.getHabitByIdSync(this.habitId);
    if (!habit) return;

    // 1) Service-Status aktualisieren
    this.habitSvc.updateHabitNotifications(this.habitId, this.notifications);

    // 2) Local Notifications neu planen
    try {
      await this.notifSvc.cancelForHabit(this.habitId, habit.notifications);
      const granted = await this.notifSvc.ensurePermission();
      if (granted) {
        await this.notifSvc.scheduleForHabit(this.habitId, habit.name, this.notifications);
      }
    } catch {
      // silent
    }
  }

  private isoNowRounded(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString();
  }
}
