import { createToken, Lexer, CstParser, IToken } from "chevrotain";

interface MarkerData {
  key: string;
  label?: string;
  format: string;
  searchable?: boolean;
}
interface MarkerKV {
  label: string;
  value: string;
}
interface MarkerPayload {
  name: string;
  tooltipLabel?: string;
  tableLabel?: string;
  chartLabel?: string;
  display: string[];
  data: MarkerData | MarkerKV;
  graphs?: string;
}
interface Marker {
  start: number;
  end?: number;
  name: string;
  category: number;
  threadId?: number;
  data: MarkerPayload;
  incomplete?: boolean;
}

class Processing {
  operator: string;
  args: string;
  assignment?: string;
}

class Matcher {
  regexp: string;
  labels: string[];
  fields: string[];
}

class PlottingSpec {
  matchers: Matcher[];
  processing: Processing[];
}

export interface ParseError {
  line: number;
  column: number;
  message: string;
  length?: number;
}

export interface ParseResult {
  spec: PlottingSpec | null;
  errors: ParseError[];
}

export function parse_spec_old(text: string): PlottingSpec {
  var lines = text.split("\n");
  var state = "matchers";
  var spec = { matchers: [], processing: [] };
  lines.forEach((e: string) => {
    let index = e.indexOf("//");
    if (index != -1) {
      e = e.substring(0, index);
    }
    e = e.trim();
    if (state == "matchers") {
      if (e.length == 0 && spec.matchers.length >= 1) {
        state = "processing";
        return;
      } else if (e.length == 0) {
        return;
      }

      var reg = /###([a-zA-Z0-9_]+)/g;
      var fields = [...e.matchAll(reg)].map((e) => e[1]);
      var regexp_expanded = e.replace(reg, "").trim();

      reg = /##([a-zA-Z0-9_]+)/g;
      var labels = [...regexp_expanded.matchAll(reg)].map((e) => e[1]);
      regexp_expanded = regexp_expanded.replace(reg, "(-?[0-9.]+)");

      let regexp = regexp_expanded;
      let strip_first_last = false;
      if (
        regexp_expanded[0] == '"' &&
        regexp_expanded[regexp_expanded.length - 1] == '"'
      ) {
        regexp = "^" + regexp_expanded.slice(1, -1) + "$";
        strip_first_last = true;
      }
      if (!labels.length) {
        if (strip_first_last) {
          labels = [regexp_expanded.slice(1, -1)];
        } else {
          labels = [regexp_expanded];
        }
      }
      spec.matchers.push({
        regexp: regexp,
        labels: labels,
        fields: fields,
      });
    } else if (state == "processing") {
      var proc =
        /^(?:([a-zA-Z0-9_]+)? ?= ?)?([a-zA-Z0-9_]+)[(]([a-zA-Z0-9:., _+\-*/]+)[)]$/;

      var matches = e.match(proc);
      if (!matches) {
        return;
      }
      var assignment: string;
      var operator: string;
      var args: string;
      if (matches.length == 2) {
        operator = matches[1];
        args = matches[2];
      } else {
        assignment = matches[1];
        operator = matches[2];
        args = matches[3];
      }
      const valid_operators = [
        "derivative",
        "integral",
        "start_times",
        "sum",
        "histogram",
        "histlog",
        "histprob",
        "stats",
        "plot",
        "add",
        "sub",
        "mul",
        "div",
        "median",
        "mean",
        "geomean",
        "max",
        "min",
        "stddev",
        "variance",
        "percentile",
        "eval",
      ];
      if (!valid_operators.includes(operator)) {
        console.error(`syntax error: ${operator} isn't in ${valid_operators}`);
        return;
      }
      spec.processing.push({
        args: args,
        operator: operator,
        assignment: assignment,
      });
    }
  });
  return spec;
}

