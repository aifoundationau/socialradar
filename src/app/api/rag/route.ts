import { NextResponse } from "next/server";
import { ApiError, errorResponse, readJson } from "@/lib/api";
import { verifyRequest, type VerifiedCaller } from "@/lib/firebase-admin";
import { resolveCallerRbacContext, type CallerRbacContext } from "@/lib/rbac";
import {
  CreateRagEntryRequestSchema,
  DeleteRagEntryRequestSchema,
  UpdateRagEntryRequestSchema,
} from "@/lib/contracts";
import {
  addHumanEditedRagEntry,
  approveRagEntry,
  deleteRagEntry,
  getCustomRagEntries,
  getFullRagCorpus,
  updateHumanEditedRagEntry,
  type RagAudience,
} from "@/lib/rag-engine";

export interface RagViewerCapabilities {
  canSubmitTranslations: boolean;
  canApproveTranslations: boolean;
  canPublishAsFaq: boolean;
  canSyncCorpus: boolean;
  viewerRole: string;
  viewerEmail: string;
}

function audienceForContext(ctx: CallerRbacContext): RagAudience {
  if (ctx.isSuper || ctx.roles.includes("admin")) return "admin";
  if (ctx.canApproveRagTranslations) return "approver";
  return "registered";
}

function capabilitiesFor(caller: VerifiedCaller, ctx: CallerRbacContext): RagViewerCapabilities {
  return {
    canSubmitTranslations: ctx.canSubmitRagTranslations,
    canApproveTranslations: ctx.canApproveRagTranslations,
    canPublishAsFaq: ctx.canPublishFaq && ctx.canApproveRagTranslations,
    canSyncCorpus: ctx.canSyncCorpus,
    viewerRole: ctx.primaryRole,
    viewerEmail: caller.email,
  };
}

