import { getAuthFromCookies } from "@/lib/auth";
import { searchRequestSchema } from "@/lib/search/schema";
import { streamSearchJobs } from "@/lib/search/server/stream";
import type { ErrorEvent } from "@/lib/search/types";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorLine(message: string, fatal = false): Uint8Array {
  const event: ErrorEvent = { type: "error", message, fatal };
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(req: NextRequest) {
  const auth = getAuthFromCookies(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsedBody = searchRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return new Response(
      JSON.stringify({
        error: parsedBody.error.issues[0]?.message || "Invalid search payload.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        let isClosed = false;

        // Motivation vs Logic:
        // Motivation: Vercel can run this feature only if the crawl stays inside the Node.js runtime rather than
        // spawning a separate Python process that the platform does not provide as part of a Next.js function.
        // Logic: Keep the route focused on auth, validation, and streaming orchestration, then forward the native
        // TypeScript crawler's async-generator events directly so the frontend preserves the same live contract.

        const safeClose = () => {
          if (isClosed) return;
          isClosed = true;
          try {
            controller.close();
          } catch {
            // The stream may already be closed if the client disconnects mid-chunk.
          }
        };

        const safeEnqueue = (value: Uint8Array) => {
          if (isClosed) return;
          try {
            controller.enqueue(value);
          } catch {
            isClosed = true;
          }
        };

        try {
          for await (const event of streamSearchJobs(parsedBody.data, { signal: req.signal })) {
            if (req.signal.aborted) {
              safeClose();
              return;
            }
            safeEnqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
          }
        } catch (error) {
          if (!req.signal.aborted) {
            safeEnqueue(
              errorLine(
                error instanceof Error ? error.message : "Search worker exited unexpectedly.",
                true,
              ),
            );
          }
        } finally {
          safeClose();
        }
      },
      cancel() {
        req.signal.throwIfAborted?.();
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    },
  );
}
