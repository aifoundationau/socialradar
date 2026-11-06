import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { verifyRequest } from "@/lib/firebase-admin";
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
} from "@/lib/rag-engine";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q") || undefined;
    const sourceType = url.searchParams.get("sourceType") || undefined;
    const faqId = url.searchParams.get("faqId") || undefined;
    const languageCode = url.searchParams.get("lang") || undefined;

    const corpus = await getFullRagCorpus({
      query,
      sourceType,
      faqId,
      languageCode,
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

export async function POST(req: Request) {
  try {
    // Allow all users (authenticated or public FAQ contributors) to submit human-edited translations to RAG
    const caller = await verifyRequest(req).catch(() => null);
    const contributorEmail = caller?.email || "community-contributor@adradarhq.com";

    const body = await readJson(req);
    const parsed = CreateRagEntryRequestSchema.parse(body);

    if (parsed.action === "SYNC_CORPUS") {
      const corpus = await getFullRagCorpus();
      return NextResponse.json({
        success: true,
        message: "Synchronized all Website UI, FAQs, Radar Feed Searches, and AI Works into RAG corpus.",
        entries: corpus.entries,
        stats: corpus.stats,
      });
    }

    const item = await addHumanEditedRagEntry(parsed, contributorEmail);
    const corpus = await getFullRagCorpus();

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

export async function PUT(req: Request) {
  try {
    const caller = await verifyRequest(req).catch(() => null);
    const contributorEmail = caller?.email || "community-contributor@adradarhq.com";

    const body = await readJson(req);
    const parsed = UpdateRagEntryRequestSchema.parse(body);
    const item = await updateHumanEditedRagEntry(parsed, contributorEmail);
    const corpus = await getFullRagCorpus();

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
    await verifyRequest(req, { requireRole: "admin" });
    const body = await readJson(req);
    const { ragId } = DeleteRagEntryRequestSchema.parse(body);
    await deleteRagEntry(ragId);
    const corpus = await getFullRagCorpus();

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
