#!/usr/bin/env node
/**
 * sm-logic — Scrap Mechanic Logic Circuit Design, Simulation & Verification CLI
 *
 * A professional TypeScript CLI tool for designing, simulating, verifying,
 * and generating Scrap Mechanic logic circuit blueprints.
 */
import { Command } from "commander";
import { createSimulateCommand } from "./cli/commands/simulate.js";
import { createVerifyCommand } from "./cli/commands/verify.js";
import { createTruthTableCommand } from "./cli/commands/truth-table.js";
import { createBuildCommand } from "./cli/commands/build.js";
import { createConvertCommand } from "./cli/commands/convert.js";
import { createInfoCommand } from "./cli/commands/info.js";
import { createLibraryCommand } from "./cli/commands/library.js";

const program = new Command();

program
  .name("sm-logic")
  .description(
    "Scrap Mechanic Logic Circuit Design, Simulation & Verification CLI Tool",
  )
  .version("1.0.0")
  .argument("[command]")
  .action(() => {
    program.help();
  });

// Register all commands
program.addCommand(createSimulateCommand());
program.addCommand(createVerifyCommand());
program.addCommand(createTruthTableCommand());
program.addCommand(createBuildCommand());
program.addCommand(createConvertCommand());
program.addCommand(createInfoCommand());
program.addCommand(createLibraryCommand());

// Parse and execute
program.parse(process.argv);

// Export for programmatic use
export { program as smLogicCli };
