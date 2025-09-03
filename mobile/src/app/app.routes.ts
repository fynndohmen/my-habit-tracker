// mobile/src/app/app.routes.ts
import { Routes } from '@angular/router';
import { HabitsPage } from './pages/habits/habits.page';
import { AddHabitPage } from './pages/add-habit/add-habit.page';
import { SettingsPage } from './pages/settings/settings.page';

export const appRoutes: Routes = [
  { path: '', component: HabitsPage },
  { path: 'add', component: AddHabitPage },
  { path: 'settings', component: SettingsPage },
  { path: '**', redirectTo: '' },
];
