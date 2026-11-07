/**
 * Safety rules for the local agent-fill script: it must never submit an application. Network rules block real
 * submission endpoints and operations; the in-page script cancels form submit events before a site's own handlers run.
 * Uploads (for example Greenhouse's presigned S3 POST) and analytics must still pass.
 */
const SUBMIT_PATH = /(\/applications?(\/|\?|$)|\/apply(\/|\?|$))/i;
const SUBMIT_BODY = /(submitApplication|ApiSubmitApplication|createApplication)/i;

export function isSubmitRequest(method: string, url: string, body: string | null | undefined) {
  if (method === "GET" || method === "OPTIONS" || method === "HEAD") return false;
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  return SUBMIT_PATH.test(pathname) || SUBMIT_BODY.test(body || "");
}

export const SUBMIT_GUARD_INIT_SCRIPT = `window.__cvaSubmitBlocked=0;document.addEventListener('submit',function(e){window.__cvaSubmitBlocked++;e.preventDefault();e.stopImmediatePropagation();},true);`;
