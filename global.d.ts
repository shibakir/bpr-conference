import type { Locale } from "./src/i18n/routing";
import messages from "./messages/cs.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
