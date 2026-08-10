"use client";

import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";

export function WatchLoadingState() {
  const t = useTranslations("Watch");

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Spinner className="size-5" />
        <p className="font-mono text-xs">{t("joining")}</p>
      </div>
    </main>
  );
}
