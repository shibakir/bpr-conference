import type messages from "./messages/cs.json";
import type { Locale } from "./src/i18n/routing";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
