import { getAuthFromCookies } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import {
  completePersistedSearchCampaign,
  createPersistedSearchCampaign,
  recordSearchLead,
} from "@/lib/career/search-persistence";
import { searchRequestSchema } from "@/lib/search/schema";
import { streamSearchJobs } from "@/lib/search/server/stream";
import type { ErrorEvent, SearchSource } from "@/lib/search/types";
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

  await connectToDatabase();
  const campaign = await createPersistedSearchCampaign(auth.userId, parsedBody.data);

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        let isClosed = false;
        let persistedResultCount = 0;
        const blockedSources = new Set<SearchSource>();
        let finalized = false;

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

        const finalizeCampaign = async (args?: {
          status?: "completed" | "failed" | "canceled";
          errorMessage?: string;
          totalResults?: number;
        }) => {
          if (finalized) return;
          finalized = true;

          await completePersistedSearchCampaign(campaign._id.toString(), {
            totalResults: args?.totalResults ?? persistedResultCount,
            blockedSources: [...blockedSources],
            errorMessage: args?.errorMessage,
            status: args?.status || "completed",
          });
        };

        try {
          for await (const event of streamSearchJobs(parsedBody.data, { signal: req.signal })) {
            if (req.signal.aborted) {
              await finalizeCampaign({ status: "canceled" });
              safeClose();
              return;
            }

            if (event.type === "source-progress" && event.status === "blocked") {
              blockedSources.add(event.source);
            }

            if (event.type === "result") {
              await recordSearchLead(auth.userId, campaign._id.toString(), event.result);
              persistedResultCount += 1;
            }

            if (event.type === "complete") {
              event.blockedSources.forEach((source) => blockedSources.add(source));
              persistedResultCount = event.totalResults;
              await finalizeCampaign({
                status: "completed",
                totalResults: event.totalResults,
              });
            }

            safeEnqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
          }
        } catch (error) {
          if (!req.signal.aborted) {
            await finalizeCampaign({
              status: "failed",
              errorMessage:
                error instanceof Error ? error.message : "Search worker exited unexpectedly.",
            });
            safeEnqueue(
              errorLine(
                error instanceof Error ? error.message : "Search worker exited unexpectedly.",
                true,
              ),
            );
          } else {
            await finalizeCampaign({ status: "canceled" });
          }
        } finally {
          if (!finalized) {
            await finalizeCampaign({
              status: req.signal.aborted ? "canceled" : "completed",
            });
          }
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
