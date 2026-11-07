/** Writes one cover letter for a fixture profile and prints {text, unsupported, defects} as JSON. Used by the Promptfoo provider. */
import fs from "node:fs";
import path from "node:path";
import { findLetterDefects, findUnsupportedClaims, runCoverLetterAgent } from "../src/lib/cover-letter-service";

for (const file of [".env", ".env.local"]) {
  const full = path.join(__dirname, "..", file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const input = JSON.parse(process.argv[2] || "{}") as { company: string; title: string; jd: string };
  const profile = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "profile.json"), "utf8"));
  const result = await runCoverLetterAgent({ profile, company: input.company, title: input.title, jobDescription: input.jd });
  console.log(
    JSON.stringify({
      text: result.text,
      words: result.text.split(/\s+/).filter(Boolean).length,
      unsupported: findUnsupportedClaims(result.text, profile, input.company),
      defects: findLetterDefects(result.text, profile.name, input.company, input.title),
    }),
  );
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
