import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import { deleteAdminMessage, getAdminMessages, sendSuperadminMessage, updateAdminMessageStatus } from "@/lib/admin";
import { SendAdminMessageRequestSchema } from "@/lib/contracts";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";

const UpdateStatusSchema = z.object({
  messageId: z.string().min(1),
  status: z.enum(["unread", "read", "archived"]),
}).strict();

const DeleteMessageSchema = z.object({
  messageId: z.string().min(1),
}).strict();

/** Admins with the "Manage Messages" permission (Super Admin always has it). */
async function verifyMessageAdmin(req: Request) {
  const caller = await verifyRequest(req, { requireRole: "admin" });
  await requirePermission(caller, "manage_messages");
  return caller;
}

export async function GET(req: Request) {
  try {
    await verifyMessageAdmin(req);

    const messages = await getAdminMessages(100);
    return NextResponse.json({ messages });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const caller = await verifyMessageAdmin(req);
    const body = await readJson(req);
    const parsed = SendAdminMessageRequestSchema.parse(body);

    const message = await sendSuperadminMessage({
      superadminUid: caller.uid,
      superadminEmail: caller.email,
      recipientEmail: parsed.recipientEmail,
      subject: parsed.subject,
      body: parsed.body,
      requestType: parsed.requestType,
      customizeRequestId: parsed.customizeRequestId,
    });

    const messages = await getAdminMessages(100);
    return NextResponse.json({
      success: true,
      message,
      messages,
      info: "Message sent and stored with 7-year statutory retention.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await verifyMessageAdmin(req);

    const body = await readJson(req);
    const { messageId, status } = UpdateStatusSchema.parse(body);

    await updateAdminMessageStatus(messageId, status);
    const messages = await getAdminMessages(100);
    return NextResponse.json({ success: true, messages });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Permanent deletion overrides the 7-year retention promise, so only Super Admin may do it. */
export async function DELETE(req: Request) {
  try {
    await verifyRequest(req, { requireRole: "superadmin" });

    const body = await readJson(req);
    const { messageId } = DeleteMessageSchema.parse(body);

    await deleteAdminMessage(messageId);
    const messages = await getAdminMessages(100);
    return NextResponse.json({
      success: true,
      deletedMessageId: messageId,
      messages,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
