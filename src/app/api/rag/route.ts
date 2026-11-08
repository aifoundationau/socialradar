import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { verifyRequest } from "@/lib/firebase-admin";
import { requirePermission } from "@/lib/rbac";
import {
  CreateRagEntryRequestSchema,
  DeleteRagEntryRequestSchema,
  UpdateRagEntryRequestSchema,
} from "@/lib/contracts";
import {
  addHumanEditedRagEntry,
  deleteRagEntry,
  getFullRagCorpus,
  updateHumanEditedRagEntry,
  type RagAudience,
} from "@/lib/rag-engine";

/** RAG / FAQ content is site configuration: admins with the "System Config" permission. */
async function verifyRagAdmin(req: Request) {
  const caller = await verifyRequest(req, { requireRole: "admin" });
  await requirePermission(caller, "manage_config");
  return caller;
}

/**
 * Admins get the whole corpus (including live AI works). Everyone else, including signed-out FAQ
 * visitors, gets the public view: Website UI and enabled-FAQ entries only, without contributor emails.
 */
async function audienceFor(req: Request): Promise<RagAudience> {
  if (!req.headers.get("authorization")) return "public";
  try {
    await verifyRagAdmin(req);
    return "admin";
  } catch {
    return "public";
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const corpus = await getFullRagCorpus({
      query: url.searchParams.get("q") || undefined,
      sourceType: url.searchParams.get("sourceType") || undefined,
      faqId: url.searchParams.get("faqId") || undefined,
      languageCode: url.searchParams.get("lang") || undefined,
      audience: await audienceFor(req),
    });

    return NextResponse.json({
      success: true,
      entries: corpus.entries,
      stats: corpus.stats,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Adds a human-edited entry (optionally publishing it as a FAQ) or re-syncs the corpus. Admin only. */
export async function POST(req: Request) {
  try {
    const caller = await verifyRagAdmin(req);
    const parsed = CreateRagEntryRequestSchema.parse(await readJson(req));

    if (parsed.action === "SYNC_CORPUS") {
      const corpus = await getFullRagCorpus({ audience: "admin" });
      return NextResponse.json({
        success: true,
        message: "Synchronized all Website UI, FAQs, Radar Feed Searches, and AI Works into RAG corpus.",
        entries: corpus.entries,
        stats: corpus.stats,
      });
    }

    const item = await addHumanEditedRagEntry(parsed, caller.email);
    const corpus = await getFullRagCorpus({ audience: "admin" });

    return NextResponse.json({
      success: true,
      item,
      entries: corpus.entries,
      stats: corpus.stats,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Human-edits an entry; system entries are copied into the custom store with the edit. Admin only. */
export async function PUT(req: Request) {
  try {
    const caller = await verifyRagAdmin(req);
    const parsed = UpdateRagEntryRequestSchema.parse(await readJson(req));
    const item = await updateHumanEditedRagEntry(parsed, caller.email);
    const corpus = await getFullRagCorpus({ audience: "admin" });

    return NextResponse.json({
      success: true,
      item,
      entries: corpus.entries,
      stats: corpus.stats,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await verifyRagAdmin(req);
    const { ragId } = DeleteRagEntryRequestSchema.parse(await readJson(req));
    await deleteRagEntry(ragId);
    const corpus = await getFullRagCorpus({ audience: "admin" });

    return NextResponse.json({
      success: true,
      deleted: ragId,
      entries: corpus.entries,
      stats: corpus.stats,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
