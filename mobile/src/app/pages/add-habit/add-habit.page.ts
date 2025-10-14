import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
  IonContent, IonList, IonItem, IonInput, IonButton,
  IonModal, IonDatetime
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { HabitService } from '../../habit.service';
import { NotificationService, HabitNotification as Notif } from '../../services/notification.service';

type Period = 'day' | 'week' | 'month';

@Component({
  standalone: true,
  selector: 'app-add-habit',
  templateUrl: './add-habit.page.html',
  styleUrls: ['./add-habit.page.scss'],
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
    IonContent, IonList, IonItem, IonInput, IonButton,
    IonModal, IonDatetime
  ],
})
export class AddHabitPage {
  // --- Formularzustand ---
  name = '';
  repeats = 1;
  period: Period = 'day';

  // Notifications UI-State
  notifications: Notif[] = [];
  notifOpen = false;
  notifTimeIso = this.isoNowRounded();
  readonly WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  tempDays: number[] = [];

  private readonly habitSvc = inject(HabitService);
  private readonly router = inject(Router);
  private readonly notifSvc = inject(NotificationService);

  // ==== Period ====
  setPeriod(p: Period): void {
    this.period = p;
  }

  // ==== Counter ====
  inc(): void { this.repeats = Math.min(999, (this.repeats || 1) + 1); }
  dec(): void { this.repeats = Math.max(1, (this.repeats || 1) - 1); }

  // ==== Notifications Modal ====
  openNotifModal(): void {
    this.notifTimeIso = this.isoNowRounded();
    this.tempDays = [];
    this.notifOpen = true;
  }
  closeNotif(): void { this.notifOpen = false; }

  onTimePicked(ev: CustomEvent): void {
    const val = (ev?.detail as any)?.value;
    if (typeof val === 'string' && val) {
      this.notifTimeIso = val;
    }
  }

  toggleDay(idx: number): void {
    const i = this.tempDays.indexOf(idx);
    if (i >= 0) this.tempDays.splice(i, 1); else this.tempDays.push(idx);
    this.tempDays.sort((a, b) => a - b);
  }

  confirmNotif(): void {
    const d = new Date(this.notifTimeIso || new Date());
    const hour = d.getHours();
    const minute = d.getMinutes();

    // Deutsch: Wenn keine Tage gewählt → Default = alle Tage (täglich)
    const days = this.tempDays.length ? [...this.tempDays] : [0,1,2,3,4,5,6];

    this.notifications.push({ hour, minute, days });
    this.notifOpen = false;
  }

  formatDays(days: number[]): string {
    const labels = ['Mo','Tu','We','Th','Fr','Sa','Su'];
    return labels.filter((_, i) => days.includes(i)).join(', ') || '';
  }

  removeNotif(i: number): void { this.notifications.splice(i, 1); }
  trackByIndex = (index: number) => index; // << wichtig für *ngFor trackBy

  private isoNowRounded(): string { const d = new Date(); d.setSeconds(0,0); return d.toISOString(); }

  // ==== Speichern ====
  async save(): Promise<void> {
    const n = this.name.trim();
    if (!n) return;

    const r = Math.max(1, Math.floor(this.repeats || 1));
    const newId = (this.habitSvc as any).addHabit?.(n, r, this.period, this.notifications);

    if (this.notifications.length > 0) {
      const granted = await this.notifSvc.ensurePermission();
      if (granted && newId) {
        await this.notifSvc.scheduleForHabit(newId, n, this.notifications);
      }
    }

    await this.router.navigateByUrl('/');
  }
}
