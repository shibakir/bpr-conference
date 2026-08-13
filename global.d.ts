import type messages from "./messages/cs.json";
import type { Locale } from "./src/i18n/routing";

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            NEXT_PUBLIC_ATTENDEE_ORIGIN?: string;
        }
    }
}

declare module "next-intl" {
    interface AppConfig {
        Locale: Locale;
        Messages: typeof messages;
    }
}
