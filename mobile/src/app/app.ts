// mobile/src/app/app.ts
import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {}
