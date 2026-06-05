const fs = require("fs");
const path = require("path");
const assert = require("assert");

const navbarPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "cv-assistant",
  "src",
  "components",
  "Navbar.tsx",
);

const source = fs.readFileSync(navbarPath, "utf8");

assert.ok(
  !source.includes('from "framer-motion"') && !source.includes("from 'framer-motion'"),
  "Navbar should not import framer-motion after removing the optional dependency from this component.",
);

assert.ok(
  source.includes("Root Cause vs Logic:"),
  'Navbar should document this bug fix with a "Root Cause vs Logic" comment.',
);

console.log("PASS navbar-no-framer-motion-import.test.js");
