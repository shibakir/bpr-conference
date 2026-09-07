"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useListScrollAnchor } from "@/hooks/use-list-scroll-anchor";
import {
    filterLanguageOptions,
    type LanguageOption,
    prioritizeSelectedLanguages,
} from "@/lib/language-search";
import { cn } from "@/lib/utils";

interface LanguageMultiSelectProps {
    label: string;
    languages: readonly LanguageOption[];
    selectedLanguages: readonly string[];
    onSelectionChange: (languages: string[]) => void;
    disabled?: boolean;
    allowSelectAll?: boolean;
    showSelectionChips?: boolean;
    emptyMessage?: string;
}

export function LanguageMultiSelect({
    label,
    languages,
    selectedLanguages,
    onSelectionChange,
    disabled = false,
    allowSelectAll = false,
    showSelectionChips = true,
    emptyMessage,
}: LanguageMultiSelectProps) {
    const t = useTranslations("LanguagePicker");
    const id = useId();
    const searchRef = useRef<HTMLInputElement>(null);
    const { listRef, preserveScroll } = useListScrollAnchor();
    const [query, setQuery] = useState("");
    const selected = useMemo(() => new Set(selectedLanguages), [selectedLanguages]);
    const selectedOptions = useMemo(
        () => languages.filter((language) => selected.has(language.code)),
        [languages, selected],
    );
    const filtered = useMemo(
        () => prioritizeSelectedLanguages(filterLanguageOptions(languages, query), selected),
        [languages, query, selected],
    );

    function changeSelection(next: string[]) {
        const nextSelected = new Set(next);
        const changedKeys = new Set(
            [...selected, ...nextSelected].filter(
                (code) => selected.has(code) !== nextSelected.has(code),
            ),
        );
        preserveScroll(changedKeys);
        onSelectionChange(next);
    }

    function setLanguageSelected(code: string, checked: boolean) {
        changeSelection(
            checked
                ? Array.from(new Set([...selectedLanguages, code]))
                : selectedLanguages.filter((language) => language !== code),
        );
    }

    return (
        <div className="grid min-w-0 gap-2" role="group" aria-labelledby={`${id}-label`}>
            <FieldLabel id={`${id}-label`} htmlFor={`${id}-search`}>
                {label}
            </FieldLabel>
            <div className="rounded-lg bg-muted/20 p-1">
                <div className="p-1 pb-0">
                    <Input
                        ref={searchRef}
                        id={`${id}-search`}
                        type="search"
                        className="text-base"
                        autoComplete="off"
                        placeholder={t("searchLanguages")}
                        aria-label={t("searchIn", { label })}
                        aria-controls={`${id}-list`}
                        value={query}
                        disabled={disabled}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") event.preventDefault();
                            if (event.key === "Escape") setQuery("");
                        }}
                    />
                </div>
                {/* Contain Radix's hidden form inputs so they cannot extend the page height. */}
                <div
                    ref={listRef}
                    id={`${id}-list`}
                    className="relative h-60 scroll-auto overflow-y-auto px-1 py-1 [overflow-anchor:none]"
                >
                    {filtered.length === 0 ? (
                        <p
                            role="status"
                            className="px-2 py-6 text-center text-base text-muted-foreground"
                        >
                            {languages.length === 0
                                ? (emptyMessage ?? t("noLanguages"))
                                : t("noMatches")}
                        </p>
                    ) : (
                        <div className="grid gap-1">
                            {filtered.map((language) => (
                                <div
                                    key={language.code}
                                    data-scroll-anchor={language.code}
                                    className="flex min-h-9 items-center gap-2 rounded-sm px-2 py-1.5 text-base transition-colors hover:bg-muted"
                                >
                                    <Checkbox
                                        id={`${id}-${language.code}`}
                                        checked={selected.has(language.code)}
                                        disabled={disabled}
                                        onCheckedChange={(checked) =>
                                            setLanguageSelected(language.code, checked === true)
                                        }
                                    />
                                    <label
                                        htmlFor={`${id}-${language.code}`}
                                        className={cn(
                                            "min-w-0 flex-1 cursor-pointer select-none",
                                            disabled && "cursor-not-allowed opacity-50",
                                        )}
                                    >
                                        <span className="block truncate">
                                            {language.flag} {language.displayName}
                                        </span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-1">
                <span role="status" className="text-sm text-muted-foreground">
                    {t("selectedCount", { count: selectedOptions.length })}
                </span>
                <div className="flex gap-1">
                    {allowSelectAll && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={disabled || languages.length === 0}
                            onClick={() =>
                                changeSelection(languages.map((language) => language.code))
                            }
                        >
                            {t("selectAll")}
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={disabled || selectedOptions.length === 0}
                        onClick={() => changeSelection([])}
                    >
                        {t("clear")}
                    </Button>
                </div>
            </div>
            {showSelectionChips && selectedOptions.length > 0 && (
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto p-0.5">
                    {selectedOptions.map((language) => (
                        <Button
                            key={language.code}
                            type="button"
                            variant="secondary"
                            size="xs"
                            disabled={disabled}
                            className="max-w-full"
                            aria-label={t("removeLanguage", { language: language.displayName })}
                            onClick={() => {
                                setLanguageSelected(language.code, false);
                                searchRef.current?.focus();
                            }}
                        >
                            <span className="truncate">
                                {language.flag} {language.displayName}
                            </span>
                            <XIcon aria-hidden="true" />
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}
