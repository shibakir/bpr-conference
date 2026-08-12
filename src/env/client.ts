import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const clientEnv = createEnv({
    client: {
        NEXT_PUBLIC_ATTENDEE_ORIGIN: z.string().trim().url().optional(),
    },
    runtimeEnv: {
        NEXT_PUBLIC_ATTENDEE_ORIGIN: process.env["NEXT_PUBLIC_ATTENDEE_ORIGIN"],
    },
    emptyStringAsUndefined: true,
});
