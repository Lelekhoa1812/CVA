import assert from "node:assert/strict";
import { AUTOMATIC_RETRY_MESSAGE, streamSearchJobs } from "../../src/lib/search/server/stream";
import type { SearchRequest, SearchStreamEvent } from "../../src/lib/search/types";
import { sharesNoTitleTerm, stripHtmlTags } from "../../src/lib/search/server/utils";

type TestCase = { name: string; run: () => void | Promise<void> };
type Fetch = typeof globalThis.fetch;
const originalFetch = globalThis.fetch;

const request: SearchRequest = {
  jobTitle: "Software Engineer",
  location: "Melbourne",
  filters: { postedWithin: "any", workplaceMode: "any", employmentType: "any" },
  maxResultsPerSource: 25,
  selectedSources: ["linkedin"],
};

async function collectEvents(
  sourceRequest: SearchRequest = request,
  signal?: AbortSignal,
) {
  const events: SearchStreamEvent[] = [];
  for await (const event of streamSearchJobs(sourceRequest, { signal })) events.push(event);
  return events;
}

function linkedinCards(count: number, offset = 0) {
  return `<ul>${Array.from({ length: count }, (_, index) => `
    <li class="base-search-card">
      <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/${index + offset + 1}/"></a>
      <h3 class="base-search-card__title">Software Engineer ${index + offset + 1}</h3>
      <h4 class="base-search-card__subtitle">Example Co ${index + offset + 1}</h4>
      <span class="job-search-card__location">Melbourne</span>
    </li>`).join("")}</ul>`;
}

// Offline board fixtures. Each URL maps to a page body; any other URL gets an empty page, so no test reaches the network.
function stubBoardPages(pages: Record<string, string>) {
  globalThis.fetch = (async (input) => new Response(pages[String(input)] ?? "", { status: 200 })) as Fetch;
}

function jsonLdPage(payload: Record<string, unknown>) {
  return `<html><head><script type="application/ld+json">${JSON.stringify(payload)}</script></head><body></body></html>`;
}

const careerOneRequest: SearchRequest = {
  jobTitle: "AI Engineer",
  location: "Melbourne",
  filters: { postedWithin: "any", workplaceMode: "any", employmentType: "any" },
  maxResultsPerSource: 25,
  selectedSources: ["careerone"],
};

