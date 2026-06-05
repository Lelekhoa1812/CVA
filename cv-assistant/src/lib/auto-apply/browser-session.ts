import { detectAutomationBlockers } from "@/lib/auto-apply/browser";

type BrowserSession = {
  browser: import("playwright").Browser;
  page: import("playwright").Page;
  createdAt: number;
};

const sessions = new Map<string, BrowserSession>();

export async function startVisibleBrowserSession(sessionKey: string, url: string) {
  if (process.env.AUTO_APPLY_BROWSER_ENABLED !== "true") {
    return {
      mode: "manual_guided" as const,
      reason: "browser_disabled",
      blockers: [],
      screenshotBase64: "",
    };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const blockers = detectAutomationBlockers(bodyText);
  const screenshot = await page.screenshot({ type: "png", fullPage: false });

  if (blockers.length) {
    await browser.close();
    return {
      mode: "manual_guided" as const,
      reason: blockers[0],
      blockers,
      screenshotBase64: screenshot.toString("base64"),
    };
  }

  sessions.set(sessionKey, { browser, page, createdAt: Date.now() });
  return {
    mode: "browser_active" as const,
    reason: "",
    blockers,
    screenshotBase64: screenshot.toString("base64"),
  };
}

export async function stopVisibleBrowserSession(sessionKey: string) {
  const session = sessions.get(sessionKey);
  if (!session) return;
  sessions.delete(sessionKey);
  await session.browser.close();
}

export async function runVisibleBrowserAction(
  sessionKey: string,
  action: {
    type: "click" | "type" | "select" | "upload" | "screenshot" | "read_dom" | "scroll";
    selector?: string;
    value?: string;
    filePath?: string;
    direction?: "up" | "down";
  },
) {
  const session = sessions.get(sessionKey);
  if (!session) throw new Error("Browser session is not active.");
  const { page } = session;

  if (action.type === "click") {
    if (!action.selector) throw new Error("Selector is required for click.");
    await page.locator(action.selector).click({ timeout: 10000 });
  }

  if (action.type === "type") {
    if (!action.selector) throw new Error("Selector is required for type.");
    await page.locator(action.selector).fill(action.value || "", { timeout: 10000 });
  }

  if (action.type === "select") {
    if (!action.selector) throw new Error("Selector is required for select.");
    await page.locator(action.selector).selectOption(action.value || "", { timeout: 10000 });
  }

  if (action.type === "upload") {
    if (!action.selector || !action.filePath) throw new Error("Selector and file path are required for upload.");
    await page.locator(action.selector).setInputFiles(action.filePath, { timeout: 10000 });
  }

  if (action.type === "scroll") {
    await page.mouse.wheel(0, action.direction === "up" ? -700 : 700);
  }

  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const blockers = detectAutomationBlockers(bodyText);
  const screenshot = await page.screenshot({ type: "png", fullPage: false });

  if (blockers.length) {
    await stopVisibleBrowserSession(sessionKey);
    return {
      mode: "manual_guided" as const,
      blockers,
      domText: bodyText,
      screenshotBase64: screenshot.toString("base64"),
    };
  }

  return {
    mode: "browser_active" as const,
    blockers,
    domText: action.type === "read_dom" ? bodyText : "",
    screenshotBase64: screenshot.toString("base64"),
  };
}
