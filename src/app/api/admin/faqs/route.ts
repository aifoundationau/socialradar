import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import {
  CreateFaqRequestSchema,
  UpdateFaqRequestSchema,
} from "@/lib/contracts";
import {
  createFaq,
  deleteFaq,
  getFaqs,
  resetDefaultFaqs,
  updateFaq,
} from "@/lib/faqs";
import { requirePermission } from "@/lib/rbac";
import { z } from "zod";

const DeleteFaqSchema = z.object({ faqId: z.string().min(1) }).strict();

/** FAQs are site content: admins with the "System Config" permission (Super Admin always has it). */
async function verifyFaqAdmin(req: Request) {
  const caller = await verifyRequest(req, { requireRole: "admin" });
  await requirePermission(caller, "manage_config");
  return caller;
}

export async function GET(req: Request) {
  try {
    await verifyFaqAdmin(req);
    const faqs = await getFaqs(true);
    return NextResponse.json({ faqs });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await verifyFaqAdmin(req);
    const body = (await readJson(req)) as Record<string, unknown>;

    if (body.action === "RESET_DEFAULTS") {
      const faqs = await resetDefaultFaqs();
      return NextResponse.json({ success: true, message: "Reset to default FAQs", faqs });
    }

    const parsed = CreateFaqRequestSchema.parse(body);
    const item = await createFaq(parsed);
    const faqs = await getFaqs(true);
    return NextResponse.json({ success: true, item, faqs });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    await verifyFaqAdmin(req);
    const body = await readJson(req);
    const parsed = UpdateFaqRequestSchema.parse(body);
    const updated = await updateFaq(parsed);
    const faqs = await getFaqs(true);
    return NextResponse.json({ success: true, item: updated, faqs });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await verifyFaqAdmin(req);
    const body = await readJson(req);
    const { faqId } = DeleteFaqSchema.parse(body);
    await deleteFaq(faqId);
    const faqs = await getFaqs(true);
    return NextResponse.json({ success: true, deleted: faqId, faqs });
  } catch (err) {
    return errorResponse(err);
  }
}

