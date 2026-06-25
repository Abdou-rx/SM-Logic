/**
 * WaveformRecorder records signal states at each tick during simulation.
 *
 * It can export recorded waveforms to VCD (Value Change Dump) format
 * for viewing in waveform viewers like GTKWave.
 */

import type { WaveformPoint, VCDExportOptions, WaveformRecord } from "../types/simulation.js";

/**
 * Character set used for VCD signal identifiers.
 * Extended identifiers use multi-character sequences when >62 signals.
 */
const VCD_ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

/**
 * Generate a unique VCD identifier for a given signal index.
 * Uses single characters for indices 0-62, multi-character identifiers beyond.
 */
function generateVCDIdentifier(index: number): string {
  if (index < VCD_ID_CHARS.length) {
    return VCD_ID_CHARS[index]!;
  }
  // Multi-character identifiers for many signals
  let id = "";
  let remaining = index - VCD_ID_CHARS.length;
  const base = VCD_ID_CHARS.length;
  id += VCD_ID_CHARS[remaining % base]!;
  remaining = Math.floor(remaining / base);
  while (remaining > 0) {
    remaining -= 1;
    id = VCD_ID_CHARS[remaining % base]! + id;
    remaining = Math.floor(remaining / base);
  }
  return id;
}

/**
 * WaveformRecorder records signal states at each tick during simulation.
 *
 * Usage:
 * 1. Optionally call initSignals() to pre-register signal names.
 * 2. Call record() at each tick with the current signal states.
 * 3. Call getPoints() to retrieve recorded waveform data.
 * 4. Call exportVCD() to generate a VCD file string.
 * 5. Call clear() to reset for a new recording session.
 */
export class WaveformRecorder {
  private points: WaveformPoint[] = [];
  private signalNames: string[] = [];
  private signalSet: Set<string> = new Set();

  /**
   * Initialize tracking for a set of signals.
   * All signals start as LOW (false). Not required if signals are
   * registered automatically via record().
   */
  initSignals(signalNames: readonly string[]): void {
    for (const name of signalNames) {
      if (!this.signalSet.has(name)) {
        this.signalSet.add(name);
        this.signalNames.push(name);
      }
    }
  }

  /**
   * Record a single signal value change at a given tick.
   * If the signal is not yet tracked, it is registered automatically.
   */
  recordChange(tick: number, signal: string, value: boolean): void {
    if (!this.signalSet.has(signal)) {
      this.signalSet.add(signal);
      this.signalNames.push(signal);
    }

    // Merge into existing point at this tick, or create new point
    const existingPoint = this.findOrCreatePoint(tick);
    const signals = { ...existingPoint.signals, [signal]: value };
    this.points[this.points.indexOf(existingPoint)] = { tick, signals };
  }

  /**
   * Record the current state of all signals at a given tick.
   * Uses a Map<string, boolean> (compatibility with SimulationEngine).
   */
  recordState(tick: number, signals: ReadonlyMap<string, boolean>): void {
    const stateObj: Record<string, boolean> = {};
    for (const [signal, value] of signals) {
      stateObj[signal] = value;
    }
    this.record(tick, stateObj);
  }

  /**
   * Record all signal states at a given tick.
   * New signal names are registered automatically.
   *
   * @param tick - The tick number
   * @param states - Record mapping signal name to boolean value
   */
  record(tick: number, states: Record<string, boolean>): void {
    // Register any new signal names
    for (const name of Object.keys(states)) {
      if (!this.signalSet.has(name)) {
        this.signalSet.add(name);
        this.signalNames.push(name);
      }
    }

    this.points.push({
      tick,
      signals: { ...states },
    });
  }

  /**
   * Get all recorded waveform points in chronological order.
   */
  getPoints(): WaveformPoint[] {
    return [...this.points];
  }

  /**
   * Get the signal recording order.
   */
  getSignalOrder(): readonly string[] {
    return [...this.signalNames];
  }

