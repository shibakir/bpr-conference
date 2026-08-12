export async function register() {
    if (process.env["NEXT_RUNTIME"] !== "nodejs") {
        return;
    }

    const { registerServerLogger } = await import("./lib/logger");

    registerServerLogger();
}
