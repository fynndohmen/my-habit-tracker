import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle,
  IonContent, IonList, IonItem, IonButton, IonModal, IonDatetime, IonIcon
} from '@ionic/angular/standalone';

import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HabitService } from '../../habit.service';
import { NotificationService, HabitNotification as Notif } from '../../services/notification.service';

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
  private readonly router = inject(Router);
  private readonly habitSvc = inject(HabitService);
  private readonly notifSvc = inject(NotificationService);

  habitId = '';
  habitName = '';

  /** Arbeitskopie – persistiert wird erst per saveAll() */
  notifications: Notif[] = [];

  /** Originalzustand zum Vergleichen (nicht mutieren!) */
  private originalNotifications: Notif[] = [];
  originalHadAny = false;

  // Modal-State
  notifOpen = false;
  notifTimeIso = this.isoNowRounded();
  tempDays: number[] = []; // 0..6 (Mo..So)
  readonly WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  constructor() {
    addIcons({ 'add-outline': addOutline });

    // Route-Param & vorhandene Daten laden
    this.habitId = this.route.snapshot.paramMap.get('id') ?? '';
    const habit = this.habitSvc.getHabitByIdSync(this.habitId);
    if (habit) {
      this.habitName = habit.name;
      // Arbeitskopie
      this.notifications = [...(habit.notifications ?? [])];
      // Original kopieren & normalisieren für sauberen Vergleich
      this.originalNotifications = this.normalizeNotifs(habit.notifications ?? []);
      this.originalHadAny = this.originalNotifications.length > 0;
    }
  }

  // Anzeige-Helfer
  trackByIndex = (index: number, _item: Notif) => index;

  formatTime(h: number, m: number): string {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  formatDays(days: number[]): string {
    const labels = ['Mo','Tu','We','Th','Fr','Sa','Su'];
    return labels.filter((_, i) => days.includes(i)).join(', ');
  }

  // ===== Modal (nur lokale Änderungen; kein Persist) =====
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
    if (i >= 0) this.tempDays.splice(i, 1);
    else this.tempDays.push(idx);
    this.tempDays.sort((a, b) => a - b);
  }

  /** Modal-"Save": nur lokal zur Liste hinzufügen */
  async confirmNotif(): Promise<void> {
    const d = new Date(this.notifTimeIso || new Date());
    const hour = d.getHours();
    const minute = d.getMinutes();
    const days = this.tempDays.length ? [...this.tempDays] : [0,1,2,3,4,5,6]; // Default Mo–So
    this.notifications.push({ hour, minute, days });
    this.notifOpen = false;
  }

  /** Entfernen: nur lokal */
  removeNotif(i: number): void {
    if (i >= 0 && i < this.notifications.length) {
      this.notifications.splice(i, 1);
    }
  }

  // ===== Persistenz & Scheduling: nur per Seiten-"Save" =====
  async saveAll(): Promise<void> {
    await this.persistAndReschedule();
    // Danach zurück zur Settings-Seite
    await this.router.navigateByUrl('/settings');
  }

  /** Persistiert aktuelle Liste und plant Notifications neu */
  private async persistAndReschedule(): Promise<void> {
    if (!this.habitId) return;
    const habit = this.habitSvc.getHabitByIdSync(this.habitId);
    if (!habit) return;

    // 1) Service aktualisieren
    this.habitSvc.updateHabitNotifications(this.habitId, this.notifications);

    // 2) Local Notifications neu planen
    try {
      await this.notifSvc.cancelForHabit(this.habitId, habit.notifications);
      const granted = await this.notifSvc.ensurePermission();
      if (granted) {
        await this.notifSvc.scheduleForHabit(this.habitId, habit.name, this.notifications);
      }
    } catch {
      // bewusst still
    }
    // Originalzustand aktualisieren (optional: falls auf der Seite weitergearbeitet wird)
    this.originalNotifications = this.normalizeNotifs(this.notifications);
    this.originalHadAny = this.originalNotifications.length > 0;
  }

  /** Sichtbarkeitslogik: Save nur zeigen, wenn
   *  - das Habit ursprünglich Notifications hatte (Button darf direkt sichtbar sein), ODER
   *  - Änderungen vorgenommen wurden (auch wenn Liste jetzt leer ist).
   */
  get showSave(): boolean {
    return this.originalHadAny || this.hasChanges();
  }

  /** Deep-Equal-Vergleich von Original vs. aktueller Arbeitskopie */
  hasChanges(): boolean {
    const a = this.originalNotifications;
    const b = this.normalizeNotifs(this.notifications);
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i], bi = b[i];
      if (ai.hour !== bi.hour || ai.minute !== bi.minute) return true;
      if (ai.days.length !== bi.days.length) return true;
      for (let j = 0; j < ai.days.length; j++) {
        if (ai.days[j] !== bi.days[j]) return true;
      }
    }
    return false;
  }

  /** Normalisiert eine Notif-Liste (sortiert Einträge & day-Arrays) für stabilen Vergleich */
  private normalizeNotifs(list: Notif[]): Notif[] {
    const clone = list.map(n => ({
      hour: n.hour | 0,
      minute: n.minute | 0,
      days: [...(n.days ?? [])].map(d => d | 0).sort((x, y) => x - y),
    }));
    clone.sort((x, y) => x.hour - y.hour || x.minute - y.minute || compareArr(x.days, y.days));
    return clone;

    function compareArr(a: number[], b: number[]) {
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i++) {
        const av = a[i] ?? -1, bv = b[i] ?? -1;
        if (av !== bv) return av - bv;
      }
      return 0;
    }
  }

  private isoNowRounded(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString();
  }
}
