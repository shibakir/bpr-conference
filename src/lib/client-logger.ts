"use client";

type ClientLogLevel = "debug" | "error" | "info" | "warn";

const isProduction = process.env.NODE_ENV === "production";

function shouldWrite(level: ClientLogLevel) {
    return level === "error" || level === "warn" || !isProduction;
}

function write(level: ClientLogLevel, message: string, context?: unknown) {
    if (!shouldWrite(level)) return;

    if (context === undefined) {
        console[level](message);
        return;
    }

    console[level](message, context);
}

export const clientLogger = {
    debug: (message: string, context?: unknown) => write("debug", message, context),
    error: (message: string, context?: unknown) => write("error", message, context),
    info: (message: string, context?: unknown) => write("info", message, context),
    warn: (message: string, context?: unknown) => write("warn", message, context),
};
