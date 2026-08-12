export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return (await req.json()) as unknown;
  } catch {
    return {};
  }
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  return body as T;
}

export function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export async function readJsonObject(
  req: Request
): Promise<Record<string, unknown>> {
  const body = await readJsonBody(req);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  return body as Record<string, unknown>;
}