async function resolveRagViewer(req: Request, actingRole?: string | null) {
  const caller = await verifyRequest(req);
  const ctx = await resolveCallerRbacContext(caller, actingRole || undefined);
  return {
    caller,
    ctx,
    audience: audienceForContext(ctx),
    viewerCapabilities: capabilitiesFor(caller, ctx),
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const actingRole = url.searchParams.get("actingRole");
    const approvedOnly = url.searchParams.get("approvedOnly") === "1";

    let audience: RagAudience = "public";
    let viewerEmail: string | undefined;
    let viewerCapabilities: RagViewerCapabilities | undefined;

    if (req.headers.get("authorization")) {
      try {
        const resolved = await resolveRagViewer(req, actingRole);
        audience = approvedOnly ? "public" : resolved.audience;
        viewerEmail = resolved.caller.email;
        viewerCapabilities = resolved.viewerCapabilities;
      } catch {
        audience = "public";
      }
    }

    const corpus = await getFullRagCorpus({
      query: url.searchParams.get("q") || undefined,
      sourceType: url.searchParams.get("sourceType") || undefined,
      faqId: url.searchParams.get("faqId") || undefined,
      languageCode: url.searchParams.get("lang") || undefined,
      audience,
      viewerEmail,
      approvedOnly,
    });

    return NextResponse.json({
      success: true,
      entries: corpus.entries,
      stats: corpus.stats,
      ...(viewerCapabilities ? { viewerCapabilities } : {}),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Adds a mandatory human-edited translation (approved immediately for Main Admin / Super Admin /
 * Ad Agent approvers; queued as pending approval for all other registered users) or syncs corpus.
 */
export async function POST(req: Request) {
  try {
    const parsed = CreateRagEntryRequestSchema.parse(await readJson(req));
    const { caller, ctx, audience, viewerCapabilities } = await resolveRagViewer(req, parsed.actingRole);

    if (parsed.action === "SYNC_CORPUS") {
      if (!ctx.canSyncCorpus) {
        throw new ApiError(
          "FORBIDDEN",
          "Only Main Admin or Super Admin can sync live AI works into the RAG corpus.",
          403,
        );
      }
      const corpus = await getFullRagCorpus({ audience, viewerEmail: caller.email });
      return NextResponse.json({
        success: true,
        message: "Synchronized all Website UI, FAQs, Radar Feed Searches, and AI Works into RAG corpus.",
        entries: corpus.entries,
        stats: corpus.stats,
        viewerCapabilities,
      });
    }

    if (!ctx.canSubmitRagTranslations) {
      throw new ApiError(
        "FORBIDDEN",
        "Your role does not have permission to submit RAG translations.",
        403,
      );
    }

    const item = await addHumanEditedRagEntry(parsed, {
      uid: caller.uid,
      email: caller.email,
      role: ctx.primaryRole,
      canApprove: ctx.canApproveRagTranslations,
      canPublishFaq: ctx.canPublishFaq,
    });
    const corpus = await getFullRagCorpus({ audience, viewerEmail: caller.email });

    return NextResponse.json({
      success: true,
      item,
      entries: corpus.entries,
      stats: corpus.stats,
      viewerCapabilities,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Approves a pending translation or updates a human-edited entry. */
export async function PUT(req: Request) {
  try {
    const parsed = UpdateRagEntryRequestSchema.parse(await readJson(req));
    const { caller, ctx, audience, viewerCapabilities } = await resolveRagViewer(req, parsed.actingRole);

    if (parsed.action === "APPROVE_ENTRY") {
      if (!ctx.canApproveRagTranslations) {
        throw new ApiError(
          "FORBIDDEN",
          "Only Main Admin, Super Admin, or an Ad Agent with Approve RAG Translations permission can approve translations.",
          403,
        );
      }
      const item = await approveRagEntry(parsed, {
        email: caller.email,
        role: ctx.primaryRole,
      });
      const corpus = await getFullRagCorpus({ audience, viewerEmail: caller.email });
      return NextResponse.json({
        success: true,
        item,
        entries: corpus.entries,
        stats: corpus.stats,
        viewerCapabilities,
      });
    }

    if (!ctx.canApproveRagTranslations && !ctx.canSubmitRagTranslations) {
      throw new ApiError("FORBIDDEN", "Insufficient permissions to update RAG entries.", 403);
    }

    const item = await updateHumanEditedRagEntry(parsed, {
      email: caller.email,
      role: ctx.primaryRole,
      canApprove: ctx.canApproveRagTranslations,
    });
    const corpus = await getFullRagCorpus({ audience, viewerEmail: caller.email });

    return NextResponse.json({
      success: true,
      item,
      entries: corpus.entries,
      stats: corpus.stats,
      viewerCapabilities,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const parsed = DeleteRagEntryRequestSchema.parse(await readJson(req));
    const { caller, ctx, audience, viewerCapabilities } = await resolveRagViewer(req, parsed.actingRole);

    const customEntries = await getCustomRagEntries();
    const target = customEntries.find((e) => e.ragId === parsed.ragId);
    if (!target) {
      throw new ApiError("NOT_FOUND", `RAG entry ${parsed.ragId} not found`, 404);
    }

    const isOwner = target.contributorEmail.toLowerCase() === caller.email.toLowerCase();
    const canDelete =
      ctx.isSuper ||
      (ctx.roles.includes("admin") && ctx.canApproveRagTranslations) ||
      (ctx.canApproveRagTranslations && (target.approvalStatus === "pending" || isOwner)) ||
      (ctx.canSubmitRagTranslations && target.approvalStatus === "pending" && isOwner);

    if (!canDelete) {
      throw new ApiError(
        "FORBIDDEN",
        "You do not have permission to delete this RAG entry.",
        403,
      );
    }

    await deleteRagEntry(parsed.ragId);
    const corpus = await getFullRagCorpus({ audience, viewerEmail: caller.email });

    return NextResponse.json({
      success: true,
      deleted: parsed.ragId,
      entries: corpus.entries,
      stats: corpus.stats,
      viewerCapabilities,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
