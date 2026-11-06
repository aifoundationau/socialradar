import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/firebase-admin";
import { errorResponse, readJson } from "@/lib/api";
import {
  AssignUserRoleRequestSchema,
  RBAC_PERMISSIONS_LIST,
  RBAC_ROLES_LIST,
  UpdateRolePermissionsRequestSchema,
} from "@/lib/contracts";
import {
  assignUserRole,
  getRbacConfig,
  getRbacUsersList,
  updateRolePermissions,
} from "@/lib/rbac";

export async function GET(req: Request) {
  try {
    await verifyRequest(req, { requireRole: "admin" });

    const [rbacConfig, users] = await Promise.all([
      getRbacConfig(),
      getRbacUsersList(100),
    ]);

    return NextResponse.json({
      success: true,
      matrix: rbacConfig.matrix,
      updatedAt: rbacConfig.updatedAt,
      updatedBy: rbacConfig.updatedBy,
      roles: RBAC_ROLES_LIST,
      permissions: RBAC_PERMISSIONS_LIST,
      users,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const caller = await verifyRequest(req, { requireRole: "superadmin" });
    const body = (await readJson(req)) as Record<string, unknown>;

    if (body.action === "UPDATE_ROLE_PERMISSIONS") {
      const parsed = UpdateRolePermissionsRequestSchema.parse(body);
      const updatedMatrix = await updateRolePermissions(
        parsed.role,
        parsed.permissions,
        caller.email,
      );
      return NextResponse.json({
        success: true,
        message: `Updated permissions for ${parsed.role}`,
        matrix: updatedMatrix,
      });
    }

    if (body.action === "ASSIGN_USER_ROLE") {
      const parsed = AssignUserRoleRequestSchema.parse(body);
      const targetRoles =
        parsed.roles && parsed.roles.length > 0
          ? parsed.roles
          : parsed.role!;
      const assigned = await assignUserRole(
        parsed.email,
        targetRoles,
        caller.email,
      );
      const users = await getRbacUsersList(100);
      return NextResponse.json({
        success: true,
        message: `Assigned roles (${assigned.roles.join(", ")}) to ${parsed.email}`,
        assigned,
        users,
      });
    }

    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid action" } },
      { status: 400 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

