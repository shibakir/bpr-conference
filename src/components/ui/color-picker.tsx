"use client";

import * as React from "react";
import { HexColorPicker } from "react-colorful";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function normalizeHexInput(value: string) {
    const trimmed = value.trim();
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function isHexColor(value: string) {
    return HEX_COLOR_PATTERN.test(value);
}

function ColorPicker({
    className,
    id,
    label,
    onChange,
    onOpenChange,
    open,
    value,
}: {
    className?: string;
    id: string;
    label: string;
    onChange: (value: string) => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    value: string;
}) {
    const [draftValue, setDraftValue] = React.useState<string | null>(null);
    const inputValue = draftValue ?? value;

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextInputValue = event.target.value;
        const nextColor = normalizeHexInput(nextInputValue);

        setDraftValue(nextInputValue);
        if (isHexColor(nextColor)) {
            onChange(nextColor.toLowerCase());
        }
    };

    const handleInputBlur = () => {
        setDraftValue(null);
    };

    return (
        <div className={cn("relative grid gap-2", className)}>
            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={id} className="text-xs text-muted-foreground">
                    {label}
                </Label>
                <div className="flex items-center gap-2">
                    <Input
                        id={id}
                        value={inputValue}
                        onBlur={handleInputBlur}
                        onChange={handleInputChange}
                        spellCheck={false}
                        className="h-7 w-24 font-mono text-xs uppercase"
                        maxLength={7}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-expanded={open}
                        aria-label={label}
                        title={label}
                        onClick={() => onOpenChange(!open)}
                        className="overflow-hidden p-0"
                    >
                        <span
                            className="size-full rounded-[inherit]"
                            style={{ backgroundColor: value }}
                            aria-hidden="true"
                        />
                    </Button>
                </div>
            </div>

            {open && (
                <div
                    className="absolute top-full right-0 z-20 mt-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl"
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <HexColorPicker color={value} onChange={onChange} className="!h-36 !w-56" />
                </div>
            )}
        </div>
    );
}

export { ColorPicker };
