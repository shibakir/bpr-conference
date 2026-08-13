"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ComponentProps, useState } from "react";

import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";

function PasswordInput({ disabled, type: _type, ...props }: ComponentProps<"input">) {
    const t = useTranslations("PasswordInput");
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const toggleLabel = isPasswordVisible ? t("hidePassword") : t("showPassword");
    const ToggleIcon = isPasswordVisible ? EyeOffIcon : EyeIcon;

    return (
        <InputGroup>
            <InputGroupInput
                type={isPasswordVisible ? "text" : "password"}
                disabled={disabled}
                {...props}
            />
            <InputGroupAddon align="inline-end">
                <InputGroupButton
                    type="button"
                    size="icon-xs"
                    aria-label={toggleLabel}
                    aria-pressed={isPasswordVisible}
                    title={toggleLabel}
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setIsPasswordVisible((visible) => !visible)}
                >
                    <ToggleIcon />
                </InputGroupButton>
            </InputGroupAddon>
        </InputGroup>
    );
}

export { PasswordInput };
