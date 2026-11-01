import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import { CreateAdminMessageRequestSchema } from "@/lib/contracts";
import { createAdminMessage, getUserMessages } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const messages = await getUserMessages(caller.email, caller.uid, 50);
    return NextResponse.json({ messages });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await verifyRequest(req);
    const body = await readJson(req);
    const parsed = CreateAdminMessageRequestSchema.parse(body);

    const saved = await createAdminMessage({
      uid: caller.uid,
      senderEmail: caller.email,
      subject: parsed.subject,
      body: parsed.body,
    });

    return NextResponse.json({
      success: true,
      messageId: saved.messageId,
      retentionUntil: saved.retentionUntil,
      message: "Your message has been delivered to Super Admin and archived under the 7-year compliance policy.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}

