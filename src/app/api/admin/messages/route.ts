import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import { getAdminMessages, updateAdminMessageStatus } from "@/lib/admin";
import { z } from "zod";

const UpdateStatusSchema = z.object({
  messageId: z.string().min(1),
  status: z.enum(["unread", "read", "archived"]),
}).strict();

export async function GET(req: Request) {
  try {
    await verifyRequest(req, { requireRole: "superadmin" });

    const messages = await getAdminMessages(100);
    return NextResponse.json({ messages });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await verifyRequest(req, { requireRole: "superadmin" });

    const body = await readJson(req);
    const { messageId, status } = UpdateStatusSchema.parse(body);

    await updateAdminMessageStatus(messageId, status);
    const messages = await getAdminMessages(100);
    return NextResponse.json({ success: true, messages });
  } catch (err) {
    return errorResponse(err);
  }
}

