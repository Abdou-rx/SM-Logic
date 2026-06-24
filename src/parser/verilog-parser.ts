/**
 * VerilogParser — parses a subset of Verilog-2001 and converts it
 * to CircuitDefinition objects for use in the SM logic tool pipeline.
 *
 * Supported constructs:
 *  - module … endmodule  (ANSI and non-ANSI port lists)
 *  - input / output / wire / reg declarations
 *  - assign statements (continuous assignment)
 *  - always @(*) blocks with if / else
 *  - Operators: &, |, ^, ~, !, +, -, &&, ||, ==, !=
 *  - Numbers and identifiers
 */
import { readFile } from "node:fs/promises";
import type {
  VerilogFile,
  VerilogModule,
  VerilogPort,
  VerilogExpression,
  VerilogAssign,
  VerilogAlways,
  VerilogStatement,
  SensitivityItem,
  PortDirection,
  VerilogOperator,
  AlwaysEdge,
} from "../types/verilog.js";
import type { CircuitDefinition } from "../types/circuit.js";
import type { LogicGateType } from "../types/gate.js";
import { CircuitBuilder } from "../core/circuit-builder.js";

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

interface Token {
  readonly type: "ident" | "number" | "op" | "punct";
  readonly value: string;
  readonly line: number;
}

// ---------------------------------------------------------------------------
// VerilogParser
// ---------------------------------------------------------------------------

export class VerilogParser {
  private readonly tokens: Token[];
  private idx: number;

  private constructor(source: string) {
    this.tokens = tokenize(source);
    this.idx = 0;
  }

  // ---- Public static API ---------------------------------------------------

  /** Parse a .v file into a VerilogFile AST. */
  static async parseFile(filePath: string): Promise<VerilogFile> {
    const content = await readFile(filePath, "utf-8");
    return VerilogParser.parseString(content);
  }

  /** Parse a Verilog source string into a VerilogFile AST. */
  static parseString(source: string): VerilogFile {
    const parser = new VerilogParser(source);
    return parser.parse();
  }

  /**
   * Convert a VerilogModule AST into a CircuitDefinition.
   *
   * Handles:
   *  - Simple assign statements  → single logic gate
   *  - Negated binary ops        → NAND / NOR / XNOR gate
   *  - NOT (~)                   → NAND with tied inputs
   *  - Addition (+)              → XOR (sum) + AND (carry) decomposition
   *  - always @(*) combinational → gates for each assignment
   */
  static moduleToCircuit(verilogModule: VerilogModule): CircuitDefinition {
    const builder = new CircuitBuilder(verilogModule.name);

    // Ports
    for (const port of verilogModule.ports) {
      if (port.direction === "input") {
        builder.input(port.name);
      } else if (port.direction === "output") {
        builder.output(port.name);
      }
    }

    let gateCounter = 0;

    // Assign statements
    for (const assign of verilogModule.assigns) {
      const gates = expressionToGates(assign.expression, assign.target, gateCounter);
      for (const g of gates) {
        builder.gate(g.id, g.type, g.inputs, g.output);
      }
      gateCounter += gates.length;
    }

    // Always blocks (combinational only)
    for (const block of verilogModule.alwaysBlocks) {
      if (!isCombinationalSensitivity(block.sensitivity)) continue;
      for (const stmt of block.statements) {
        if (stmt.kind === "blocking_assign" || stmt.kind === "nonblocking_assign") {
          const gates = expressionToGates(stmt.value, stmt.target, gateCounter);
          for (const g of gates) {
            builder.gate(g.id, g.type, g.inputs, g.output);
          }
          gateCounter += gates.length;
        } else if (stmt.kind === "if_else") {
          const ifGates = decomposeIfElse(stmt, gateCounter);
          for (const g of ifGates) {
            builder.gate(g.id, g.type, g.inputs, g.output);
          }
          gateCounter += ifGates.length;
        }
      }
    }

    return builder.build();
  }

  // ---- Top-level parse ----------------------------------------------------

  private parse(): VerilogFile {
    const modules: VerilogModule[] = [];

    while (this.idx < this.tokens.length) {
      if (this.peekIs("module")) {
        modules.push(this.parseModule());
      } else {
        this.advance();
      }
    }

    return { modules };
  }

