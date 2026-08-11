import fs from "node:fs";
import path from "node:path";
import util from "node:util";

const CONSOLE_METHODS = ["debug", "error", "info", "log", "warn"] as const;

type ConsoleMethod = (typeof CONSOLE_METHODS)[number];
type ConsoleMethodFn = (...data: unknown[]) => void;

declare global {
  var __bprConsoleLogFilePatched: boolean | undefined;
}

let appendFailureReported = false;

export function registerConsoleLogFile() {
  if (globalThis.__bprConsoleLogFilePatched) {
    return;
  }

  globalThis.__bprConsoleLogFilePatched = true;

  const logFilePath = resolveLogFilePath();
  const originalConsole = captureConsole();
  const reportError = originalConsole.error.bind(console);

  ensureLogDirectory(logFilePath, reportError);

  for (const method of CONSOLE_METHODS) {
    const originalMethod = originalConsole[method].bind(console);

    console[method] = ((...data: unknown[]) => {
      originalMethod(...data);
      appendConsoleLine(logFilePath, method, data, reportError);
    }) as ConsoleMethodFn;
  }
}

function captureConsole(): Record<ConsoleMethod, ConsoleMethodFn> {
  return CONSOLE_METHODS.reduce(
    (captured, method) => ({
      ...captured,
      [method]: console[method],
    }),
    {} as Record<ConsoleMethod, ConsoleMethodFn>,
  );
}

function resolveLogFilePath() {
  return path.join(process.cwd(), "logs", "app.log");
}

function ensureLogDirectory(
  logFilePath: string,
  reportError: ConsoleMethodFn,
) {
  try {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  } catch (error) {
    reportError("[FileLogger] Failed to create log directory:", error);
  }
}

function appendConsoleLine(
  logFilePath: string,
  method: ConsoleMethod,
  data: unknown[],
  reportError: ConsoleMethodFn,
) {
  try {
    fs.appendFileSync(logFilePath, formatLogLine(method, data), "utf8");
  } catch (error) {
    if (!appendFailureReported) {
      appendFailureReported = true;
      reportError("[FileLogger] Failed to append log line:", error);
    }
  }
}

function formatLogLine(method: ConsoleMethod, data: unknown[]) {
  const message = util.format(...data);
  const normalizedMessage = message.endsWith("\n")
    ? message.slice(0, -1)
    : message;

  return `[${new Date().toISOString()}] ${method.toUpperCase()} ${normalizedMessage}\n`;
}
