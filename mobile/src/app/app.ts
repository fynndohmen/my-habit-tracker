// mobile/src/app/app.ts
import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Platform, NavController, ToastController } from '@ionic/angular';

// Wichtig: Für das Template (Standalone-Imports)
import { IonApp, IonRouterOutlet as IonRouterOutletCmp } from '@ionic/angular/standalone';

// Für das TypeScript-Typing des ViewChild (type-only Import verhindert Namenskonflikt)
import type { IonRouterOutlet } from '@ionic/angular';

// Optional: falls du „Doppelt drücken zum Beenden“ wirklich mit App-Exit willst
// import { App as CapacitorApp } from '@capacitor/app';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.html',
  // Komponenten, die im Template verwendet werden:
  imports: [IonApp, IonRouterOutletCmp],
})
export class AppComponent {
  // Zugriff auf den <ion-router-outlet #routerOutlet>
  @ViewChild('routerOutlet', { static: true }) routerOutlet?: IonRouterOutlet;

  // (optional) Für „Doppelt drücken zum Beenden“ auf Home
  private lastBackPress = 0;
  private readonly exitThresholdMs = 1500;

  // === EXAKTE ROUTEN AUS DEINER app.routes.ts ============================
  // HOME: '' -> URL ist '/'
  private readonly HOME_PATHS = new Set<string>(['/']);       // <<< START-/MAIN-SEITE
  // ADD:  'add' -> '/add'
  private readonly ADD_PATHS = new Set<string>(['/add']);     // <<< ADD-HABIT-SEITE
  // SETTINGS: 'settings' -> '/settings'
  private readonly SETTINGS_PATHS = new Set<string>(['/settings']); // <<< EINSTELLUNGEN
  // EDIT NOTIFICATIONS: 'edit-notifications/:id' -> '/edit-notifications/...'
  private readonly EDIT_NOTIF_PATHS = new Set<string>(['/edit-notifications']);

  // Ziel, wenn wir von Add/Settings „zurück zur Main“ wollen:
  private readonly HOME_REDIRECT = '/';       // Home = '/'

  constructor(
    private platform: Platform,
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController
  ) {
    this.initBackHandling();
  }

  private initBackHandling() {
    this.platform.ready().then(() => {
      // Hohe Priorität, damit unser Handler Vorrang hat
      this.platform.backButton.subscribeWithPriority(10_000, async () => {
        const url = (this.router.url || '/').toLowerCase();

        const isHome = this.matchesAny(url, this.HOME_PATHS);
        const isAdd = this.matchesAny(url, this.ADD_PATHS);
        const isSettings = this.matchesAny(url, this.SETTINGS_PATHS);
        const isEditNotifs = this.matchesAny(url, this.EDIT_NOTIF_PATHS);

        // 1) HOME/MAIN: App NICHT schließen
        if (isHome) {
          // OPTIONAL: Doppelt drücken zum Beenden
          /*
          const now = Date.now();
          if (now - this.lastBackPress < this.exitThresholdMs) {
            CapacitorApp.exitApp();
          } else {
            this.lastBackPress = now;
            const t = await this.toastCtrl.create({ message: 'Press back again to exit', duration: 1000 });
            await t.present();
          }
          */
          return; // Event konsumiert → App bleibt offen
        }

        // 2) EDIT NOTIFICATIONS: Zur SETTINGS-Seite
        if (isEditNotifs) {
          this.router.navigateByUrl('/settings', { replaceUrl: true });
          return;
        }

        // 3) ADD / SETTINGS: Zur Startseite
        if (isAdd || isSettings) {
          this.router.navigateByUrl(this.HOME_REDIRECT, { replaceUrl: true });
          return;
        }

        // 4) Standard: eine Seite zurück (falls möglich)
        if (this.routerOutlet?.canGoBack()) {
          this.navCtrl.back();
          return;
        }

        // 5) Fallback: nichts tun (App bleibt offen)
      });
    });
  }

  // Exakt- oder Präfix-Matches (deckt auch '/settings/...' & '/edit-notifications/...' ab)
  private matchesAny(currentUrl: string, paths: Set<string>): boolean {
    const normalized = currentUrl !== '/' ? currentUrl.replace(/\/+$/, '') : currentUrl;
    for (const p of paths) {
      const candidate = p.toLowerCase();
      if (candidate === '/') {
        if (normalized === '/') return true;
      } else if (normalized === candidate || normalized.startsWith(candidate + '/')) {
        return true;
      }
    }
    return false;
  }
}
