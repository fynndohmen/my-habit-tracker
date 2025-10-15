import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

type MonthMark = { x: number; label: string; leftPct: number };

@Component({
  standalone: true,
  selector: 'app-checkin-timeline',
  imports: [CommonModule],
  templateUrl: './checkin-timeline.component.html',
  styleUrls: ['./checkin-timeline.component.scss'],
})
export class CheckinTimelineComponent implements OnChanges {
  /** ISO-Keys 'YYYY-MM-DD' der erfüllten Tage */
  @Input() completedDays: string[] = [];
  /** wie viele Tage rückwärts ab heute dargestellt werden (rechts = heute) */
  @Input() daysBack = 90; // ~3 Monate
  /** Höhe der Tick-Zone (px) – ohne Label-Zone darunter */
  @Input() heightPx = 20;
  /** vertikaler Abstand zwischen Tick-Unterkante und Monatslabel (px) */
  @Input() labelGapPx = 10;

  /** Logische Breite (für saubere Interpolation entlang der X-Achse) */
  private readonly LOGICAL_WIDTH = 1000;

  // ViewBox-Größe
  widthViewBox = this.LOGICAL_WIDTH;

  // Y-Positionen in der Tick-Zone
  yBase = 0;
  yTickTop = 0;
  yTickBottom = 0;

  // X-Positionen der Ticks
  ticksAllX: number[] = [];   // alle Tage (Basisfarbe)
  ticksDoneX: number[] = [];  // erfüllte Tage (gelb)

  // Monatskürzel (x + Prozent für Overlay)
  monthMarks: MonthMark[] = [];

  ngOnChanges(_: SimpleChanges): void {
    this.recompute();
  }

  private recompute(): void {
    // Vertikale Positionen
    this.yBase = Math.floor(this.heightPx * 0.55);
    this.yTickTop = Math.floor(this.heightPx * 0.10);
    this.yTickBottom = Math.floor(this.heightPx * 0.92);

    const total = Math.max(1, Math.floor(this.daysBack));
    const today = this.dateKeyLocal();
    const done = new Set(this.completedDays ?? []);

    const ticksAll: number[] = [];
    const ticksDone: number[] = [];
    const months: MonthMark[] = [];

    for (let i = 0; i < total; i++) {
      // i=0 ältester Tag, i=total-1 heute (rechts)
      const key = this.keyMinusDays(today, total - 1 - i);
      const ratio = (total === 1) ? 1 : i / (total - 1);
      const x = Math.round(ratio * this.LOGICAL_WIDTH);
      const leftPct = (x / this.LOGICAL_WIDTH) * 100;

      ticksAll.push(x);
      if (done.has(key)) ticksDone.push(x);

      // Monatsbeginn -> Label
      const dObj = new Date(key + 'T00:00:00');
      if (!isNaN(+dObj) && dObj.getDate() === 1) {
        months.push({ x, leftPct, label: this.monthShort(dObj.getMonth()) });
      }
    }

    this.ticksAllX = ticksAll;
    this.ticksDoneX = ticksDone;
    this.monthMarks = months;
    this.widthViewBox = this.LOGICAL_WIDTH;
  }

  // ===== helpers =====
  private dateKeyLocal(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  private keyMinusDays(key: string, delta: number): string {
    const d = new Date(key + 'T00:00:00');
    d.setDate(d.getDate() - delta);
    return this.dateKeyLocal(d);
  }
  private monthShort(m: number): string {
    // 2-stellige Kürzel
    const labels = ['Ja','Fe','Mr','Ap','Ma','Ju','Ju','Au','Se','Ok','No','De'];
    return labels[Math.max(0, Math.min(11, m))];
  }
}
