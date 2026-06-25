/**
 * Simple Verilog parser AST types.
 * Supports a subset of synthesizable Verilog-2001.
 */

/** Port direction */
export type PortDirection = "input" | "output" | "wire" | "reg";

/** Verilog port declaration */
export interface VerilogPort {
  readonly name: string;
  readonly direction: PortDirection;
  readonly width: number; // 1 for scalar, N for [N-1:0]
  readonly msb?: number;
  readonly lsb?: number;
}

/** Binary operator types */
export type VerilogOperator =
  | "&"
  | "|"
  | "^"
  | "~"
  | "!"
  | "+"
  | "-"
  | "&&"
  | "||"
  | "=="
  | "!=";

/** Verilog expression (recursive) */
export type VerilogExpression =
  | { readonly kind: "identifier"; readonly name: string; readonly bit?: number }
  | { readonly kind: "number"; readonly value: number; readonly width: number }
  | {
      readonly kind: "binary";
      readonly op: VerilogOperator;
      readonly left: VerilogExpression;
      readonly right: VerilogExpression;
    }
  | {
      readonly kind: "unary";
      readonly op: "~" | "!";
      readonly operand: VerilogExpression;
    }
  | {
      readonly kind: "ternary";
      readonly condition: VerilogExpression;
      readonly thenExpr: VerilogExpression;
      readonly elseExpr: VerilogExpression;
    };

/** Continuous assignment statement */
export interface VerilogAssign {
  readonly kind: "assign";
  readonly target: string;
  readonly expression: VerilogExpression;
}

/** Always block edge specification */
export type AlwaysEdge = "posedge" | "negedge";

/** Sensitivity list item */
export interface SensitivityItem {
  readonly edge?: AlwaysEdge;
  readonly signal: string;
}

/** Always block */
export interface VerilogAlways {
  readonly kind: "always";
  readonly sensitivity: readonly SensitivityItem[];
  readonly statements: readonly VerilogStatement[];
}

/** Statement inside an always block */
export type VerilogStatement =
  | { readonly kind: "blocking_assign"; readonly target: string; readonly value: VerilogExpression }
  | {
      readonly kind: "nonblocking_assign";
      readonly target: string;
      readonly value: VerilogExpression;
    }
  | {
      readonly kind: "if_else";
      readonly condition: VerilogExpression;
      readonly thenBody: readonly VerilogStatement[];
      readonly elseBody?: readonly VerilogStatement[];
    };

/** Top-level Verilog module */
export interface VerilogModule {
  readonly name: string;
  readonly ports: readonly VerilogPort[];
  readonly assigns: readonly VerilogAssign[];
  readonly alwaysBlocks: readonly VerilogAlways[];
}

/** Full Verilog file */
export interface VerilogFile {
  readonly modules: readonly VerilogModule[];
}