const tests: TestCase[] = [
  {
    name: "search retries a source error and completes when the next attempt recovers",
    run: async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("temporary network failure");
        return new Response("", { status: 200 });
      }) as Fetch;

      const events = await collectEvents();
      const retries = events.filter(
        (event) => event.type === "source-progress" && event.message === AUTOMATIC_RETRY_MESSAGE,
      );
      assert.equal(calls, 2);
      assert.equal(retries.length, 1);
      assert.ok(retries.every((event) => event.type === "source-progress" && event.status === "running"));
      assert.ok(events.some((event) => event.type === "complete"));
      assert.ok(!events.some((event) => event.type === "error"));
    },
  },
  {
    name: "search retries twice and completes when the third attempt recovers",
    run: async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        if (calls < 3) throw new TypeError("temporary network failure");
        return new Response("", { status: 200 });
      }) as Fetch;

      const events = await collectEvents();
      const retries = events.filter(
        (event) => event.type === "source-progress" && event.message === AUTOMATIC_RETRY_MESSAGE,
      );
      assert.equal(calls, 3);
      assert.equal(retries.length, 2);
      assert.ok(retries.every((event) => event.type === "source-progress" && event.status === "running"));
      assert.ok(events.some((event) => event.type === "complete"));
      assert.ok(!events.some((event) => event.type === "error"));
    },
  },
  {
    name: "source progress is delivered while a fetch is still pending",
    run: async () => {
      let resolveFetch!: (response: Response) => void;
      let fetchStarted = false;
      globalThis.fetch = (async () => {
        fetchStarted = true;
        return await new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }) as Fetch;

      const iterator = streamSearchJobs(request);
      assert.equal((await iterator.next()).value?.type, "status");
      const progressPromise = iterator.next();
      while (!fetchStarted) await new Promise<void>((resolve) => setImmediate(resolve));
      const progress = await Promise.race([
        progressPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("progress was not delivered during fetch")), 250)),
      ]);
      assert.equal(progress.done, false);
      assert.equal(progress.value?.type, "source-progress");
      assert.equal(progress.value?.type === "source-progress" ? progress.value.status : undefined, "running");

      resolveFetch(new Response("", { status: 200 }));
      await iterator.return?.();
    },
  },
  {
    name: "a fetch rejection while the consumer pauses after progress is handled safely",
    run: async () => {
      let rejectFetch!: (error: Error) => void;
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        if (calls === 1) {
          return await new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject;
          });
        }
        return new Response("", { status: 200 });
      }) as Fetch;

      const iterator = streamSearchJobs(request);
      await iterator.next();
      const progress = await iterator.next();
      assert.equal(progress.value?.type, "source-progress");
      rejectFetch(new TypeError("network unavailable"));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const retry = await iterator.next();
      assert.equal(retry.value?.type, "source-progress");
      assert.equal(retry.value?.type === "source-progress" ? retry.value.message : undefined, AUTOMATIC_RETRY_MESSAGE);
      await iterator.return?.();
      assert.equal(calls, 1);
    },
  },
  {
    name: "search reports a source error after automatic retries are exhausted",
    run: async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        throw new TypeError("network unavailable");
      }) as Fetch;

      const events = await collectEvents();
      const retries = events.filter(
        (event) => event.type === "source-progress" && event.message === AUTOMATIC_RETRY_MESSAGE,
      );
      assert.equal(calls, 3);
      assert.equal(retries.length, 2);
      assert.ok(retries.every((event) => event.type === "source-progress" && event.status === "running"));
      assert.ok(events.some((event) => event.type === "source-progress" && event.status === "error"));
      assert.ok(events.some((event) => event.type === "error" && event.source === "linkedin" && /failed after retry/.test(event.message)));
      assert.ok(events.some((event) => event.type === "complete"));
    },
  },
  {
    name: "search retries HTTP 503 responses and recovers on the next attempt",
    run: async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        return calls === 1 ? new Response("temporarily unavailable", { status: 503 }) : new Response("", { status: 200 });
      }) as Fetch;

      const events = await collectEvents();
      const retries = events.filter(
        (event) => event.type === "source-progress" && event.message === AUTOMATIC_RETRY_MESSAGE,
      );
      assert.equal(calls, 2);
      assert.equal(retries.length, 1);
      assert.ok(events.some((event) => event.type === "complete"));
      assert.ok(!events.some((event) => event.type === "error"));
    },
  },
  {
    name: "HTTP 4xx failures reach the bounded source error path and do not stop later sources",
    run: async () => {
      const multiSourceRequest = { ...request, selectedSources: ["seek", "linkedin"] as const } as SearchRequest;
      let seekCalls = 0;
      let linkedinCalls = 0;
      globalThis.fetch = (async (input) => {
        if (String(input).includes("seek.com.au")) {
          seekCalls += 1;
          return new Response("not found", { status: 404 });
        }
        linkedinCalls += 1;
        return new Response("", { status: 200 });
      }) as Fetch;

      const events = await collectEvents(multiSourceRequest);
      const seekRetries = events.filter(
        (event) =>
          event.type === "source-progress" &&
          event.source === "seek" &&
          event.message === AUTOMATIC_RETRY_MESSAGE,
      );
      assert.equal(seekCalls, 3);
      assert.equal(seekRetries.length, 2);
      assert.equal(linkedinCalls, 1);
      assert.ok(events.some((event) => event.type === "error" && event.source === "seek"));
      assert.ok(events.some((event) => event.type === "source-progress" && event.source === "linkedin" && event.status === "complete"));
      assert.ok(events.some((event) => event.type === "complete"));
    },
  },
  {
    name: "a successful empty search is complete rather than reported as blocked",
    run: async () => {
      globalThis.fetch = (async () => new Response("", { status: 200 })) as Fetch;
      const events = await collectEvents({ ...request, selectedSources: ["seek"] });
      assert.ok(events.some((event) => event.type === "source-progress" && event.source === "seek" && event.status === "complete" && /without matches/.test(event.message || "")));
      assert.ok(!events.some((event) => event.type === "source-progress" && event.source === "seek" && event.status === "blocked"));
    },
  },
  {
    name: "canceling during retry delay aborts promptly",
    run: async () => {
      const controller = new AbortController();
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        throw new TypeError("temporary network failure");
      }) as Fetch;

      const iterator = streamSearchJobs(request, { signal: controller.signal });
      let sawRetry = false;
      while (!sawRetry) {
        const next = await iterator.next();
        assert.equal(next.done, false);
        sawRetry = next.value.type === "source-progress" && next.value.message === AUTOMATIC_RETRY_MESSAGE;
      }
      controller.abort();
      await assert.rejects(iterator.next(), /aborted/i);
      assert.equal(calls, 1);
    },
  },
  {
    name: "retry deduplicates results already streamed before the source failed",
    run: async () => {
      let failedSecondPage = false;
      globalThis.fetch = (async (input) => {
        const url = String(input);
        if (url.includes("jobs-guest")) {
          const start = new URL(url).searchParams.get("start");
          if (start === "10" && !failedSecondPage) {
            failedSecondPage = true;
            throw new TypeError("connection reset on page two");
          }
          return new Response(start === "10" ? "" : linkedinCards(10), { status: 200 });
        }
        return new Response("", { status: 200 });
      }) as Fetch;

      const events = await collectEvents();
      const results = events.filter((event) => event.type === "result");
      assert.equal(results.length, 10);
      assert.equal(new Set(results.map((event) => event.type === "result" ? event.result.id : "")).size, 10);
      assert.ok(events.some((event) => event.type === "complete" && event.totalResults === 10));
      const progress = events.filter((event) => event.type === "source-progress");
      assert.ok(progress.some((event) => event.type === "source-progress" && event.message === AUTOMATIC_RETRY_MESSAGE && event.resultsFound === 10));
      assert.ok(progress.every((event, index) => index === 0 || event.pagesScanned >= progress[index - 1].pagesScanned));
      assert.ok(progress.every((event, index) => index === 0 || event.resultsFound >= progress[index - 1].resultsFound));
    },
  },
  {
    name: "retry progress counts unique filtered matches across changed result sets",
    run: async () => {
      let failedSecondPage = false;
      let firstPageCalls = 0;
      globalThis.fetch = (async (input) => {
        const url = String(input);
        if (url.includes("jobs-guest")) {
          const start = new URL(url).searchParams.get("start");
          if (start === "10" && !failedSecondPage) {
            failedSecondPage = true;
            throw new TypeError("connection reset");
          }
          if (start === "10") return new Response("", { status: 200 });
          firstPageCalls += 1;
          return new Response(linkedinCards(10, firstPageCalls === 1 ? 0 : 10), { status: 200 });
        }
        return new Response("", { status: 200 });
      }) as Fetch;

      const events = await collectEvents({ ...request, maxResultsPerSource: 15 });
      const results = events.filter((event) => event.type === "result");
      const progress = events.filter((event) => event.type === "source-progress");
      assert.equal(results.length, 15);
      assert.ok(progress.some((event) => event.message === AUTOMATIC_RETRY_MESSAGE && event.resultsFound === 10));
      assert.equal(progress.at(-1)?.status, "complete");
      assert.equal(progress.at(-1)?.resultsFound, 15);
      assert.ok(progress.every((event, index) => index === 0 || event.resultsFound >= progress[index - 1].resultsFound));
    },
  },
  {
    name: "canceling while loading a detail page does not get swallowed as a fallback",
    run: async () => {
      const controller = new AbortController();
      let calls = 0;
      globalThis.fetch = (async (input, init) => {
        calls += 1;
        if (String(input).includes("jobs-guest")) {
          return new Response(linkedinCards(1), { status: 200 });
        }
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("Search aborted.")), { once: true });
          queueMicrotask(() => controller.abort());
        });
      }) as Fetch;

      const iterator = streamSearchJobs({ ...request, maxResultsPerSource: 1 }, { signal: controller.signal });
      await assert.rejects(async () => {
        while (true) await iterator.next();
      }, /aborted/i);
      assert.equal(calls, 2);
    },
  },
  {
    name: "stripHtmlTags removes tags and decodes entities exactly once",
    run: () => {
      assert.equal(
        stripHtmlTags("<p>Bakery &amp; cafe&nbsp;team&#39;s &#x2013; &lt;b&gt;</p>"),
        "Bakery & cafe team's – <b>",
      );
      assert.equal(stripHtmlTags("R&amp;amp;D"), "R&amp;D");
      assert.equal(stripHtmlTags("Tom &unknown; Jerry"), "Tom &unknown; Jerry");
    },
  },
  {
    name: "careerone cards show decoded detail text",
    run: async () => {
      stubBoardPages({
        "https://www.careerone.com.au/jobs-in-melbourne/keyword-ai-engineer": `<html><body>
          <div class="job-card-small"><a href="/jobview/detail/job-1">AI Engineer</a></div>
        </body></html>`,
        "https://www.careerone.com.au/jobview/detail/job-1": jsonLdPage({
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: "AI &amp; Data Engineer",
          hiringOrganization: { "@type": "Organization", name: "Ana &amp; Sons Bakery" },
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: "Chatswood", addressRegion: "NSW", addressCountry: "AU" },
          },
          datePosted: "2026-11-01",
          description: "<p>Bread &amp; pastry team</p>",
        }),
      });

      const events = await collectEvents(careerOneRequest);
      const results = events.flatMap((event) => (event.type === "result" ? [event.result] : []));
      assert.equal(results.length, 1);
      assert.equal(results[0].title, "AI & Data Engineer");
      assert.equal(results[0].company, "Ana & Sons Bakery");
      assert.equal(results[0].location, "Chatswood NSW AU");
      assert.equal(results[0].snippet, "Bread & pastry team");
      assert.equal(results[0].searchQueryMatch, "strong");
      assert.ok(events.some((event) => event.type === "complete" && event.totalResults === 1));
    },
  },
  {
    name: "careerone listings that share no word with the searched title are dropped",
    run: async () => {
      stubBoardPages({
        "https://www.careerone.com.au/jobs-in-melbourne/keyword-ai-engineer": `<html><body>
          <div class="job-card-small"><a href="/jobview/detail/job-1">Retail Manager</a></div>
        </body></html>`,
        "https://www.careerone.com.au/jobview/detail/job-1": jsonLdPage({
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: "Retail &amp; Wholesale Manager",
          hiringOrganization: { "@type": "Organization", name: "Ana &amp; Sons Bakery" },
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: "Chatswood", addressRegion: "NSW", addressCountry: "AU" },
          },
          datePosted: "2026-11-01",
          description: "<p>Bread &amp; pastry team</p>",
        }),
      });

      const events = await collectEvents(careerOneRequest);
      const results = events.flatMap((event) => (event.type === "result" ? [event.result] : []));
      assert.equal(results.length, 0);
    },
  },
  {
    name: "a control label such as Show more never becomes a listing title",
    run: async () => {
      stubBoardPages({
        "https://au.talent.com/jobs?k=Data+Engineer&l=Melbourne": `<html><body>
          <div class="card"><a href="/view?id=101">Show more</a><a href="/view?id=101">Senior Data Engineer</a></div>
          <div class="card"><a href="/view?id=102">Show more</a></div>
          <div class="card"><a href="/view?id=103">Show more</a></div>
        </body></html>`,
        "https://au.talent.com/view?id=101": "<html><body><p>Senior data role.</p></body></html>",
        "https://au.talent.com/view?id=102": jsonLdPage({ "@type": "JobPosting", title: "Platform Engineer" }),
        "https://au.talent.com/view?id=103": "<html><body><p>No structured data.</p></body></html>",
      });

      const events = await collectEvents({
        ...request,
        jobTitle: "Data Engineer",
        selectedSources: ["talent"],
      });
      const titles = events.flatMap((event) => (event.type === "result" ? [event.result.title] : []));
      assert.deepEqual([...titles].sort(), ["Platform Engineer", "Senior Data Engineer"]);
      assert.ok(!events.some((event) => event.type === "result" && /show more/i.test(event.result.title)));
      assert.ok(
        events.some(
          (event) => event.type === "source-progress" && event.source === "talent" && event.status === "complete" && event.resultsFound === 2,
        ),
      );
    },
  },
  {
    name: "listings that share no word with the searched title are detected, related ones are kept",
    run() {
      assert.equal(sharesNoTitleTerm("AI Engineer", ["Baker / Pastrycook", "Melbourne bakery"]), true);
      assert.equal(sharesNoTitleTerm("AI Engineer", ["Retail Manager", ""]), true);
      assert.equal(sharesNoTitleTerm("AI Engineer", ["Software Engineer", ""]), false);
      assert.equal(sharesNoTitleTerm("AI Engineer", ["Senior AI Specialist", ""]), false);
      assert.equal(sharesNoTitleTerm("", ["Anything", ""]), false);
    },
  },
];

async function main() {
  let failed = 0;
  for (const test of tests) {
    try {
      await test.run();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${test.name}`, error);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
