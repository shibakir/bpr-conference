// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchValidatedJson } from "@/lib/api-client";

import { TranslationActions } from "./TranslationActions";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/api-client", () => ({
    fetchValidatedJson: vi.fn(),
    ApiRequestError: class extends Error {
        code?: string;
    },
}));
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("owner translation controls", () => {
    it("sends one authenticated language-specific command and stays disabled until its result", async () => {
        let resolve!: (result: unknown) => void;
        vi.mocked(fetchValidatedJson).mockImplementation(
            () =>
                new Promise((r) => {
                    resolve = r;
                }),
        );
        const props = {
            sessionId: "room",
            organizerKey: "owner",
            language: "cs",
            active: true,
            control: undefined,
            onChanged: vi.fn(),
        };
        const { rerender } = render(<TranslationActions {...props} />);
        const button = screen.getByRole("button", { name: "resetLanguage" });
        fireEvent.click(button);
        fireEvent.click(button);
        expect(fetchValidatedJson).toHaveBeenCalledTimes(1);
        const [url, options] = vi.mocked(fetchValidatedJson).mock.calls[0]!;
        expect(url).toBe("/api/sessions/room/translations/cs/reset");
        const body = JSON.parse(options!.body as string) as {
            requestId: string;
            organizerKey: string;
        };
        expect(body.organizerKey).toBe("owner");
        expect(body.requestId).toMatch(/^[\da-f-]{36}$/);
        const operation = {
            id: body.requestId,
            action: "reset" as const,
            state: "resetting" as const,
            startedAt: 1,
        };
        await act(async () => {
            resolve({ operation });
        });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        rerender(
            <TranslationActions
                {...props}
                control={{
                    historyRevision: 1,
                    operation: { ...operation, state: "completed", finishedAt: 2 },
                }}
            />,
        );
        expect((button as HTMLButtonElement).disabled).toBe(false);
        expect(screen.getByRole("status").textContent).toBe("resetCompleted");
    });
    it("reuses the same id after an uncertain network failure and displays unconfirmed drain honestly", async () => {
        vi.mocked(fetchValidatedJson).mockRejectedValue(new Error("Network error"));
        const props = {
            sessionId: "room",
            organizerKey: "owner",
            language: "cs",
            active: true,
            control: undefined,
            onChanged: vi.fn(),
        };
        const { rerender } = render(<TranslationActions {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "drainLanguage" }));
        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("failed"));
        fireEvent.click(screen.getByRole("button", { name: "drainLanguage" }));
        await waitFor(() => expect(fetchValidatedJson).toHaveBeenCalledTimes(2));
        const bodies = vi
            .mocked(fetchValidatedJson)
            .mock.calls.map(
                ([, options]) => JSON.parse(options!.body as string) as { requestId: string },
            );
        expect(bodies[0]?.requestId).toBe(bodies[1]?.requestId);
        cleanup();
        render(
            <TranslationActions
                {...props}
                control={{
                    historyRevision: 0,
                    operation: {
                        id: "test",
                        action: "drain",
                        state: "unconfirmed",
                        startedAt: 1,
                        finishedAt: 2,
                    },
                }}
            />,
        );
        expect(screen.getByRole("status").textContent).toBe("unconfirmed");
        void rerender;
    });
});
