import { load } from "cheerio";
import { classifyLeadLiveness } from "@/lib/career/liveness";
import type { EnrichedLeadFacts } from "@/lib/career/types";
import {
  cleanText,
  firstSentence,
  inferEmploymentType,
  inferRemotePolicy,
  parseSalaryRange,
  topKeywords,
  uniqueStrings,
} from "@/lib/career/utils";
import { ApplicationEventModel } from "@/lib/models/ApplicationEvent";
import { JobLeadModel } from "@/lib/models/JobLead";

function extractReadableText(html: string) {
  const $ = load(html);
  const candidates = [
    "main",
    "article",
    "[data-job-description]",
    ".description",
    ".job-description",
    "body",
  ];

  for (const selector of candidates) {
    const text = cleanText($(selector).first().text());
    if (text.length > 240) {
      return text;
    }
  }

  return cleanText($.text());
}

async function fetchLeadDetailHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
      "Accept-Language": "en-AU,en;q=0.9",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  return {
    statusCode: response.status,
    finalUrl: response.url,
    html: await response.text(),
  };
}

function deriveCompanySignals(description: string, salaryText: string, remotePolicy: string) {
  const body = description.toLowerCase();
  return uniqueStrings([
    salaryText ? "salary transparency" : "",
    remotePolicy ? `${remotePolicy} policy` : "",
    body.includes("customer") ? "customer-facing scope" : "",
    body.includes("ownership") ? "ownership culture" : "",
    body.includes("agent") || body.includes("automation") ? "agentic systems focus" : "",
    body.includes("ai") || body.includes("machine learning") ? "applied ai scope" : "",
  ]);
}

export async function enrichLead(userId: string, leadId: string) {
  const lead = await JobLeadModel.findOne({ _id: leadId, userId });
  if (!lead) {
    throw new Error("Lead not found.");
  }

  const detailUrl = lead.applicationUrl || lead.listingUrl;
  let description = cleanText(`${lead.title}. ${lead.snippet}. ${lead.location}`);
  let finalUrl = detailUrl;
  let statusCode = 0;

  try {
    const detail = await fetchLeadDetailHtml(detailUrl);
    statusCode = detail.statusCode;
    finalUrl = detail.finalUrl;
    description = extractReadableText(detail.html) || description;
  } catch {
    // Network failures should not block the orchestration path; we fall back to the already captured lead text.
  }

  const live = classifyLeadLiveness({
    bodyText: description,
    finalUrl,
    statusCode,
  });
  const salary = parseSalaryRange(description);
  const salaryText =
    salary.minimum || salary.maximum
      ? `${salary.currency || "AUD"} ${salary.minimum || 0}${salary.maximum && salary.maximum !== salary.minimum ? `-${salary.maximum}` : ""}`
      : "";
  const remotePolicy = inferRemotePolicy(description, lead.location);
  const employmentType = inferEmploymentType(description);
  const extractedKeywords = topKeywords(`${lead.title} ${lead.snippet} ${description}`, 14);
  const companySignals = deriveCompanySignals(description, salaryText, remotePolicy);

  const enriched: EnrichedLeadFacts = {
    canonicalJobDescription: description,
    extractedKeywords,
    salaryText,
    remotePolicy,
    employmentType,
    companySignals,
    liveStatus: live.liveStatus,
  };

  lead.canonicalJobDescription = description;
  lead.extractedKeywords = extractedKeywords;
  lead.salaryText = salaryText;
  lead.remotePolicy = remotePolicy;
  lead.employmentType = employmentType;
  lead.companySignals = companySignals;
  lead.liveStatus = live.liveStatus;
  lead.lifecycleState = "enriched";
  lead.lastWorkflowAt = new Date();
  await lead.save();

  await ApplicationEventModel.create({
    userId,
    leadId: lead._id,
    type: "enriched",
    payload: {
      liveReason: live.reason,
      salaryText,
      remotePolicy,
      keyTakeaway: firstSentence(description),
    },
  });

  return { lead, enriched };
}
