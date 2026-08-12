import { type ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function CenteredPage({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <main
            className={cn(
                "flex min-h-[calc(100svh-var(--app-header-height))] items-start justify-center px-4 py-10",
                className,
            )}
        >
            {children}
        </main>
    );
}

export function CenteredLoadingState({ label }: { label?: string }) {
    return (
        <CenteredPage>
            {label ? (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Spinner className="size-5" />
                    <p className="font-mono text-xs">{label}</p>
                </div>
            ) : (
                <Spinner className="size-5 text-muted-foreground" />
            )}
        </CenteredPage>
    );
}
