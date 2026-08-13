import { getRequestConfig } from "next-intl/server";

import { isLocale, routing } from "./routing";

type MessagesModule = {
    default: Record<string, unknown>;
};

export default getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale;
    const locale = requested && isLocale(requested) ? requested : routing.defaultLocale;
    const messagesModule = (await import(
        `../../messages/${locale}.json`
    )) as unknown as MessagesModule;

    return {
        locale,
        messages: messagesModule.default,
    };
});
