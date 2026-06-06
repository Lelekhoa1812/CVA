import { detectAutomationBlockers } from "@/lib/auto-apply/browser";
import {
  getSiteHostname,
  getSiteKeyFromUrl,
  getSiteOrigin,
  loadSavedSiteStorageState,
  saveSiteAuthState,
} from "@/lib/auto-apply/site-auth";

type BrowserSession = {
  browser: import("playwright").Browser;
  context: import("playwright").BrowserContext;
  page: import("playwright").Page;
  createdAt: number;
  siteKey: string;
  origin: string;
};

type BrowserSessionResult = {
  mode: "browser_active" | "manual_guided";
  reason: string;
  guidance?: string;
  blockers: string[];
  domText?: string;
  screenshotBase64: string;
  savedSiteAuth?: {
    siteKey: string;
    origin: string;
    hostname: string;
    storageStatePath: string;
    rememberCredentials: boolean;
  };
};

declare global {
  var autoApplyBrowserSessions: Map<string, BrowserSession> | undefined;
}

const sessions = globalThis.autoApplyBrowserSessions ?? new Map<string, BrowserSession>();
globalThis.autoApplyBrowserSessions = sessions;

export function isVisibleBrowserEnabled() {
  if (process.env.AUTO_APPLY_BROWSER_ENABLED === "true") return true;
  if (process.env.AUTO_APPLY_BROWSER_ENABLED === "false") return false;
  return true;
}

function shouldLaunchHeadlessBrowser() {
  if (process.env.AUTO_APPLY_BROWSER_HEADLESS === "true") return true;
  if (process.env.AUTO_APPLY_BROWSER_HEADLESS === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function startVisibleBrowserSession(
  sessionKey: string,
  url: string,
  userId?: string,
): Promise<BrowserSessionResult> {
  if (!isVisibleBrowserEnabled()) {
    return {
      mode: "manual_guided" as const,
      reason: "browser_unavailable",
      guidance:
        "Browser automation is disabled on this deployment. Set AUTO_APPLY_BROWSER_ENABLED=true to allow browser sessions.",
      blockers: [],
      screenshotBase64: "",
    };
  }

  try {
    await stopVisibleBrowserSession(sessionKey);
    const { chromium } = await import("playwright");
    const headless = shouldLaunchHeadlessBrowser();
    const browser = await chromium.launch({
      headless,
      args: headless ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    });
    const siteKey = getSiteKeyFromUrl(url);
    const origin = getSiteOrigin(url);
    const savedState = userId ? await loadSavedSiteStorageState(userId, siteKey) : null;
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      storageState: savedState?.storageStatePath,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const blockers = detectAutomationBlockers(bodyText, url);
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    const platformLoginRequired = blockers.includes("platform_login_required");
    const employerLoginRequired = blockers.includes("employer_login_required");

    sessions.set(sessionKey, { browser, context, page, createdAt: Date.now(), siteKey, origin });

    if (blockers.length && !platformLoginRequired && !employerLoginRequired) {
      return {
        mode: "manual_guided" as const,
        reason: blockers[0],
        blockers,
        screenshotBase64: screenshot.toString("base64"),
      };
    }

    if (platformLoginRequired) {
      return {
        mode: "manual_guided" as const,
        reason: savedState?.storageStatePath ? "login_required" : "login_required_first_run",
        blockers,
        screenshotBase64: screenshot.toString("base64"),
      };
    }

    return {
      mode: "browser_active" as const,
      reason: employerLoginRequired ? "employer_login_autonomous" : "",
      blockers,
      screenshotBase64: screenshot.toString("base64"),
    };
  } catch (error) {
    await stopVisibleBrowserSession(sessionKey);
    return {
      mode: "manual_guided" as const,
      reason: "browser_unavailable",
      guidance:
        error instanceof Error
          ? `Browser automation could not start on this deployment: ${error.message}`
          : "Browser automation could not start on this deployment.",
      blockers: [],
      screenshotBase64: "",
    };
  }
}

export async function stopVisibleBrowserSession(sessionKey: string) {
  const session = sessions.get(sessionKey);
  if (!session) return;
  sessions.delete(sessionKey);
  await session.browser.close();
}

export async function saveVisibleBrowserSessionSiteAuth(
  sessionKey: string,
  args: {
    userId: string;
    url: string;
    credentials?: { username?: string; password?: string };
    rememberCredentials?: boolean;
  },
) {
  const session = sessions.get(sessionKey);
  if (!session) throw new Error("Browser session is not active.");

  const siteKey = getSiteKeyFromUrl(args.url);
  const origin = getSiteOrigin(args.url);
  const hostname = getSiteHostname(args.url);
  const storageState = await session.context.storageState();
  const record = await saveSiteAuthState({
    userId: args.userId,
    siteKey,
    origin,
    hostname,
    storageState,
    credentials: args.credentials,
    rememberCredentials: args.rememberCredentials,
  });

  return {
    siteKey,
    origin,
    hostname,
    storageStatePath: record.storageStatePath,
    rememberCredentials: record.rememberCredentials,
  };
}

export async function runVisibleBrowserAction(
  sessionKey: string,
  action: {
    type: "click" | "type" | "select" | "upload" | "screenshot" | "read_dom" | "scroll" | "save_site_login" | "stop";
    selector?: string;
    value?: string;
    filePath?: string;
    direction?: "up" | "down";
    url?: string;
    userId?: string;
    credentials?: { username?: string; password?: string };
    rememberCredentials?: boolean;
  },
): Promise<BrowserSessionResult> {
  if (action.type === "stop") {
    await stopVisibleBrowserSession(sessionKey);
    return {
      mode: "manual_guided" as const,
      reason: "",
      blockers: [],
      domText: "",
      screenshotBase64: "",
    };
  }

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

  if (action.type === "save_site_login") {
    if (!action.url) throw new Error("URL is required for saving site login.");
    if (!action.userId) throw new Error("User ID is required for saving site login.");
    const saved = await saveVisibleBrowserSessionSiteAuth(sessionKey, {
      userId: action.userId,
      url: action.url,
      credentials: action.credentials,
      rememberCredentials: action.rememberCredentials,
    });

    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    return {
      mode: "browser_active" as const,
      reason: "",
      blockers: [],
      domText: "",
      screenshotBase64: screenshot.toString("base64"),
      savedSiteAuth: saved,
    };
  }

  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const blockers = detectAutomationBlockers(bodyText, page.url());
  const screenshot = await page.screenshot({ type: "png", fullPage: false });
  const platformLoginRequired = blockers.includes("platform_login_required");
  const employerLoginRequired = blockers.includes("employer_login_required");

  if (blockers.length && !platformLoginRequired && !employerLoginRequired) {
    return {
      mode: "manual_guided" as const,
      reason: blockers[0] || "",
      blockers,
      domText: bodyText,
      screenshotBase64: screenshot.toString("base64"),
    };
  }

  return {
    mode: platformLoginRequired ? ("manual_guided" as const) : ("browser_active" as const),
    reason: employerLoginRequired ? "employer_login_autonomous" : platformLoginRequired ? "login_required" : "",
    blockers,
    domText: action.type === "read_dom" ? bodyText : "",
    screenshotBase64: screenshot.toString("base64"),
  };
}
