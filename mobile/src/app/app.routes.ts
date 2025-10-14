// mobile/src/app/app.routes.ts
import { Routes } from '@angular/router';

import { HabitsPage } from './pages/habits/habits.page';
import { AddHabitPage } from './pages/add-habit/add-habit.page';
import { SettingsPage } from './pages/settings/settings.page';
import { EditNotificationsPage } from './pages/edit-notifications/edit-notifications.page';

export const routes: Routes = [
  { path: '', component: HabitsPage },
  { path: 'add', component: AddHabitPage },
  { path: 'settings', component: SettingsPage },
  { path: 'edit-notifications/:id', component: EditNotificationsPage },
  { path: '**', redirectTo: '' },
];
