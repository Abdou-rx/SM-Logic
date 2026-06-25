/**
 * Simulation types for tick-based evaluation.
 *
 * Scrap Mechanic runs at 40 ticks/second. Each gate has a 1-tick
 * propagation delay. The simulation faithfully models this behavior.
 */

/** Result of a single tick step */
export interface TickResult {
  readonly tickNumber: number;
  readonly inputStates: Readonly<Record<string, boolean>>;
  readonly outputStates: Readonly<Record<string, boolean>>;
  readonly allStates: Readonly<Record<string, boolean>>;
  readonly changed: boolean;
}

/** Waveform sample point for VCD export */
export interface WaveformPoint {
  readonly tick: number;
  readonly signals: Readonly<Record<string, boolean>>;
}

/** Complete waveform recording */
export interface WaveformRecord {
  readonly signalNames: readonly string[];
  readonly points: readonly WaveformPoint[];
  readonly totalTicks: number;
}

/** VCD (Value Change Dump) file for waveform viewers like GTKWave */
export interface VCDExportOptions {
  readonly timescale: string;
  readonly moduleName: string;
}

/** Simulation configuration */
export interface SimulationConfig {
  readonly maxTicks: number;
  readonly stopOnStable: boolean;
  readonly stableThreshold: number;
  readonly recordWaveform: boolean;
}

/** Default simulation configuration */
export const DEFAULT_SIM_CONFIG: SimulationConfig = {
  maxTicks: 1000,
  stopOnStable: true,
  stableThreshold: 3,
  recordWaveform: false,
} as const;

/** Timing constants from Scrap Mechanic */
export const SM_TIMING = {
  /** Frames per second in Scrap Mechanic */
  FRAME_RATE: 40,
  /** Duration of one tick in seconds */
  TICK_DURATION: 0.025,
  /** Milliseconds per tick */
  TICK_MS: 25,
} as const;
