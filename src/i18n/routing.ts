import { defineRouting } from "next-intl/routing";

export const locales = ["en", "cs"] as const;

export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const routing = defineRouting({
  locales,
  defaultLocale: "cs",
  localePrefix: "as-needed",
});
