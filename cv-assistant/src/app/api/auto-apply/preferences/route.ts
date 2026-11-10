import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mergePreferences } from "@/lib/auto-apply/candidate";
import { isAgentEnabled } from "@/lib/auto-apply/agent";
import { AGENT_DAILY_CAP } from "@/lib/auto-apply/agent-run";
import { loadUserContext } from "@/lib/auto-apply/engine";
import { isAuthPayload, requireAutoApplyAuth } from "@/lib/auto-apply/routes";
import { connectToDatabase } from "@/lib/db";
import { UserModel } from "@/lib/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const short = z.string().trim().max(200).default("");
const preferencesSchema = z.object({
  workRights: short,
  requiresSponsorship: z.enum(["", "yes", "no"]).default(""),
  salaryExpectation: short,
  noticePeriod: short,
  currentLocation: short,
  willingToRelocate: z.enum(["", "yes", "no"]).default(""),
  hybridOk: z.enum(["", "yes", "no"]).default(""),
  howHeard: short,
  github: short,
  currentCompany: short,
  standingConsent: z.enum(["", "yes"]).default(""),
});

export async function GET(req: NextRequest) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const { storedPreferences, profile } = await loadUserContext(auth.userId);
  return NextResponse.json({
    preferences: mergePreferences(storedPreferences),
    hasProfile: Boolean(profile && (profile.name || (profile.experiences || []).length)),
    profileName: profile?.name || "",
    agent: { available: isAgentEnabled(), dailyCap: AGENT_DAILY_CAP },
  });
}

export async function PUT(req: NextRequest) {
  const auth = requireAutoApplyAuth(req);
  if (!isAuthPayload(auth)) return auth;
  const parsed = preferencesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid preferences." }, { status: 400 });
  await connectToDatabase();
  await UserModel.updateOne({ _id: auth.userId }, { $set: { autoApplyPreferences: parsed.data } });
  return NextResponse.json({ preferences: parsed.data });
}
