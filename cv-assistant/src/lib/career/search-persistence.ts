import { ApplicationEventModel } from "@/lib/models/ApplicationEvent";
import { JobLeadModel } from "@/lib/models/JobLead";
import { SearchCampaignModel } from "@/lib/models/SearchCampaign";
import type { PersistedSearchCampaignInput } from "@/lib/career/types";
import type { JobSearchResult } from "@/lib/search/types";

export async function createPersistedSearchCampaign(userId: string, request: PersistedSearchCampaignInput) {
  return SearchCampaignModel.create({
    userId,
    query: request,
    status: "active",
    startedAt: new Date(),
  });
}

export async function recordSearchLead(
  userId: string,
  campaignId: string,
  result: JobSearchResult,
) {
  const existing = await JobLeadModel.findOne({ userId, dedupeKey: result.dedupeKey });
  if (existing) {
    await JobLeadModel.findByIdAndUpdate(existing._id, {
      $addToSet: { campaignIds: campaignId },
      $set: {
        title: result.title,
        company: result.company,
        location: result.location,
        postedText: result.postedText,
        snippet: result.snippet,
        listingUrl: result.listingUrl,
        applicationUrl: result.applicationUrl,
        applicationUrlType: result.applicationUrlType,
        searchQueryMatch: result.searchQueryMatch,
        source: result.source,
        lastSeenAt: new Date(),
      },
    });

    return JobLeadModel.findById(existing._id);
  }

  const created = await JobLeadModel.create({
    userId,
    campaignIds: [campaignId],
    source: result.source,
    dedupeKey: result.dedupeKey,
    title: result.title,
    company: result.company,
    location: result.location,
    postedText: result.postedText,
    snippet: result.snippet,
    listingUrl: result.listingUrl,
    applicationUrl: result.applicationUrl,
    applicationUrlType: result.applicationUrlType,
    searchQueryMatch: result.searchQueryMatch,
    lifecycleState: "lead_found",
    lastSeenAt: new Date(),
  });

  await ApplicationEventModel.create({
    userId,
    leadId: created._id,
    type: "lead_found",
    payload: {
      source: result.source,
      queryMatch: result.searchQueryMatch,
      campaignId,
    },
  });

  return created;
}

export async function completePersistedSearchCampaign(
  campaignId: string,
  data: { totalResults: number; blockedSources: string[]; errorMessage?: string; status?: "completed" | "failed" | "canceled" },
) {
  await SearchCampaignModel.findByIdAndUpdate(campaignId, {
    $set: {
      totalResults: data.totalResults,
      blockedSources: data.blockedSources,
      errorMessage: data.errorMessage || "",
      status: data.status || "completed",
      completedAt: new Date(),
    },
  });
}
