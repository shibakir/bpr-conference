export async function register() {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") {
    return;
  }

  const { registerConsoleLogFile } = await import(
    "./lib/server-console-log-file"
  );

  registerConsoleLogFile();
}
