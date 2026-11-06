import type { ProRpcClient } from "../../../shared/pro/remote-contracts";
import { isCurrentSessionIdentity, type SessionIdentity } from "./session";
import { workspaceRpc } from "./workspaces";

const ORGANIZATION_RPC = new Set([
  "pro_get_space",
  "professional_get_workspace",
  "professional_list_records",
  "pro_get_agenda_operations",
  "pro_list_shifts",
  "professional_get_slots",
  "pro_create_agenda_booking",
  "pro_save_agenda_record",
  "pro_booking_operation",
  "professional_booking_action",
  "professional_save_record",
  "pro_get_table_operations",
  "pro_table_operation",
  "pro_save_table",
  "pro_get_resource_operations",
  "pro_save_resource",
  "pro_respond_group_request",
  "pro_reply_review",
]);

export function createNativeProClient(input: {
  owner: SessionIdentity;
  organizationId: string;
  signal: AbortSignal;
  isCurrent(): boolean;
}): ProRpcClient {
  const check = (signal: AbortSignal) => {
    if (
      signal.aborted ||
      input.signal.aborted ||
      !input.isCurrent() ||
      !isCurrentSessionIdentity(input.owner)
    ) {
      throw new Error("workspace_changed");
    }
  };
  return {
    async rpc(name, args = {}) {
      const signal = input.signal;
      check(signal);
      const list = name === "professional_list_workspaces";
      if (!list && !ORGANIZATION_RPC.has(name)) {
        throw new Error("pro_operation_unavailable");
      }
      if (
        args.p_organization_id !== undefined &&
        args.p_organization_id !== input.organizationId
      ) {
        throw new Error("workspace_changed");
      }
      try {
        const data = await workspaceRpc(
          name,
          list ? {} : { ...args, p_organization_id: input.organizationId },
          input.owner,
          signal,
        );
        check(signal);
        return { data, error: null };
      } catch (error) {
        check(signal);
        const problem = error as { message?: string; code?: string };
        return {
          data: null,
          error: {
            message: problem?.message ?? "pro_request_failed",
            code: problem?.code,
          },
        };
      }
    },
  };
}
