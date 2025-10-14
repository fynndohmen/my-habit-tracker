// mobile/src/app/services/notification.service.ts
import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  PermissionStatus,
  PendingLocalNotificationSchema,
  Schedule,   // richtiger Typ für schedule
  Weekday,    // 1..7 (Mon..Sun)
} from '@capacitor/local-notifications';

export type HabitNotification = { hour: number; minute: number; days: number[] };

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private _initialized = false;

  /** Beim App-Start einmalig aufrufen (fragt Permission, legt Android-Channel an) */
  async init(): Promise<void> {
    if (this._initialized) return;

    await this.ensurePermission();

    try {
      await LocalNotifications.createChannel({
        id: 'habit-default',
        name: 'Habit reminders',
        description: 'Reminders for your habits',
        importance: 4,   // high
        visibility: 1,   // public
        vibration: true,
      });
    } catch {
      // iOS ignoriert Channels – ok
    }

    this._initialized = true;
  }

  /** Prüft/holt die Anzeige-Erlaubnis (Android 13+/iOS) */
  async ensurePermission(): Promise<boolean> {
    let st: PermissionStatus = await LocalNotifications.checkPermissions();
    if (st.display !== 'granted') {
      st = await LocalNotifications.requestPermissions();
    }
    return st.display === 'granted';
  }

  /** Für ein Habit alle Reminder planen (wiederkehrend je ausgewählter Wochentag).
   *  NEU: Fallback – wenn keine Tage gewählt wurden, => 0..6 (jeden Tag).
   */
  async scheduleForHabit(
    habitId: string,
    title: string,
    notifications: HabitNotification[],
  ): Promise<void> {
    if (!notifications?.length) return;
    const ok = await this.ensurePermission();
    if (!ok) return;

    const normalizeDays = (days?: number[]) =>
      (days && days.length > 0) ? days : [0,1,2,3,4,5,6];

    const pending: PendingLocalNotificationSchema[] = [];

    notifications.forEach((n, idx) => {
      const days = normalizeDays(n.days);

      days.forEach((d) => {
        // Unsere Tage 0..6 (Mon..So) → Capacitor: 1..7 (Mon..So)
        const raw = (d + 1) | 0;
        const clamped = Math.min(7, Math.max(1, raw));
        const wd = clamped as unknown as Weekday;

        const schedule: Schedule = {
          repeats: true,
          on: { weekday: wd, hour: n.hour, minute: n.minute },
          allowWhileIdle: true,
        } as Schedule;

        const id = this.makeId(habitId, idx, d);

        const notif = {
          id,
          title,
          body: 'Time to work on your habit.',
          schedule,
          smallIcon: 'ic_stat_notify', // optional; falls nicht vorhanden, nutzt Capacitor das App-Icon
          channelId: 'habit-default',
          extra: { habitId, idx, weekday: d },
        } as unknown as PendingLocalNotificationSchema;

        pending.push(notif);
      });
    });

    if (pending.length) {
      await LocalNotifications.schedule({ notifications: pending as any });
    }
  }

  /** Alle Reminder für ein Habit entfernen.
   *  Wenn Notifications mitgegeben werden: IDs daraus ableiten (mit gleichem Fallback für days).
   *  Sonst: Pending holen und anhand extra.habitId filtern.
   */
  async cancelForHabit(habitId: string, notifications?: HabitNotification[]): Promise<void> {
    const normalizeDays = (days?: number[]) =>
      (days && days.length > 0) ? days : [0,1,2,3,4,5,6];

    const ids: number[] = [];
    (notifications ?? []).forEach((n, idx) =>
      normalizeDays(n.days).forEach((d) => ids.push(this.makeId(habitId, idx, d)))
    );

    if (ids.length) {
      await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) as any });
      return;
    }

    // Fallback: alles mit habitId im extra löschen
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications
      .filter((n) => (n?.extra as any)?.habitId === habitId)
      .map((n) => ({ id: n.id }));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours as any });
  }

  // Stabiler numerischer ID-Build aus Habit-ID + Index + Wochentag
  private makeId(habitId: string, idx: number, day: number): number {
    let hash = 0;
    for (let i = 0; i < habitId.length; i++) hash = (hash * 31 + habitId.charCodeAt(i)) | 0;
    const base = Math.abs(hash) % 0x7fffff;
    return base + (idx + 1) * 100 + (day + 1);
  }
}
