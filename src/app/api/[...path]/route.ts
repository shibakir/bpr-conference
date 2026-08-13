import { API_ERROR_CODES, apiError } from "@/lib/api-errors";
import { getBackendApiOrigin } from "@/lib/backend-origin";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{
        path?: string[];
    }>;
};

const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "content-encoding",
    "content-length",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

function createUpstreamUrl(requestUrl: string, path: string[]) {
    const upstreamUrl = new URL(
        `/api/${path.map((segment) => encodeURIComponent(segment)).join("/")}`,
        getBackendApiOrigin(),
    );
    upstreamUrl.search = new URL(requestUrl).search;
    return upstreamUrl;
}

function cloneForwardedHeaders(headers: Headers) {
    const forwardedHeaders = new Headers(headers);

    forwardedHeaders.delete("host");
    for (const header of HOP_BY_HOP_HEADERS) {
        forwardedHeaders.delete(header);
    }

    return forwardedHeaders;
}

async function proxyApiRequest(req: Request, context: RouteContext) {
    const { path = [] } = await context.params;
    const upstreamUrl = createUpstreamUrl(req.url, path);
    const init: RequestInit = {
        method: req.method,
        headers: cloneForwardedHeaders(req.headers),
        redirect: "manual",
        cache: "no-store",
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = await req.arrayBuffer();
    }

    try {
        const upstreamResponse = await fetch(upstreamUrl, init);
        const responseHeaders = cloneForwardedHeaders(upstreamResponse.headers);

        return new Response(upstreamResponse.body, {
            status: upstreamResponse.status,
            statusText: upstreamResponse.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        console.error("[api proxy] Backend API proxy failed", {
            error,
            upstreamUrl: upstreamUrl.toString(),
        });
        return Response.json(
            apiError(API_ERROR_CODES.BACKEND_UNAVAILABLE, "Backend API unavailable"),
            { status: 502 },
        );
    }
}

export function GET(req: Request, context: RouteContext) {
    return proxyApiRequest(req, context);
}

export function POST(req: Request, context: RouteContext) {
    return proxyApiRequest(req, context);
}

export function DELETE(req: Request, context: RouteContext) {
    return proxyApiRequest(req, context);
}

export function PUT(req: Request, context: RouteContext) {
    return proxyApiRequest(req, context);
}

export function PATCH(req: Request, context: RouteContext) {
    return proxyApiRequest(req, context);
}

export function HEAD(req: Request, context: RouteContext) {
    return proxyApiRequest(req, context);
}

export function OPTIONS(req: Request, context: RouteContext) {
    return proxyApiRequest(req, context);
}