const Identifier = createToken({ name: "Identifier", pattern: /[a-zA-Z0-9_]+/ });
const Number = createToken({ name: "Number", pattern: /-?[0-9.]+/ });
const HashHash = createToken({ name: "HashHash", pattern: /##/ });
const HashHashHash = createToken({ name: "HashHashHash", pattern: /###/ });
const Quote = createToken({ name: "Quote", pattern: /"/ });
const LParen = createToken({ name: "LParen", pattern: /\(/ });
const RParen = createToken({ name: "RParen", pattern: /\)/ });
const Equals = createToken({ name: "Equals", pattern: /=/ });
const Comma = createToken({ name: "Comma", pattern: /,/ });
const Newline = createToken({ name: "Newline", pattern: /\n|\r\n?/ });
const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[ \t]+/,
});
const Comment = createToken({
  name: "Comment",
  pattern: /\/\/[^\n\r]*/,
});
const AnyChar = createToken({ name: "AnyChar", pattern: /./ });

const allTokens = [
  Comment,
  HashHashHash,
  HashHash,
  Quote,
  LParen,
  RParen,
  Equals,
  Comma,
  Newline,
  Identifier,
  Number,
  WhiteSpace,
  AnyChar,
];

const PlottingLexer = new Lexer(allTokens);

export function parse_spec(text: string): PlottingSpec {
  const result = parse_spec_with_errors(text);
  if (result.errors.length > 0) {
    console.error("Parsing errors detected:");
    result.errors.forEach((error) => {
      console.error(`Error at line ${error.line}, column ${error.column}: ${error.message}`);
    });
    throw new Error("Failed to parse specification");
  }
  return result.spec!;
}

export function parse_spec_with_errors(text: string): ParseResult {
  const lines = text.split("\n");
  const spec: PlottingSpec = { matchers: [], processing: [] };
  const errors: ParseError[] = [];
  let state: "matchers" | "processing" = "matchers";
  let lineNumber = 0;

  for (const rawLine of lines) {
    lineNumber++;
    const lexResult = PlottingLexer.tokenize(rawLine + "\n");

    if (lexResult.errors.length > 0) {
      lexResult.errors.forEach((error) => {
        errors.push({
          line: lineNumber,
          column: error.column || 1,
          message: `Lexing error: ${error.message}`,
          length: error.length || 1,
        });
      });
      continue;
    }

    const nonCommentTokens = lexResult.tokens.filter(t => t.tokenType.name !== "Comment");
    const hasContent = nonCommentTokens.some(t => t.tokenType.name !== "Newline" && t.tokenType.name !== "WhiteSpace");

    if (!hasContent && spec.matchers.length >= 1 && state === "matchers") {
      state = "processing";
      continue;
    }

    if (!hasContent) {
      continue;
    }

    if (state === "matchers") {
      const result = parseMatcherWithError(lexResult.tokens, rawLine, lineNumber);
      if (result.matcher) {
        spec.matchers.push(result.matcher);
      }
      if (result.error) {
        errors.push(result.error);
      }
    } else {
      const result = parseProcessingWithError(lexResult.tokens, rawLine, lineNumber);
      if (result.processing) {
        spec.processing.push(result.processing);
      }
      if (result.error) {
        errors.push(result.error);
      }
    }
  }

  return {
    spec: errors.length === 0 ? spec : null,
    errors: errors,
  };
}

function parseMatcher(tokens: IToken[], rawLine: string): Matcher | null {
  return parseMatcherWithError(tokens, rawLine, 0).matcher;
}

function parseMatcherWithError(tokens: IToken[], rawLine: string, lineNumber: number): { matcher: Matcher | null; error: ParseError | null } {
  let lineText = rawLine.trim();
  const commentIdx = rawLine.indexOf("//");
  if (commentIdx !== -1) {
    lineText = rawLine.substring(0, commentIdx).trim();
  }

  const processingPattern = /([a-zA-Z0-9_]+\s*=\s*)?[a-zA-Z0-9_]+\([^)]*\)/;
  if (processingPattern.test(lineText)) {
    return {
      matcher: null,
      error: {
        line: lineNumber,
        column: 1,
        message: "Processing operation found in matchers section. Add a blank line before processing operations.",
        length: lineText.length,
      }
    };
  }

  const labels: string[] = [];
  const fields: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.tokenType.name === "HashHashHash" && i + 1 < tokens.length && tokens[i + 1].tokenType.name === "Identifier") {
      fields.push(tokens[i + 1].image);
      i++;
    } else if (token.tokenType.name === "HashHash" && i + 1 < tokens.length && tokens[i + 1].tokenType.name === "Identifier") {
      labels.push(tokens[i + 1].image);
      i++;
    }
  }

  let hasQuotes = false;

  if (lineText.startsWith('"') && lineText.endsWith('"')) {
    hasQuotes = true;
    lineText = lineText.slice(1, -1);
  }

  let regexpText = lineText.replace(/###[a-zA-Z0-9_]+/g, "").trim();
  regexpText = regexpText.replace(/##[a-zA-Z0-9_]+/g, "(-?[0-9.]+)");

  let regexp = regexpText;
  if (hasQuotes) {
    regexp = "^" + regexpText + "$";
  }

  if (labels.length === 0) {
    labels.push(regexpText);
  }

  return {
    matcher: {
      regexp: regexp,
      labels: labels,
      fields: fields,
    },
    error: null,
  };
}

function parseProcessing(tokens: IToken[], rawLine: string): Processing | null {
  return parseProcessingWithError(tokens, rawLine, 0).processing;
}

function parseProcessingWithError(tokens: IToken[], rawLine: string, lineNumber: number): { processing: Processing | null; error: ParseError | null } {
  const proc = /^(?:([a-zA-Z0-9_]+)\s*=\s*)?([a-zA-Z0-9_]+)\s*[(]([a-zA-Z0-9:., _+\-*/]+)[)]$/;

  let lineText = rawLine.trim();
  const commentIdx = rawLine.indexOf("//");
  if (commentIdx !== -1) {
    lineText = rawLine.substring(0, commentIdx).trim();
  }

  if (!lineText) {
    return { processing: null, error: null };
  }

  const matches = lineText.match(proc);
  if (!matches) {
    const parenMatch = lineText.match(/([a-zA-Z0-9_]+)\(/);
    if (parenMatch) {
      return {
        processing: null,
        error: {
          line: lineNumber,
          column: lineText.indexOf('(') + 1,
          message: `Invalid processing syntax. Expected format: operator(args) or var = operator(args)`,
          length: lineText.length,
        }
      };
    }
    return {
      processing: null,
      error: {
        line: lineNumber,
        column: 1,
        message: `Invalid processing line. Expected format: operator(args) or var = operator(args)`,
        length: lineText.length,
      }
    };
  }

  let assignment: string | undefined;
  let operator: string;
  let args: string;

  if (matches.length === 2) {
    operator = matches[1];
    args = matches[2];
  } else {
    assignment = matches[1];
    operator = matches[2];
    args = matches[3];
  }

  const valid_operators = [
    "derivative",
    "integral",
    "start_times",
    "sum",
    "histogram",
    "histlog",
    "histprob",
    "stats",
    "plot",
    "add",
    "sub",
    "mul",
    "div",
    "median",
    "mean",
    "geomean",
    "max",
    "min",
    "stddev",
    "variance",
    "percentile",
    "eval",
  ];

  if (!valid_operators.includes(operator)) {
    const operatorPos = lineText.indexOf(operator);
    return {
      processing: null,
      error: {
        line: lineNumber,
        column: operatorPos + 1,
        message: `Unknown operator '${operator}'. Valid operators: ${valid_operators.join(', ')}`,
        length: operator.length,
      }
    };
  }

  return {
    processing: {
      operator: operator,
      args: args,
      assignment: assignment,
    },
    error: null,
  };
}
