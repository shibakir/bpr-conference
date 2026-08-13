import { defineRouting } from "next-intl/routing";

import { defaultLocale, isLocale, locales } from "./locales";

export { defaultLocale, isLocale, locales };
export type { Locale } from "./locales";

export const routing = defineRouting({
    locales,
    defaultLocale,
    localePrefix: "always",
});
