/**
 * Runs the autofill against a live Greenhouse form in real Safari through safaridriver (WebDriver).
 * One-time setup: Safari > Settings > Developer > tick "Allow remote automation" (Safari > Settings > Advanced >
 * "Show features for web developers" if the Developer tab is missing). Nothing is submitted.
 * Usage: npm run test:autofill-safari
 */
import { spawn } from "node:child_process";
import { AUTOFILL_FUNCTION } from "../src/lib/auto-apply/autofill-script";

const PORT = 4723;
const URL = "https://job-boards.anz.greenhouse.io/quantium/jobs/4005581201";
const pack = { kind: "cva-autofill", version: 1, job: { title: "t", company: "Quantium", applyUrl: URL, provider: "greenhouse" }, coverLetter: "", createdAt: "", fields: [
  { fieldName: "first_name", label: "First Name", type: "text", required: true, value: "Dang Khoa", options: [] },
  { fieldName: "last_name", label: "Last Name", type: "text", required: true, value: "Le", options: [] },
  { fieldName: "email", label: "Email", type: "text", required: true, value: "test@example.com", options: [] },
  { fieldName: "country", label: "Country", type: "select", required: true, value: "Australia", options: ["Australia", "New Zealand"] },
  { fieldName: "x", label: "Location (City)", type: "text", required: true, value: "Melbourne, VIC", options: [] },
] };

const call = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`http://localhost:${PORT}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await response.json()) as { value: any };
  if (!response.ok) throw new Error(json.value?.message || `WebDriver ${response.status}`);
  return json.value;
};

(async () => {
  const driver = spawn("safaridriver", ["-p", String(PORT)], { stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  let session = "";
  try {
    const created = await call("POST", "/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
    session = created.sessionId;
    await call("POST", `/session/${session}/url`, { url: URL });
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const script = `var done=arguments[arguments.length-1];(${AUTOFILL_FUNCTION})(${JSON.stringify(pack)}).then(function(r){done(JSON.stringify(r))},function(e){done('ERR '+e)});`;
    await call("POST", `/session/${session}/timeouts`, { script: 90_000 });
    const raw = (await call("POST", `/session/${session}/execute/async`, { script, args: [] })) as string;
    if (raw.startsWith("ERR")) throw new Error(raw);
    const result = JSON.parse(raw) as { filled: number; total: number; results: Array<{ label: string; status: string }> };
    console.log("safari filled", result.filled, "/", result.total, result.results.map((r) => `${r.label.slice(0, 18)}:${r.status}`).join(", "));
    if (result.filled !== result.total) throw new Error("Safari did not fill every field");
    console.log("autofill-safari: passed");
  } finally {
    if (session) await call("DELETE", `/session/${session}`).catch(() => {});
    driver.kill();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