  // ---- Module parsing -----------------------------------------------------

  private parseModule(): VerilogModule {
    this.expectIdent("module");
    const name = this.expectIdent();

    this.expectPunct("(");

    const ports: VerilogPort[] = [];
    const assigns: VerilogAssign[] = [];
    const alwaysBlocks: VerilogAlways[] = [];

    // ANSI vs non-ANSI
    if (this.peekIs("input") || this.peekIs("output") || this.peekIs("inout")) {
      this.parseAnsiPorts(ports);
    } else {
      this.parsePortNameList(ports);
    }

    this.expectPunct(")");
    this.expectPunct(";");

    // Body — single pass over all declarations, assigns, and always blocks
    while (this.idx < this.tokens.length && !this.peekIs("endmodule")) {
      if (this.peekIs("input") || this.peekIs("output") || this.peekIs("inout")) {
        this.parseBodyPortDecl(ports);
      } else if (this.peekIs("wire")) {
        this.parseWireDecl(ports);
      } else if (this.peekIs("reg")) {
        this.parseRegDecl(ports);
      } else if (this.peekIs("assign")) {
        assigns.push(this.parseAssignStmt());
      } else if (this.peekIs("always")) {
        alwaysBlocks.push(this.parseAlwaysBlock());
      } else {
        this.advance();
      }
    }

    if (this.peekIs("endmodule")) {
      this.advance();
    }

    return { name, ports, assigns, alwaysBlocks };
  }

  // ---- Port parsing -------------------------------------------------------

  private parseAnsiPorts(ports: VerilogPort[]): void {
    while (this.idx < this.tokens.length && !this.peekIsPunct(")")) {
      const dir = this.advance()!;
      const direction = dir.value as PortDirection;

      // Optional width: [N:M]
      let width = 1;
      let msb: number | undefined;
      let lsb: number | undefined;
      if (this.peekIsPunct("[")) {
        this.advance(); // [
        const hi = parseInt(this.expectIdentOrNumber(), 10);
        this.expectPunct(":");
        const lo = parseInt(this.expectIdentOrNumber(), 10);
        this.expectPunct("]");
        width = hi - lo + 1;
        msb = hi;
        lsb = lo;
      }

      // Port names
      while (true) {
        const portName = this.expectIdent();
        ports.push({ name: portName, direction, width, msb, lsb });

        if (this.peekIsPunct(",")) {
          this.advance();
          // Check if next token starts a new direction
          if (
            this.idx < this.tokens.length &&
            this.tokens[this.idx]!.type === "ident" &&
            (this.tokens[this.idx]!.value === "input" ||
              this.tokens[this.idx]!.value === "output" ||
              this.tokens[this.idx]!.value === "inout")
          ) {
            break;
          }
          continue;
        }
        break;
      }
    }
  }

  private parsePortNameList(ports: VerilogPort[]): void {
    while (this.idx < this.tokens.length && !this.peekIsPunct(")")) {
      const portName = this.expectIdent();
      ports.push({ name: portName, direction: "input", width: 1 });
      if (this.peekIsPunct(",")) {
        this.advance();
      }
    }
  }

  private parseBodyPortDecl(ports: VerilogPort[]): void {
    const dir = this.advance()!;
    const direction = dir.value as PortDirection;

    let width = 1;
    let msb: number | undefined;
    let lsb: number | undefined;
    if (this.peekIsPunct("[")) {
      this.advance();
      const hi = parseInt(this.expectIdentOrNumber(), 10);
      this.expectPunct(":");
      const lo = parseInt(this.expectIdentOrNumber(), 10);
      this.expectPunct("]");
      width = hi - lo + 1;
      msb = hi;
      lsb = lo;
    }

    while (true) {
      const portName = this.expectIdent();
      // Update existing port or add new
      const existing = ports.find((p) => p.name === portName);
      if (existing !== undefined) {
        const idx = ports.indexOf(existing);
        ports[idx] = { ...existing, direction, width, msb, lsb };
      } else {
        ports.push({ name: portName, direction, width, msb, lsb });
      }

      if (this.peekIsPunct(",")) {
        this.advance();
        continue;
      }
      break;
    }
    this.expectPunct(";");
  }

