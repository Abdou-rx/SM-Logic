/**
 * CLI output formatting utilities.
 */
import chalk from "chalk";

/** Log an info message */
export function info(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}

/** Log a success message */
export function success(message: string): void {
  console.log(chalk.green("✓"), message);
}

/** Log a warning message */
export function warn(message: string): void {
  console.log(chalk.yellow("⚠"), message);
}

/** Log an error message */
export function error(message: string): void {
  console.error(chalk.red("✗"), message);
}

/** Log a header */
export function header(title: string): void {
  console.log("\n" + chalk.bold.cyan(`── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`));
}

/** Log a sub-header */
export function subheader(title: string): void {
  console.log(chalk.dim(`  ${title}`));
}

/** Format a key-value pair */
export function kv(key: string, value: string | number | boolean): void {
  console.log(chalk.dim("  ") + chalk.gray(`${key}:`) + ` ${String(value)}`);
}
