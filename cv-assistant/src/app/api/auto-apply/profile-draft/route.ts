import { NextRequest, NextResponse } from "next/server";
import { distillAutoApplyProfileDraft } from "@/lib/auto-apply/profile-draft";
import { buildGroundTruthOptions } from "@/lib/auto-apply/ground-truth";
import { connectToDatabase } from "@/lib/db";
import { isAuthPayload, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { UserModel } from "@/lib/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = {
    prompt: typeof body?.prompt === "string" ? body.prompt : "",
    location: typeof body?.location === "string" ? body.location : "",
    workplaceMode: typeof body?.workplaceMode === "string" ? body.workplaceMode : "any",
    employmentType: typeof body?.employmentType === "string" ? body.employmentType : "any",
    seniority: typeof body?.seniority === "string" ? body.seniority : "",
    salaryMin: typeof body?.salaryMin === "string" ? body.salaryMin : "",
    salaryMax: typeof body?.salaryMax === "string" ? body.salaryMax : "",
    workRights: typeof body?.workRights === "string" ? body.workRights : "",
    mustHaveKeywords: Array.isArray(body?.mustHaveKeywords) ? body.mustHaveKeywords : [],
    excludeKeywords: Array.isArray(body?.excludeKeywords) ? body.excludeKeywords : [],
    companyBlacklist: Array.isArray(body?.companyBlacklist) ? body.companyBlacklist : [],
    applicationLimit: typeof body?.applicationLimit === "number" ? body.applicationLimit : 10,
    selectedSources: Array.isArray(body?.selectedSources) ? body.selectedSources : undefined,
    selectedGroundTruthIds: Array.isArray(body?.selectedGroundTruthIds) ? body.selectedGroundTruthIds : [],
    allowFullResumeContext: Boolean(body?.allowFullResumeContext),
  };

  await connectToDatabase();
  const user = await UserModel.findById(auth.userId).lean();
  const profile = user?.profile || undefined;
  const draft = await distillAutoApplyProfileDraft(profile, parsed);
  const groundTruthOptions = buildGroundTruthOptions(profile);
  return NextResponse.json({ draft, groundTruthOptions });
}