  private parseWireDecl(ports: VerilogPort[]): void {
    this.advance(); // "wire"

    let width = 1;
    let msb: number | undefined;
    let lsb: number | undefined;
    if (this.peekIsPunct("[")) {
      this.advance();
      const hi = parseInt(this.expectIdentOrNumber(), 10);
      this.expectPunct(":");
      const lo = parseInt(this.expectIdentOrNumber(), 10);
      this.expectPunct("]");
      width = hi - lo + 1;
      msb = hi;
      lsb = lo;
    }

    while (true) {
      const name = this.expectIdent();
      ports.push({ name, direction: "wire", width, msb, lsb });
      if (this.peekIsPunct(",")) {
        this.advance();
        continue;
      }
      break;
    }
    this.expectPunct(";");
  }

  private parseRegDecl(ports: VerilogPort[]): void {
    this.advance(); // "reg"

    let width = 1;
    let msb: number | undefined;
    let lsb: number | undefined;
    if (this.peekIsPunct("[")) {
      this.advance();
      const hi = parseInt(this.expectIdentOrNumber(), 10);
      this.expectPunct(":");
      const lo = parseInt(this.expectIdentOrNumber(), 10);
      this.expectPunct("]");
      width = hi - lo + 1;
      msb = hi;
      lsb = lo;
    }

    while (true) {
      const name = this.expectIdent();
      ports.push({ name, direction: "reg", width, msb, lsb });
      if (this.peekIsPunct(",")) {
        this.advance();
        continue;
      }
      break;
    }
    this.expectPunct(";");
  }

  // ---- Assign -----------------------------------------------------------

  private parseAssignStmt(): VerilogAssign {
    this.expectIdent("assign");
    const target = this.expectIdent();
    this.expectPunct("=");
    const expression = this.parseExpression();
    this.expectPunct(";");
    return { kind: "assign", target, expression };
  }

  // ---- Always block -------------------------------------------------------

  private parseAlwaysBlock(): VerilogAlways {
    this.expectIdent("always");
    this.expectPunct("@");
    this.expectPunct("(");

    const sensitivity: SensitivityItem[] = [];

    if (this.peekIsPunct("*")) {
      this.advance();
      sensitivity.push({ signal: "*" });
    } else {
      while (this.idx < this.tokens.length && !this.peekIsPunct(")")) {
        let edge: AlwaysEdge | undefined;
        if (this.peekIs("posedge")) {
          edge = "posedge";
          this.advance();
        } else if (this.peekIs("negedge")) {
          edge = "negedge";
          this.advance();
        }
        const sig = this.expectIdent();
        sensitivity.push({ edge, signal: sig });

        if (this.peekIsPunct(",")) {
          this.advance();
          if (this.peekIs("or")) {
            this.advance();
          }
          continue;
        }
        break;
      }
    }

    this.expectPunct(")");

    // Parse statements
    const statements = this.parseStatementBlock();

    return { kind: "always", sensitivity, statements };
  }

  private parseStatementBlock(): VerilogStatement[] {
    const statements: VerilogStatement[] = [];

    if (this.peekIs("begin")) {
      this.advance();
      while (this.idx < this.tokens.length && !this.peekIs("end")) {
        statements.push(this.parseStatement());
      }
      if (this.peekIs("end")) {
        this.advance();
      }
    } else {
      statements.push(this.parseStatement());
    }

    return statements;
  }

  private parseStatement(): VerilogStatement {
    if (this.peekIs("if")) {
      return this.parseIfElse();
    }

    // Assignment: lhs = rhs; or lhs <= rhs;
    const target = this.expectIdent();
    const op = this.advance();

    if (op === undefined) {
      throw new ParseError(`Unexpected end after "${target}"`, this.currentLine());
    }

    if (op.value === "=") {
      const value = this.parseExpression();
      this.expectPunct(";");
      return { kind: "blocking_assign", target, value };
    }

    if (op.value === "<=") {
      const value = this.parseExpression();
      this.expectPunct(";");
      return { kind: "nonblocking_assign", target, value };
    }

    throw new ParseError(
      `Unexpected operator "${op.value}" after "${target}"`,
      op.line,
    );
  }

