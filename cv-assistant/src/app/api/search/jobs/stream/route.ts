import { spawn } from "node:child_process";
import path from "node:path";
import { getAuthFromCookies } from "@/lib/auth";
import { searchRequestSchema } from "@/lib/search/schema";
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

  const workerPath = path.join(process.cwd(), "src", "search", "worker.py");
  const pythonPath = path.join(process.cwd(), "src");
  const payload = JSON.stringify(parsedBody.data);
  let terminateWorker = () => {};

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        let isClosed = false;
        let wasAborted = false;
        let didComplete = false;
        let stderrOutput = "";

        // Motivation vs Logic:
        // Motivation: The job search can span multiple sources and dozens of detail fetches, so the UI needs live
        // progress without waiting for one huge response or re-implementing crawler logic in JavaScript.
        // Logic: Keep the route focused on auth, validation, and process orchestration, then forward the Python
        // worker's NDJSON stream directly so the frontend can react to incremental source updates and results.
        const worker = spawn("python3", [workerPath], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PYTHONPATH: pythonPath,
            PYTHONUNBUFFERED: "1",
          },
          stdio: ["pipe", "pipe", "pipe"],
        });

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

        terminateWorker = () => {
          if (worker.killed) return;
          worker.kill("SIGTERM");
          setTimeout(() => {
            if (!worker.killed) {
              worker.kill("SIGKILL");
            }
          }, 1000);
        };

        const abortListener = () => {
          wasAborted = true;
          terminateWorker();
          safeClose();
        };

        req.signal.addEventListener("abort", abortListener);

        worker.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          if (text.includes('"type":"complete"')) {
            didComplete = true;
          }
          safeEnqueue(new Uint8Array(chunk));
        });

        worker.stderr.on("data", (chunk: Buffer) => {
          stderrOutput += chunk.toString("utf8");
        });

        worker.on("error", (error) => {
          safeEnqueue(errorLine(error.message || "Failed to start the search worker.", true));
          safeClose();
        });

        worker.on("close", (code) => {
          req.signal.removeEventListener("abort", abortListener);

          if (wasAborted) {
            safeClose();
            return;
          }

          if (!didComplete && code !== 0) {
            const detail = stderrOutput.trim();
            safeEnqueue(
              errorLine(
                detail
                  ? `Search worker exited unexpectedly: ${detail}`
                  : "Search worker exited unexpectedly.",
                true,
              ),
            );
          }

          safeClose();
        });

        worker.stdin.write(payload);
        worker.stdin.end();
      },
      cancel() {
        // A canceled client stream should stop the worker even if the fetch transport stays open briefly.
        terminateWorker();
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
