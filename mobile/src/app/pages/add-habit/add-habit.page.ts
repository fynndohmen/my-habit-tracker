// mobile/src/app/pages/add-habit/add-habit.page.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Ionic Standalone Components explizit importieren
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonInput,
  IonButton,
} from '@ionic/angular/standalone';

import { Router } from '@angular/router';
import { HabitService } from '../../habit.service';

@Component({
  standalone: true,
  selector: 'app-add-habit',
  templateUrl: './add-habit.page.html',
  styleUrls: ['./add-habit.page.scss'],
  // Wichtig: Back-Button & Co. explizit in "imports", damit sie sicher gebundlet werden
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonButton,
  ],
})
export class AddHabitPage {
  name = '';
  repeats = 1;

  private readonly habitSvc = inject(HabitService);
  private readonly router = inject(Router);

  inc(): void {
    this.repeats = Math.min(99, (this.repeats || 1) + 1);
  }

  dec(): void {
    this.repeats = Math.max(1, (this.repeats || 1) - 1);
  }

  async save(): Promise<void> {
    const n = this.name.trim();
    if (!n) return;

    const r = Math.max(1, Math.floor(this.repeats || 1));
    this.habitSvc.addHabit(n, r);
    await this.router.navigateByUrl('/');
  }
}