  /**
   * Get the last known value of a signal.
   */
  getLastValue(signal: string): boolean {
    for (let i = this.points.length - 1; i >= 0; i--) {
      const point = this.points[i]!;
      if (signal in point.signals) {
        return point.signals[signal] ?? false;
      }
    }
    return false;
  }

  /**
   * Get the total number of recorded changes across all signals.
   */
  getTotalChanges(): number {
    let total = 0;
    let prevSignals: Record<string, boolean> = {};

    for (const point of this.points) {
      for (const name of this.signalNames) {
        const current = point.signals[name] ?? false;
        const prev = prevSignals[name] ?? false;
        if (current !== prev) {
          total++;
        }
      }
      prevSignals = { ...point.signals };
    }

    return total;
  }

  /**
   * Export the recorded waveform to VCD (Value Change Dump) format.
   * VCD files can be viewed in tools like GTKWave.
   *
   * @param options - VCD export configuration (timescale, module name)
   * @returns VCD file content as a string
   */
  exportVCD(options: VCDExportOptions): string {
    const lines: string[] = [];

    // Header section
    lines.push("$date");
    lines.push(`   ${new Date().toISOString()}`);
    lines.push("$end");
    lines.push("$version");
    lines.push("   SM Logic Tool VCD Export");
    lines.push("$end");
    lines.push("$timescale");
    lines.push(`   ${options.timescale}`);
    lines.push("$end");
    lines.push("");

    // Signal definitions
    const idMap = new Map<string, string>();
    lines.push(`$scope module ${options.moduleName} $end`);
    for (let i = 0; i < this.signalNames.length; i++) {
      const name = this.signalNames[i]!;
      const id = generateVCDIdentifier(i);
      idMap.set(name, id);
      lines.push(`$var wire 1 ${id} ${name} $end`);
    }
    lines.push("$upscope $end");
    lines.push("");

    // Initial values (all LOW)
    lines.push("$dumpvars");
    for (const name of this.signalNames) {
      lines.push(`0${idMap.get(name)}`);
    }
    lines.push("$end");

    // Value changes over time — only emit when a value actually changes
    const prevValues = new Map<string, boolean>();
    for (const name of this.signalNames) {
      prevValues.set(name, false);
    }

    for (const point of this.points) {
      const changes: string[] = [];

      for (const name of this.signalNames) {
        const newValue = point.signals[name] ?? false;
        const oldValue = prevValues.get(name) ?? false;

        if (newValue !== oldValue) {
          const id = idMap.get(name);
          if (id !== undefined) {
            changes.push(`${newValue ? "1" : "0"}${id}`);
            prevValues.set(name, newValue);
          }
        }
      }

      if (changes.length > 0) {
        lines.push(`#${point.tick}`);
        for (const change of changes) {
          lines.push(change);
        }
      }
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Format VCD content using default options (25ms timescale, "sm_logic" module).
   */
  vcdToString(): string {
    return this.exportVCD({
      timescale: "25ms",
      moduleName: "sm_logic",
    });
  }

  /**
   * Get all recorded waveforms as WaveformRecord objects.
   * Returns a single record containing all signals and points.
   */
  getAllWaveforms(): WaveformRecord[] {
    if (this.points.length === 0) {
      return [];
    }

    return [
      {
        signalNames: [...this.signalNames],
        points: [...this.points],
        totalTicks: this.points.length,
      },
    ];
  }

  /**
   * Clear all recorded waveform data and reset signal tracking.
   */
  clear(): void {
    this.points = [];
    this.signalNames = [];
    this.signalSet = new Set();
  }

  /**
   * Reset the recorder (alias for clear).
   */
  reset(): void {
    this.clear();
  }

  // --- Private helpers ---

  /**
   * Find an existing point at the given tick, or create a new one.
   */
  private findOrCreatePoint(tick: number): WaveformPoint {
    const existing = this.points.find((p) => p.tick === tick);
    if (existing !== undefined) {
      return existing;
    }
    const newPoint: WaveformPoint = { tick, signals: {} };
    this.points.push(newPoint);
    return newPoint;
  }
}
