import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
  IonContent, IonList, IonItem, IonInput, IonButton,
  IonModal, IonDatetime, IonIcon
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { HabitService, Period } from '../../habit.service';
import { NotificationService, HabitNotification as Notif } from '../../services/notification.service';
import { addIcons } from 'ionicons';
import { alarmOutline } from 'ionicons/icons';

@Component({
  standalone: true,
  selector: 'app-add-habit',
  templateUrl: './add-habit.page.html',
  styleUrls: ['./add-habit.page.scss'],
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
    IonContent, IonList, IonItem, IonInput, IonButton,
    IonModal, IonDatetime, IonIcon
  ],
})
export class AddHabitPage {
  constructor() {
    addIcons({ 'alarm-outline': alarmOutline });
  }

  name = '';
  repeats = 1;
  period: Period = 'day'; // 'day' | 'week' | 'month'

  notifications: Notif[] = [];

  // Modal-State
  notifOpen = false;
  notifTimeIso = this.isoNowRounded();
  readonly WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  tempDays: number[] = [];

  private readonly habitSvc = inject(HabitService);
  private readonly router = inject(Router);
  private readonly notifSvc = inject(NotificationService);

  /** Period umschalten */
  setPeriod(p: Period) { this.period = p; }

  /** Stepper */
  inc(): void { this.repeats = Math.min(999, (this.repeats || 1) + 1); }
  dec(): void { this.repeats = Math.max(1, (this.repeats || 1) - 1); }

  /** Modal öffnen/schließen */
  openNotifModal(): void {
    this.notifTimeIso = this.isoNowRounded();
    this.tempDays = [];
    this.notifOpen = true;
  }
  closeNotif(): void { this.notifOpen = false; }

  /** Zeit aus IonDatetime übernehmen */
  onTimePicked(ev: CustomEvent) {
    const v = (ev?.detail as any)?.value;
    if (typeof v === 'string') this.notifTimeIso = v;
  }

  /** Wochentage toggeln */
  toggleDay(idx: number): void {
    const i = this.tempDays.indexOf(idx);
    if (i >= 0) this.tempDays.splice(i, 1);
    else this.tempDays.push(idx);
    this.tempDays.sort((a, b) => a - b);
  }

  /** Notification bestätigen – wenn keine Tage gewählt: Default = alle Tage */
  confirmNotif(): void {
    const d = new Date(this.notifTimeIso || new Date());
    const hour = d.getHours();
    const minute = d.getMinutes();
    const days = this.tempDays.length ? [...this.tempDays] : [0,1,2,3,4,5,6]; // Default Mo–So
    this.notifications.push({ hour, minute, days });
    this.closeNotif();
  }

  /** Entfernen (per Index) */
  removeNotif(i: number): void {
    if (i >= 0 && i < this.notifications.length) {
      this.notifications.splice(i, 1);
    }
  }

  /** trackBy: korrekte Signatur (index, item) */
  trackByIndex = (index: number, _item: Notif) => index;

  formatDays(days: number[]): string {
    const labels = this.WEEKDAYS;
    return labels.filter((_, i) => days.includes(i)).join(', ');
  }

  private isoNowRounded(): string { const d = new Date(); d.setSeconds(0,0); return d.toISOString(); }

  /** Save: Habit + Notifications persistieren und (falls erlaubt) planen */
  async save(): Promise<void> {
    const n = this.name.trim();
    if (!n) return;

    const r = Math.max(1, Math.floor(this.repeats || 1));
    const newId = this.habitSvc.addHabit(n, r, this.period, this.notifications);

    if (this.notifications.length > 0) {
      const granted = await this.notifSvc.ensurePermission();
      if (granted) {
        await this.notifSvc.scheduleForHabit(newId, n, this.notifications);
      }
    }

    await this.router.navigateByUrl('/');
  }
}
