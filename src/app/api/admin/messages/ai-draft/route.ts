import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import { getCustomizeRequestById } from "@/lib/admin";
import { AiCustomizeReplyDraftRequestSchema } from "@/lib/contracts";
import { generateCustomizeStaffReply } from "@/lib/customize-ai";

export async function POST(req: Request) {
  try {
    await verifyRequest(req, { requireRole: "admin" });
    const body = await readJson(req);
    const parsed = AiCustomizeReplyDraftRequestSchema.parse(body);

    const customizeDoc = parsed.customizeRequestId
      ? await getCustomizeRequestById(parsed.customizeRequestId)
      : null;

    const draft = await generateCustomizeStaffReply({
      customerEmail: parsed.customerEmail,
      subject: parsed.subject,
      customerBriefText: parsed.customerBriefText,
      staffNotes: parsed.staffNotes,
      customizeDoc,
    });

    return NextResponse.json({
      success: true,
      draft,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