  private parseIfElse(): VerilogStatement {
    this.expectIdent("if");
    this.expectPunct("(");
    const condition = this.parseExpression();
    this.expectPunct(")");

    const thenBody = this.parseStatementBlock();

    let elseBody: VerilogStatement[] | undefined;
    if (this.peekIs("else")) {
      this.advance();
      if (this.peekIs("if")) {
        elseBody = [this.parseIfElse()];
      } else {
        elseBody = this.parseStatementBlock();
      }
    }

    return { kind: "if_else", condition, thenBody, elseBody };
  }

  // ---- Expression parser (recursive descent with precedence) --------------

  private parseExpression(): VerilogExpression {
    return this.parseTernary();
  }

  private parseTernary(): VerilogExpression {
    const cond = this.parseLogicalOr();
    if (this.peekIsPunct("?")) {
      this.advance();
      const thenExpr = this.parseTernary();
      this.expectPunct(":");
      const elseExpr = this.parseTernary();
      return { kind: "ternary", condition: cond, thenExpr, elseExpr };
    }
    return cond;
  }

  private parseLogicalOr(): VerilogExpression {
    let left = this.parseLogicalAnd();
    while (this.idx < this.tokens.length && this.tokens[this.idx]!.value === "||") {
      this.advance();
      const right = this.parseLogicalAnd();
      left = { kind: "binary", op: "||", left, right };
    }
    return left;
  }

  private parseLogicalAnd(): VerilogExpression {
    let left = this.parseBitwiseOr();
    while (this.idx < this.tokens.length && this.tokens[this.idx]!.value === "&&") {
      this.advance();
      const right = this.parseBitwiseOr();
      left = { kind: "binary", op: "&&", left, right };
    }
    return left;
  }

