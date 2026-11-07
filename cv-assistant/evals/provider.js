/* eslint-disable @typescript-eslint/no-require-imports */
// Promptfoo custom provider: runs the real cover-letter agent (real NVIDIA NIM calls) through evals/run-letter.ts.
const { execFile } = require("node:child_process");
const path = require("node:path");

module.exports = class LetterProvider {
  id() {
    return "cva-cover-letter-agent";
  }
  callApi(_prompt, context) {
    const vars = context.vars || {};
    const root = path.join(__dirname, "..");
    return new Promise((resolve) => {
      execFile(
        "node",
        ["-r", "tsconfig-paths/register", "-r", "sucrase/register/ts", path.join(__dirname, "run-letter.ts"), JSON.stringify({ company: vars.company, title: vars.title, jd: vars.jd })],
        { cwd: root, timeout: 150000, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => {
          if (error) return resolve({ error: String(error.message).slice(0, 500) });
          const line = stdout.trim().split("\n").pop();
          resolve({ output: line });
        },
      );
    });
  }
};
