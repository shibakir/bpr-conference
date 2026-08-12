"use client";

import { LockKeyholeIcon, LogInIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent } from "react";

import { CenteredPage } from "@/components/CenteredPage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function BroadcastPasswordGate({
  localPassword,
  passwordError,
  verifying,
  onCancel,
  onPasswordChange,
  onSubmit,
}: {
  localPassword: string;
  passwordError: string | null;
  verifying: boolean;
  onCancel: () => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const t = useTranslations("Broadcast");

  return (
    <CenteredPage>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-3xl">
            <LockKeyholeIcon className="size-5" />
            {t("password")} {t("required")}
          </CardTitle>
          <CardDescription>{t("passwordProtected")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="broadcast-password">
                {t("passwordPlaceholder")}
              </Label>
              <Input
                id="broadcast-password"
                type="password"
                autoComplete="new-password"
                placeholder={t("passwordPlaceholder")}
                value={localPassword}
                onChange={(e) => onPasswordChange(e.target.value)}
                disabled={verifying}
                required
              />
            </div>

            {passwordError && (
              <Alert variant="destructive">
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={verifying} className="w-full">
              {verifying ? (
                <>
                  <Spinner />
                  {t("verifying")}
                </>
              ) : (
                <>
                  <LogInIcon />
                  {t("submit")}
                </>
              )}
            </Button>
          </form>
          <Button variant="ghost" onClick={onCancel} className="mt-2 w-full">
            {t("cancel")}
          </Button>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