  private parseBitwiseOr(): VerilogExpression {
    let left = this.parseBitwiseXor();
    while (this.idx < this.tokens.length && this.tokens[this.idx]!.value === "|") {
      // Make sure it's not ||
      const tok = this.tokens[this.idx]!;
      if (tok.type === "op" && tok.value === "|") {
        this.advance();
        const right = this.parseBitwiseXor();
        left = { kind: "binary", op: "|", left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseBitwiseXor(): VerilogExpression {
    let left = this.parseBitwiseAnd();
    while (this.idx < this.tokens.length && this.tokens[this.idx]!.value === "^") {
      this.advance();
      const right = this.parseBitwiseAnd();
      left = { kind: "binary", op: "^", left, right };
    }
    return left;
  }

  private parseBitwiseAnd(): VerilogExpression {
    let left = this.parseEquality();
    while (this.idx < this.tokens.length && this.tokens[this.idx]!.value === "&") {
      this.advance();
      const right = this.parseEquality();
      left = { kind: "binary", op: "&", left, right };
    }
    return left;
  }

  private parseEquality(): VerilogExpression {
    let left = this.parseAdditive();
    while (this.idx < this.tokens.length) {
      const tok = this.tokens[this.idx]!;
      if (tok.value === "==" || tok.value === "!=") {
        this.advance();
        const right = this.parseAdditive();
        left = { kind: "binary", op: tok.value as "==" | "!=", left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseAdditive(): VerilogExpression {
    let left = this.parseUnary();
    while (this.idx < this.tokens.length) {
      const tok = this.tokens[this.idx]!;
      if (tok.value === "+" || tok.value === "-") {
        this.advance();
        const right = this.parseUnary();
        left = { kind: "binary", op: tok.value as "+" | "-", left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnary(): VerilogExpression {
    const tok = this.tokens[this.idx];
    if (tok === undefined) {
      throw new ParseError("Unexpected end of input in expression", -1);
    }
    if (tok.value === "~" || tok.value === "!") {
      this.advance();
      const operand = this.parseUnary();
      return { kind: "unary", op: tok.value as "~" | "!", operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): VerilogExpression {
    const tok = this.tokens[this.idx];
    if (tok === undefined) {
      throw new ParseError("Unexpected end of input in expression", -1);
    }

    // Number literal
    if (tok.type === "number") {
      this.advance();
      return { kind: "number", value: parseInt(tok.value, 10), width: 32 };
    }

    // Identifier (possibly with bit select)
    if (tok.type === "ident") {
      this.advance();
      const name = tok.value;

      // Check for bit select: name[bit]
      if (this.peekIsPunct("[")) {
        this.advance();
        const bitTok = this.tokens[this.idx];
        if (bitTok !== undefined && bitTok.type === "number") {
          this.advance();
          this.expectPunct("]");
          return { kind: "identifier", name, bit: parseInt(bitTok.value, 10) };
        }
        // If not a simple bit select, backtrack is hard; just return identifier
        return { kind: "identifier", name };
      }

      return { kind: "identifier", name };
    }

    // Parenthesized expression
    if (tok.type === "punct" && tok.value === "(") {
      this.advance();
      const expr = this.parseExpression();
      this.expectPunct(")");
      return expr;
    }

    throw new ParseError(
      `Unexpected token "${tok.value}" in expression`,
      tok.line,
    );
  }

  // ---- Token helpers ------------------------------------------------------

  private peek(): Token | undefined {
    return this.tokens[this.idx];
  }

  private advance(): Token | undefined {
    return this.tokens[this.idx++];
  }

  private expectIdent(expected?: string): string {
    const tok = this.advance();
    if (tok === undefined) {
      throw new ParseError(
        `Expected identifier${expected ? ` "${expected}"` : ""} but reached EOF`,
        -1,
      );
    }
    if (tok.type !== "ident") {
      throw new ParseError(
        `Expected identifier${expected ? ` "${expected}"` : ""} but got "${tok.value}"`,
        tok.line,
      );
    }
    if (expected !== undefined && tok.value !== expected) {
      throw new ParseError(
        `Expected "${expected}" but got "${tok.value}"`,
        tok.line,
      );
    }
    return tok.value;
  }

  private expectIdentOrNumber(): string {
    const tok = this.advance();
    if (tok === undefined) {
      throw new ParseError("Expected identifier or number but reached EOF", -1);
    }
    if (tok.type !== "ident" && tok.type !== "number") {
      throw new ParseError(
        `Expected identifier or number but got "${tok.value}"`,
        tok.line,
      );
    }
    return tok.value;
  }

  private expectPunct(expected: string): void {
    const tok = this.advance();
    if (tok === undefined) {
      throw new ParseError(`Expected "${expected}" but reached EOF`, -1);
    }
    if (tok.type !== "punct" || tok.value !== expected) {
      throw new ParseError(
        `Expected "${expected}" but got "${tok.value}"`,
        tok.line,
      );
    }
  }

  private peekIs(value: string): boolean {
    const tok = this.peek();
    return tok !== undefined && tok.type === "ident" && tok.value === value;
  }

  private peekIsPunct(value: string): boolean {
    const tok = this.peek();
    return tok !== undefined && tok.type === "punct" && tok.value === value;
  }

  private currentLine(): number {
    const tok = this.tokens[this.idx - 1];
    return tok !== undefined ? tok.line : -1;
  }
}

// ---------------------------------------------------------------------------
// ModuleToCircuit helpers
// ---------------------------------------------------------------------------

/** Intermediate gate representation for Verilog → Circuit conversion */
interface TempGate {
  readonly id: string;
  readonly type: LogicGateType;
  readonly inputs: readonly string[];
  readonly output: string;
}

/** Convert a Verilog expression + target into one or more gates */
function expressionToGates(
  expr: VerilogExpression,
  output: string,
  counter: number,
): TempGate[] {
  // 1. Unary NOT: ~identifier → NAND(tied)
  if (expr.kind === "unary" && (expr.op === "~" || expr.op === "!")) {
    if (expr.operand.kind === "identifier") {
      return [
        { id: `g${counter}`, type: "nand", inputs: [expr.operand.name, expr.operand.name], output },
      ];
    }
    // ~complex → decompose operand then negate
    const subGates = expressionToGates(expr.operand, `_t${counter}`, counter);
    const lastTemp = `_t${counter + subGates.length - 1}`;
    return [
      ...subGates,
      { id: `g${counter + subGates.length}`, type: "nand", inputs: [lastTemp, lastTemp], output },
    ];
  }

  // 2. Negated binary: ~(a & b) → NAND, ~(a | b) → NOR, ~(a ^ b) → XNOR
  if (expr.kind === "unary" && expr.operand.kind === "binary") {
    const inner = expr.operand;
    const negatedType = negatedOpToGateType(inner.op);
    if (negatedType !== null) {
      const inputs = collectIdentifiers(inner, inner.op);
      if (inputs !== null && inputs.length >= 2) {
        return [{ id: `g${counter}`, type: negatedType, inputs, output }];
      }
    }
  }

  // 3. Simple binary: &, |, ^, +, -
  if (expr.kind === "binary") {
    // Addition decomposition
    if (expr.op === "+") {
      const leftId = singleIdentifier(expr.left);
      const rightId = singleIdentifier(expr.right);
      if (leftId !== null && rightId !== null) {
        return [
          { id: `g${counter}`, type: "xor", inputs: [leftId, rightId], output },
          { id: `g${counter + 1}`, type: "and", inputs: [leftId, rightId], output: `${output}_carry` },
        ];
      }
      // Complex addition — recursive decomposition
      return decomposeAddition(expr, output, counter);
    }

    const gateType = binaryOpToGateType(expr.op);
    if (gateType !== null) {
      const inputs = collectIdentifiers(expr, expr.op);
      if (inputs !== null && inputs.length >= 2) {
        return [{ id: `g${counter}`, type: gateType, inputs, output }];
      }
      // Complex expression — recursive decomposition
      return decomposeBinary(expr, gateType, output, counter);
    }

    // Logical ops: treat && as AND, || as OR for 1-bit
    if (expr.op === "&&") {
      const inputs = collectIdentifiers(expr, "&&");
      if (inputs !== null && inputs.length >= 2) {
        return [{ id: `g${counter}`, type: "and", inputs, output }];
      }
    }
    if (expr.op === "||") {
      const inputs = collectIdentifiers(expr, "||");
      if (inputs !== null && inputs.length >= 2) {
        return [{ id: `g${counter}`, type: "or", inputs, output }];
      }
    }
  }

  // 4. Simple identifier passthrough (no gate needed)
  if (expr.kind === "identifier") {
    // Direct wire — no gate needed
    return [];
  }

  // 5. Fallback: recursive decomposition
  return decomposeGeneric(expr, output, counter);
}

/** Decompose a generic expression into simple gates recursively */
function decomposeGeneric(
  expr: VerilogExpression,
  output: string,
  counter: number,
): TempGate[] {
  if (expr.kind === "binary") {
    const leftTemp = `_t${counter}`;
    const leftGates = decomposeGeneric(expr.left, leftTemp, counter);
    const rightTemp = `_t${counter + leftGates.length}`;
    const rightGates = decomposeGeneric(expr.right, rightTemp, counter + leftGates.length);

    const gateType = binaryOpToGateType(expr.op);
    if (gateType !== null) {
      return [
        ...leftGates,
        ...rightGates,
        {
          id: `g${counter + leftGates.length + rightGates.length}`,
          type: gateType,
          inputs: [leftTemp, rightTemp],
          output,
        },
      ];
    }

    // Unknown binary op — just decompose sub-expressions
    return [...leftGates, ...rightGates];
  }

  if (expr.kind === "unary") {
    const subTemp = `_t${counter}`;
    const subGates = decomposeGeneric(expr.operand, subTemp, counter);
    if (expr.op === "~" || expr.op === "!") {
      return [
        ...subGates,
        {
          id: `g${counter + subGates.length}`,
          type: "nand",
          inputs: [subTemp, subTemp],
          output,
        },
      ];
    }
    return subGates;
  }

  if (expr.kind === "identifier") {
    return []; // passthrough
  }

  if (expr.kind === "number") {
    return []; // constant — ignore
  }

  if (expr.kind === "ternary") {
    // Ternary: decompose condition, then, else
    const condTemp = `_t${counter}`;
    const condGates = decomposeGeneric(expr.condition, condTemp, counter);
    const thenTemp = `_t${counter + condGates.length}`;
    const thenGates = decomposeGeneric(expr.thenExpr, thenTemp, counter + condGates.length);
    const elseTemp = `_t${counter + condGates.length + thenGates.length}`;
    const elseGates = decomposeGeneric(expr.elseExpr, elseTemp, counter + condGates.length + thenGates.length);

    // MUX: output = cond ? then : else
    // Implemented as: NOT(cond) & then | cond & else
    // Using available gates:
    const notTemp = `_t${counter + condGates.length + thenGates.length + elseGates.length}`;
    const notIdx = counter + condGates.length + thenGates.length + elseGates.length;
    const muxA = `_t${notIdx + 1}`;
    const muxB = `_t${notIdx + 2}`;
    return [
      ...condGates,
      ...thenGates,
      ...elseGates,
      { id: `g${notIdx}`, type: "nand", inputs: [condTemp, condTemp], output: notTemp },
      { id: `g${notIdx + 1}`, type: "and", inputs: [notTemp, thenTemp], output: muxA },
      { id: `g${notIdx + 2}`, type: "and", inputs: [condTemp, elseTemp], output: muxB },
      { id: `g${notIdx + 3}`, type: "or", inputs: [muxA, muxB], output },
    ];
  }

  return [];
}

/** Decompose a binary expression into sub-gates + final gate */
function decomposeBinary(
  expr: VerilogExpression,
  gateType: LogicGateType,
  output: string,
  counter: number,
): TempGate[] {
  if (expr.kind !== "binary") return [];

  const leftTemp = `_t${counter}`;
  const leftGates = decomposeGeneric(expr.left, leftTemp, counter);
  const rightTemp = `_t${counter + leftGates.length}`;
  const rightGates = decomposeGeneric(expr.right, rightTemp, counter + leftGates.length);

  return [
    ...leftGates,
    ...rightGates,
    {
      id: `g${counter + leftGates.length + rightGates.length}`,
      type: gateType,
      inputs: [leftTemp, rightTemp],
      output,
    },
  ];
}

/** Decompose addition (+) into XOR (sum) + AND (carry) */
function decomposeAddition(
  expr: VerilogExpression,
  output: string,
  counter: number,
): TempGate[] {
  if (expr.kind !== "binary") return [];

  const leftTemp = `_t${counter}`;
  const leftGates = decomposeGeneric(expr.left, leftTemp, counter);
  const rightTemp = `_t${counter + leftGates.length}`;
  const rightGates = decomposeGeneric(expr.right, rightTemp, counter + leftGates.length);
  const idx = counter + leftGates.length + rightGates.length;

  return [
    ...leftGates,
    ...rightGates,
    { id: `g${idx}`, type: "xor", inputs: [leftTemp, rightTemp], output },
    { id: `g${idx + 1}`, type: "and", inputs: [leftTemp, rightTemp], output: `${output}_carry` },
  ];
}

/** Decompose if/else into gates */
function decomposeIfElse(
  stmt: VerilogStatement,
  counter: number,
): TempGate[] {
  if (stmt.kind !== "if_else") return [];

  // Simple if-else: output = cond ? then_val : else_val
  // For now, treat condition as a mux selector
  // This is a simplified decomposition for single-assignment if/else
  const condTemp = `_cond${counter}`;
  const condGates = decomposeGeneric(stmt.condition, condTemp, counter);

  const gates: TempGate[] = [...condGates];
  let offset = counter + condGates.length;

  // Process then body
  for (const s of stmt.thenBody) {
    if (s.kind === "blocking_assign" || s.kind === "nonblocking_assign") {
      const sg = expressionToGates(s.value, `_then${offset}`, offset);
      gates.push(...sg);
      offset += sg.length;
    }
  }

  // Process else body
  for (const s of stmt.elseBody ?? []) {
    if (s.kind === "blocking_assign" || s.kind === "nonblocking_assign") {
      const sg = expressionToGates(s.value, `_else${offset}`, offset);
      gates.push(...sg);
      offset += sg.length;
    }
  }

  // NOTE: Full if/else decomposition would need the target output.
  // This is a simplified version that decomposes sub-expressions.
  return gates;
}

// ---------------------------------------------------------------------------
// Expression analysis helpers
// ---------------------------------------------------------------------------

/** Try to extract a single identifier from an expression */
function singleIdentifier(expr: VerilogExpression): string | null {
  if (expr.kind === "identifier") return expr.name;
  return null;
}

/**
 * Collect all identifiers from a left-associative chain of the same operator.
 * Returns null if any operand is not a simple identifier.
 */
function collectIdentifiers(
  expr: VerilogExpression,
  targetOp: VerilogOperator,
): string[] | null {
  const operands: VerilogExpression[] = [];
  collectChainOperands(expr, targetOp, operands);

  const result: string[] = [];
  for (const op of operands) {
    if (op.kind === "identifier") {
      result.push(op.name);
    } else {
      return null;
    }
  }
  return result.length >= 2 ? result : null;
}

/** Recursively collect operands from a chain of the same binary operator */
function collectChainOperands(
  expr: VerilogExpression,
  targetOp: VerilogOperator,
  out: VerilogExpression[],
): void {
  if (expr.kind === "binary" && expr.op === targetOp) {
    collectChainOperands(expr.left, targetOp, out);
    collectChainOperands(expr.right, targetOp, out);
  } else {
    out.push(expr);
  }
}

/** Map a binary Verilog operator to a LogicGateType (null if unsupported) */
function binaryOpToGateType(op: VerilogOperator): LogicGateType | null {
  switch (op) {
    case "&": return "and";
    case "|": return "or";
    case "^": return "xor";
    default: return null;
  }
}

/** Map a binary Verilog operator to its negated gate type (null if unsupported) */
function negatedOpToGateType(op: VerilogOperator): LogicGateType | null {
  switch (op) {
    case "&": return "nand";
    case "|": return "nor";
    case "^": return "xnor";
    default: return null;
  }
}

/** Check if a sensitivity list represents combinational logic (@(*)) */
function isCombinationalSensitivity(sensitivity: readonly SensitivityItem[]): boolean {
  return sensitivity.some((s) => s.signal === "*");
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Line comment
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    // Block comment
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length - 1 && !(source[i] === "*" && source[i + 1] === "/")) {
        i++;
      }
      i += 2;
      continue;
    }

    // Two-char operators
    const two = source.slice(i, i + 2);
    if (
      two === "~&" || two === "~|" || two === "~^" || two === "^~" ||
      two === "==" || two === "!=" || two === ">=" || two === "<=" ||
      two === "<<" || two === ">>" || two === "&&" || two === "||"
    ) {
      tokens.push({ type: "op", value: two, line: lineNumber(source, i) });
      i += 2;
      continue;
    }

    // Single-char operators
    if ("&|^~!+-*/%<>=?:".includes(ch)) {
      tokens.push({ type: "op", value: ch, line: lineNumber(source, i) });
      i++;
      continue;
    }

    // Punctuation
    if ("()[]{},;.@#".includes(ch)) {
      tokens.push({ type: "punct", value: ch, line: lineNumber(source, i) });
      i++;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < source.length && /[0-9a-fA-F_xXzZ]/.test(source[i]!)) {
        num += source[i]!;
        i++;
      }
      tokens.push({ type: "number", value: num, line: lineNumber(source, i) });
      continue;
    }

    // Identifiers / keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) {
        id += source[i]!;
        i++;
      }
      tokens.push({ type: "ident", value: id, line: lineNumber(source, i) });
      continue;
    }

    // Unknown character — skip
    i++;
  }

  return tokens;
}

function lineNumber(source: string, pos: number): number {
  let line = 1;
  for (let j = 0; j < pos && j < source.length; j++) {
    if (source[j] === "\n") line++;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

class ParseError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(message);
    this.name = "ParseError";
    this.line = line;
  }
}
