import { Component, Input, OnChanges, AfterViewInit, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

type Period = 'day' | 'week' | 'month';

type DoneColored = { x: number; color: string };
type MonthLabel = { x: number; text: string };

@Component({
  standalone: true,
  selector: 'app-checkin-timeline',
  templateUrl: './checkin-timeline.component.html',
  styleUrls: ['./checkin-timeline.component.scss'],
  imports: [CommonModule],
})
export class CheckinTimelineComponent implements OnChanges, AfterViewInit {
  @Input() completedDays: string[] = [];
  @Input() period: Period = 'day';
  @Input() target = 1;

  /** sichtbarer Zeitraum in Tagen (0/negativ = gesamte Historie) */
  @Input() daysBack = 90;

  /** Zeichengröße */
  @Input() heightPx = 20;
  @Input() stepPx = 6;

  /** Monatskürzel unter der Linie */
  @Input() showMonthLabels = true;

  /** Start: volle ISO (wir normalisieren intern auf lokale Mitternacht) */
  @Input() startDateIso?: string;

  /** Starttag der *aktuellen* Serie – trennt neue Serie farblich von der alten */
  @Input() epoch?: string;

  /** Harte Grenzen (YYYY-MM-DD), über die keine Tages-Blocks verbunden werden */
  @Input() barriers: string[] = [];

  /** View-Model für Template */
  view = {
    widthPx: 0,
    heightPx: 0,
    baselineY: 0,
    tickTop: 0,
    tickBottom: 0,
    tickXs: [] as number[],
    doneColored: [] as DoneColored[],
    monthLabels: [] as MonthLabel[],
  };

  constructor(private host: ElementRef<HTMLElement>) {}

  // ===== Date helpers =====
  private todayKey(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  private dateKeyLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).toString().padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  private addDaysKey(key: string, delta: number): string {
    const d = new Date(key + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return this.dateKeyLocal(d);
  }

  private weekKeyOf(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(n => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    const thursday = new Date(dt.getTime());
    thursday.setDate(dt.getDate() + (4 - ((dt.getDay() + 6) % 7)));
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((+thursday - +yearStart) / 86400000 + 1) / 7);
    const wy = thursday.getFullYear();
    return `${wy}-W${String(weekNo).padStart(2, '0')}`;
  }
  private monthKeyOf(dateKey: string): string {
    return dateKey.slice(0, 7);
  }
  private prevIsoWeek(wk: string): string {
    const [yStr, wStr] = wk.split('-W');
    const y = parseInt(yStr, 10);
    const w = parseInt(wStr, 10);
    const simple = new Date(y, 0, 1 + (w - 1) * 7);
    const dow = (simple.getDay() + 6) % 7;
    simple.setDate(simple.getDate() - dow + 3);
    simple.setDate(simple.getDate() - 7);
    return this.weekKeyOf(this.dateKeyLocal(simple));
  }
  private nextIsoWeek(wk: string): string {
    const [yStr, wStr] = wk.split('-W');
    const y = parseInt(yStr, 10);
    const w = parseInt(wStr, 10);
    const simple = new Date(y, 0, 1 + (w - 1) * 7);
    const dow = (simple.getDay() + 6) % 7;
    simple.setDate(simple.getDate() - dow + 3);
    const plus7 = new Date(simple);
    plus7.setDate(plus7.getDate() + 7);
    return this.weekKeyOf(this.dateKeyLocal(plus7));
  }
  private prevMonthKey(mk: string): string {
    let [y, m] = mk.split('-').map(n => parseInt(n, 10));
    m -= 1; if (m < 1) { m = 12; y -= 1; }
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  private nextMonthKey(mk: string): string {
    let [y, m] = mk.split('-').map(n => parseInt(n, 10));
    m += 1; if (m > 12) { m = 1; y += 1; }
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  /** Farblogik wie im restlichen UI */
  private colorForStreakDays(days: number): string {
    if (days >= 365) return '#ef4444';
    if (days >= 186) return '#d946ef';
    if (days >= 93)  return '#3b82f6';
    if (days >= 31)  return '#06b6d4';
    if (days >= 7)   return '#22c55e';
    return '#ffc400';
  }

  ngAfterViewInit(): void {
    this.scrollToRightIfOverflow();
  }

  ngOnChanges(): void {
    this.computeView();
    this.scrollToRightIfOverflow();
  }

  /** Scrollt nach ganz rechts (heute), *nur wenn* der Inhalt breiter ist als der Host.
   *  Kurze Timelines bleiben unberührt → vorhandene Zentrierung (CSS/Elternlayout) bleibt erhalten.
   */
  private scrollToRightIfOverflow(): void {
    // Zwei rAFs, damit DOM/Layout sicher fertig ist.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = this.host.nativeElement;
        // Falls der Host intern zusätzliche Wrapper hat, ist scrollWidth/Left des Hosts selbst korrekt,
        // weil :host das Overflow handhabt.
        const canScroll = el.scrollWidth > el.clientWidth + 1; // +1 gegen Rundungsartefakte
        if (canScroll) {
          el.scrollLeft = el.scrollWidth - el.clientWidth; // ganz rechts
        }
        // Wenn nicht scrollbar → nichts setzen (kein erzwungenes Links-Ausrichten).
      });
    });
  }

  private computeView(): void {
    const today = this.todayKey();
    const allDone = Array.from(new Set(this.completedDays ?? [])).sort();

    // --- frühestes Datum bestimmen (Gesamthistorie) ---
    let createdKey: string | null = null;
    if (this.startDateIso) {
      const d = new Date(this.startDateIso);
      if (!isNaN(+d)) createdKey = this.dateKeyLocal(d);
    }
    const earliestDone = allDone.length ? allDone[0] : null;
    let earliestKey = createdKey && earliestDone ? (createdKey < earliestDone ? createdKey : earliestDone)
                     : createdKey || earliestDone || today;

    // daysBack <= 0  => gesamte Historie; sonst Fenster
    if (this.daysBack > 0) {
      const todayDate = new Date();
      const minKeyByDaysBack = this.dateKeyLocal(new Date(
        todayDate.getFullYear(),
        todayDate.getMonth(),
        todayDate.getDate() - (this.daysBack - 1)
      ));
      // sichtbarer Start = max(Fensterstart, earliestKey)
      earliestKey = (earliestKey > minKeyByDaysBack) ? earliestKey : minKeyByDaysBack;
    }

    // ---- Schlüssel (sichtbarer Bereich) [earliestKey..today] ----
    const keys: string[] = [];
    {
      const start = new Date(earliestKey + 'T00:00:00');
      const end = new Date(today + 'T00:00:00');
      for (let dt = new Date(start); +dt <= +end; dt.setDate(dt.getDate() + 1)) {
        keys.push(this.dateKeyLocal(dt));
      }
    }

    // ---- **globale** Schlüssel (für Blockfarbe immer volle Historie) ----
    const globalStartKey = (createdKey || earliestKey);
    const globalKeys: string[] = [];
    {
      const start = new Date(globalStartKey + 'T00:00:00');
      const end = new Date(today + 'T00:00:00');
      for (let dt = new Date(start); +dt <= +end; dt.setDate(dt.getDate() + 1)) {
        globalKeys.push(this.dateKeyLocal(dt));
      }
    }

    const doneSet = new Set(allDone);

    // ---- Geometrie ----
    const n = keys.length;
    const widthPx = Math.max(1, n * this.stepPx);
    const heightPx = this.heightPx;
    const baselineY = Math.floor(heightPx * 0.5);
    const tickHalf = Math.max(6, Math.round(heightPx * 0.35));
    const tickTop = baselineY - tickHalf;
    const tickBottom = baselineY + tickHalf;

    const tickXs = Array.from({ length: n }, (_, i) => i * this.stepPx + Math.floor(this.stepPx / 2));

    // ---- Monatskürzel (unter der Linie) ----
    const monthLabels: MonthLabel[] = [];
    if (this.showMonthLabels) {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k.endsWith('-01')) {
          const d = new Date(k + 'T00:00:00');
          const txt = d.toLocaleString(undefined, { month: 'short' });
          monthLabels.push({ x: tickXs[i], text: txt });
        }
      }
    }

    // ---- Färbung: blockweise – Farbe aus **gesamter** Historie berechnet ----
    const doneColored: DoneColored[] = [];
    const YELLOW = '#ffc400';

    if (this.period === 'day') {
      // globale Blockfarben auf Tagesebene (Barrieren/Epoch beachten)
      const barrier = (this.barriers && this.barriers.length)
        ? [...this.barriers].sort().slice(-1)[0]
        : undefined;
      const epoch = this.epoch;

      const colorByDay = new Map<string, string>();

      let i = 0;
      while (i < globalKeys.length) {
        const k = globalKeys[i];
        if (!doneSet.has(k)) { i++; continue; }

        // Block aufspannen (nur zusammenhängende Tage, Barrieren/Epoch stoppen)
        let j = i;
        while (j + 1 < globalKeys.length) {
          const a = globalKeys[j];
          const b = globalKeys[j + 1];

          const aNext = this.addDaysKey(a, 1);
          if (aNext !== b) break;

          const crossesBarrier = barrier ? (a <= barrier && b > barrier) : false;
          const crossesEpoch   = epoch   ? (a <  epoch   && b >= epoch)   : false;
          if (crossesBarrier || crossesEpoch) break;

          if (!doneSet.has(b)) break;
          j++;
        }

        const blockLen = j - i + 1;
        const color = this.colorForStreakDays(blockLen);
        for (let t = i; t <= j; t++) {
          const dayKey = globalKeys[t];
          if (doneSet.has(dayKey)) colorByDay.set(dayKey, color);
        }
        i = j + 1;
      }

      // sichtbarer Bereich einfärben
      for (let idx = 0; idx < keys.length; idx++) {
        const k = keys[idx];
        if (!doneSet.has(k)) continue;
        const c = colorByDay.get(k) ?? YELLOW; // falls globaler Block nicht erkannt wurde
        doneColored.push({ x: tickXs[idx], color: c });
      }
    } else if (this.period === 'week') {
      // Wochen: Blocks = aufeinanderfolgende **volle** Wochen; letzter Block darf aktuelle **partielle** Woche anhängen
      const byWeek = new Map<string, number>();
      for (const d of allDone) {
        const wk = this.weekKeyOf(d);
        byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
      }

      // globale Wochenliste (volle Historie)
      const firstWkGlobal = this.weekKeyOf(globalKeys[0]);
      const lastWkGlobal  = this.weekKeyOf(globalKeys[globalKeys.length - 1]);
      const weeksGlobal: string[] = [];
      {
        let wk = firstWkGlobal;
        while (true) {
          weeksGlobal.push(wk);
          if (wk === lastWkGlobal) break;
          wk = this.nextIsoWeek(wk);
        }
      }

      const isFull = (wk: string) => (byWeek.get(wk) ?? 0) >= Math.max(1, this.target || 1);
      const thisWk = this.weekKeyOf(today);
      const cntThis = byWeek.get(thisWk) ?? 0;

      // Blöcke global ermitteln
      const blocks: string[][] = [];
      let cur: string[] = [];
      for (const wk of weeksGlobal) {
        if (isFull(wk)) {
          if (!cur.length) cur = [wk]; else cur.push(wk);
        } else {
          if (cur.length) { blocks.push(cur); cur = []; }
        }
      }
      if (cur.length) blocks.push(cur);

      // aktuelle partielle Woche ggf. anhängen
      if (blocks.length > 0 && cntThis > 0) {
        const lastBlock = blocks[blocks.length - 1];
        const nextToLast = this.nextIsoWeek(lastBlock[lastBlock.length - 1]);
        if (nextToLast === thisWk) {
          lastBlock.push(thisWk);
        }
      }

      // Farbzuordnung je Woche global
      const colorByWeek = new Map<string, string>();
      for (const block of blocks) {
        let totalDays = 0;
        for (const wk of block) totalDays += (byWeek.get(wk) ?? 0);
        const color = this.colorForStreakDays(totalDays);
        for (const wk of block) colorByWeek.set(wk, color);
      }

      // sichtbarer Bereich einfärben
      for (let idx = 0; idx < keys.length; idx++) {
        const k = keys[idx];
        if (!doneSet.has(k)) continue;
        const wk = this.weekKeyOf(k);
        const col = colorByWeek.get(wk) ?? YELLOW;
        doneColored.push({ x: tickXs[idx], color: col });
      }
    } else { // month
      const byMonth = new Map<string, number>();
      for (const d of allDone) {
        const mk = this.monthKeyOf(d);
        byMonth.set(mk, (byMonth.get(mk) ?? 0) + 1);
      }

      const firstMkGlobal = this.monthKeyOf(globalKeys[0]);
      const lastMkGlobal  = this.monthKeyOf(globalKeys[globalKeys.length - 1]);
      const monthsGlobal: string[] = [];
      {
        let mk = firstMkGlobal;
        while (true) {
          monthsGlobal.push(mk);
          if (mk === lastMkGlobal) break;
          mk = this.nextMonthKey(mk);
        }
      }

      const isFullM = (mk: string) => (byMonth.get(mk) ?? 0) >= Math.max(1, this.target || 1);
      const thisMk = this.monthKeyOf(today);
      const cntThisM = byMonth.get(thisMk) ?? 0;

      const blocksM: string[][] = [];
      let curM: string[] = [];
      for (const mk of monthsGlobal) {
        if (isFullM(mk)) {
          if (!curM.length) curM = [mk]; else curM.push(mk);
        } else {
          if (curM.length) { blocksM.push(curM); curM = []; }
        }
      }
      if (curM.length) blocksM.push(curM);

      if (blocksM.length > 0 && cntThisM > 0) {
        const lastBlock = blocksM[blocksM.length - 1];
        const nextToLast = this.nextMonthKey(lastBlock[lastBlock.length - 1]);
        if (nextToLast === thisMk) lastBlock.push(thisMk);
      }

      const colorByMonth = new Map<string, string>();
      for (const block of blocksM) {
        let totalDays = 0;
        for (const mk of block) totalDays += (byMonth.get(mk) ?? 0);
        const color = this.colorForStreakDays(totalDays);
        for (const mk of block) colorByMonth.set(mk, color);
      }

      for (let idx = 0; idx < keys.length; idx++) {
        const k = keys[idx];
        if (!doneSet.has(k)) continue;
        const mk = this.monthKeyOf(k);
        const col = colorByMonth.get(mk) ?? YELLOW;
        doneColored.push({ x: tickXs[idx], color: col });
      }
    }

    // Alles in view packen
    this.view = {
      widthPx,
      heightPx,
      baselineY,
      tickTop,
      tickBottom,
      tickXs,
      doneColored,
      monthLabels,
    };
  }
}
