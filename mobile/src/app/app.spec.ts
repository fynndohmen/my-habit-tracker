/// <reference types="jest" />

import { TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AppComponent } from './app';

// Mocks für Abhängigkeiten der AppComponent
import { Router } from '@angular/router';
import { Platform, NavController, ToastController } from '@ionic/angular';
import { NotificationService } from './services/notification.service';

describe('AppComponent', () => {
  // --- einfache Stubs/Mocks ---
  const platformReadyPromise = Promise.resolve();

  const platformStub: Partial<Platform> = {
    ready: () => platformReadyPromise as any,
    // backButton.subscribeWithPriority(...) wird in app.ts verwendet:
    backButton: {
      subscribeWithPriority: (_priority: number, _handler: () => void) => {
        // no-op; könnte ein unsubscribe zurückgeben
        return { unsubscribe: () => void 0 } as any;
      },
    } as any,
  };

  const routerStub: Partial<Router> = {
    url: '/',
    navigateByUrl: jest.fn().mockResolvedValue(true),
  };

  const navCtrlStub: Partial<NavController> = {
    back: jest.fn(),
  };

  const toastCtrlStub: Partial<ToastController> = {
    create: jest.fn().mockResolvedValue({
      present: jest.fn(),
      dismiss: jest.fn(),
    } as any),
  };

  const notifStub: Partial<NotificationService> = {
    init: jest.fn().mockResolvedValue(void 0),
    ensurePermission: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent], // Standalone-Komponente direkt importieren
      providers: [
        { provide: Platform, useValue: platformStub },
        { provide: Router, useValue: routerStub },
        { provide: NavController, useValue: navCtrlStub },
        { provide: ToastController, useValue: toastCtrlStub },
        { provide: NotificationService, useValue: notifStub },
      ],
      // ion-* Elemente etc. nicht bemängeln
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const comp = fixture.componentInstance;
    expect(comp).toBeTruthy();
  });
});
