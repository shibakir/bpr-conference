import type { z } from "zod";

import { type ApiErrorCode, getApiErrorCode } from "@/lib/api-errors";

type ApiRequestErrorOptions = {
  code?: ApiErrorCode;
  message?: string;
  status: number;
};

export class ApiRequestError extends Error {
  readonly code: ApiErrorCode | undefined;
  readonly status: number;

  constructor({ code, message, status }: ApiRequestErrorOptions) {
    super(message ?? "API request failed");
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

export async function fetchValidatedJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(input, init);
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new ApiRequestError({
      ...addOptionalCode(getApiErrorCode(body)),
      status: response.status,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiRequestError({
      message: "Invalid API response",
      status: response.status,
    });
  }

  return parsed.data;
}

function addOptionalCode(code: ApiErrorCode | undefined) {
  return code ? { code } : {};
}
