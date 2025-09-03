import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { HabitService } from '../../habit.service';

@Component({
  standalone: true,
  selector: 'app-add-habit',
  templateUrl: './add-habit.page.html',
  styleUrls: ['./add-habit.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule],
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
