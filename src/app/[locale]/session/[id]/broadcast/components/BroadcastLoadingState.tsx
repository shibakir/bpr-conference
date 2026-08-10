"use client";

import { Spinner } from "@/components/ui/spinner";

export function BroadcastLoadingState() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <Spinner className="size-5 text-muted-foreground" />
    </main>
  );
}
