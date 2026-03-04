import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useCurrentSite } from "./use-current-site";
import type { BatchStatus } from "@/types/batch";

interface UpdateBatchInput {
  batchId: string;
  updates: {
    status?: BatchStatus;
    statusComment?: string | null;
    planDate?: string | null;
    planResourceId?: string | null;
    qcObservedStage?: string | null;
    qcObservedAt?: string | null;
    qcObservedBy?: string | null;
  };
}

interface AuditInput {
  batchId: string;
  action: string;
  details: Record<string, unknown>;
}

export function useUpdateBatch() {
  const { site, user } = useCurrentSite();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ batchId, updates }: UpdateBatchInput) => {
      if (!site) throw new Error("No site selected");

      const dbUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.statusComment !== undefined)
        dbUpdates.status_comment = updates.statusComment;
      if (updates.planDate !== undefined) dbUpdates.plan_date = updates.planDate;
      if (updates.planResourceId !== undefined)
        dbUpdates.plan_resource_id = updates.planResourceId;
      if (updates.qcObservedStage !== undefined)
        dbUpdates.qc_observed_stage = updates.qcObservedStage;
      if (updates.qcObservedAt !== undefined)
        dbUpdates.qc_observed_at = updates.qcObservedAt;
      if (updates.qcObservedBy !== undefined)
        dbUpdates.qc_observed_by = updates.qcObservedBy;

      if (updates.status !== undefined) {
        dbUpdates.status_changed_at = new Date().toISOString();
        dbUpdates.status_changed_by = user?.id ?? null;
      }

      const { error } = await supabase
        .from("batches")
        .update(dbUpdates as never)
        .eq("id", batchId)
        .eq("site_id", site.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });
}

export function useAddAuditEntry() {
  const { site, user } = useCurrentSite();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ batchId, action, details }: AuditInput) => {
      if (!site) throw new Error("No site selected");

      const { error } = await supabase.from("audit_log").insert({
        site_id: site.id,
        batch_id: batchId,
        action,
        details,
        performed_by: user?.id ?? null,
        performed_at: new Date().toISOString(),
      } as never);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
