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
  source.includes("{active ? (") && source.includes("<span className=\"absolute inset-0 rounded-full border border-primary/25"),
  "Navbar should render a static active-pill span for the active navigation item.",
);

assert.ok(
  !source.includes("layoutId=") && !source.includes("motion."),
  "Navbar active state should not rely on framer-motion animation primitives anymore.",
);

console.log("PASS navbar-static-active-pill.test.js");
