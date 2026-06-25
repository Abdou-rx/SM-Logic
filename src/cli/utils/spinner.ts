/**
 * Progress spinner wrapper using ora.
 */
import ora from "ora";
import type { Ora } from "ora";

/** Start a spinner */
export function startSpinner(text: string): Ora {
  return ora(text).start();
}

/** Create a stopped spinner for manual control */
export function createSpinner(): Ora {
  return ora();
}
