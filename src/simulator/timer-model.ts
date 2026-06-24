/**
 * TimerModel simulates the Scrap Mechanic Timer as a shift register.
 *
 * The timer delays its input signal by N ticks. On each tick, the current
 * input value is shifted into the register, and the oldest value is output.
 * This models the exact behavior of the SM Timer component.
 */

/** Minimum allowed timer delay (ticks) */
const MIN_TIMER_DELAY = 1;

/** Maximum allowed timer delay (ticks) */
const MAX_TIMER_DELAY = 30;

/**
 * Validates a timer delay value.
 * @throws {Error} if delay is not a positive integer within bounds
 */
function validateDelay(delay: number): void {
  if (!Number.isInteger(delay) || delay < MIN_TIMER_DELAY || delay > MAX_TIMER_DELAY) {
    throw new Error(
      `Timer delay must be an integer between ${MIN_TIMER_DELAY} and ${MAX_TIMER_DELAY}, got ${delay}`,
    );
  }
}

/**
 * TimerModel represents a timer's shift register.
 *
 * Scrap Mechanic timers operate as N-stage shift registers where N is the
 * configured delay in ticks. Each tick, the input value is pushed into the
 * front of the register and the oldest value (position N-1) is output.
 */
export class TimerModel {
  private shiftRegister: boolean[];
  private delayValue: number;
  private lastOutputValue: boolean;

  constructor(delay: number) {
    validateDelay(delay);
    this.delayValue = delay;
    this.shiftRegister = new Array<boolean>(delay).fill(false);
    this.lastOutputValue = false;
  }

  /**
   * Get the configured delay in ticks.
   */
  getDelay(): number {
    return this.delayValue;
  }

  /**
   * Process one tick: shift in the new input value, output the oldest value.
   * @returns The output value (the value that was in the register N ticks ago)
   */
  tick(inputValue: boolean): boolean {
    this.shiftRegister.unshift(inputValue);
    this.lastOutputValue = this.shiftRegister.pop() ?? false;
    return this.lastOutputValue;
  }

  /**
   * Process one tick reading from the previous state.
   * Alias for tick(), provided for API symmetry with SM-specific terminology.
   */
  tickFromPrevState(prevInputValue: boolean): boolean {
    return this.tick(prevInputValue);
  }

  /**
   * Reset the shift register to all false values.
   */
  reset(): void {
    this.shiftRegister = new Array<boolean>(this.delayValue).fill(false);
    this.lastOutputValue = false;
  }

  /**
   * Resize the shift register to a new delay value.
   * Preserves as much data as possible:
   * - If growing: pads with false at the end (newest position preserved)
   * - If shrinking: truncates from the end (losing oldest values)
   *
   * @throws {Error} if newDelay is not a valid timer delay
   */
  resize(newDelay: number): void {
    validateDelay(newDelay);

    if (newDelay > this.delayValue) {
      const padding = new Array<boolean>(newDelay - this.delayValue).fill(false);
      this.shiftRegister.push(...padding);
    } else if (newDelay < this.delayValue) {
      this.shiftRegister = this.shiftRegister.slice(0, newDelay);
    }

    this.delayValue = newDelay;
  }

  /**
   * Get a snapshot of all values currently in the shift register (oldest first).
   * Index 0 = oldest (next to be output), last index = newest (just shifted in).
   */
  getRegisterContents(): readonly boolean[] {
    return [...this.shiftRegister];
  }

  /**
   * Peek at the current output value without advancing the register.
   * Returns the value that was output by the most recent tick() call.
   */
  peekOutput(): boolean {
    return this.lastOutputValue;
  }

  /**
   * Create an independent copy of this timer model.
   * The clone has the same delay and register contents but is not linked
   * to the original.
   */
  clone(): TimerModel {
    const copy = new TimerModel(this.delayValue);
    copy.shiftRegister = [...this.shiftRegister];
    copy.lastOutputValue = this.lastOutputValue;
    return copy;
  }
}
