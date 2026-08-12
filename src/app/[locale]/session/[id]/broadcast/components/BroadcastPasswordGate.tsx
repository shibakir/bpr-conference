"use client";

import { LockKeyholeIcon, LogInIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent } from "react";

import { CenteredPage } from "@/components/CenteredPage";
import { PasswordInput } from "@/components/PasswordInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
            <Card className="w-full max-w-xl shadow-md shadow-foreground/5">
                <CardHeader className="px-5 pt-5 sm:px-6">
                    <CardTitle className="flex items-center gap-2 text-left">
                        <LockKeyholeIcon className="size-5" />
                        {t("passwordRequiredTitle")}
                    </CardTitle>
                    <CardDescription>{t("passwordProtected")}</CardDescription>
                </CardHeader>
                <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                    <FieldGroup className="gap-4">
                        <form className="grid gap-4" onSubmit={onSubmit}>
                            <Field data-invalid={!!passwordError}>
                                <FieldLabel htmlFor="broadcast-password">
                                    {t("passwordPlaceholder")}
                                </FieldLabel>
                                <PasswordInput
                                    id="broadcast-password"
                                    autoComplete="new-password"
                                    placeholder={t("passwordPlaceholder")}
                                    value={localPassword}
                                    onChange={(e) => onPasswordChange(e.target.value)}
                                    disabled={verifying}
                                    aria-invalid={!!passwordError}
                                    required
                                />
                            </Field>

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
                        <Button variant="ghost" onClick={onCancel} className="w-full">
                            {t("cancel")}
                        </Button>
                    </FieldGroup>
                </CardContent>
            </Card>
        </CenteredPage>
    );
}
