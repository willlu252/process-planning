import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { WeekSelector } from "@/components/schedule/week-selector";
import { ResourceTimeline } from "@/components/resources/resource-timeline";
import { BatchDetailSheet } from "@/components/schedule/batch-detail-sheet";
import { AlertManager } from "@/components/alerts/alert-manager";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Wand2 } from "lucide-react";
import { useWeek } from "@/hooks/use-week";
import { useBatches } from "@/hooks/use-batches";
import { useResources } from "@/hooks/use-resources";
import { useResourceBlocks } from "@/hooks/use-resource-blocks";
import { useBulkAssignResources } from "@/hooks/use-batch-mutations";
import { assignBatchToResource } from "@/lib/utils/resource-assignment";
import type { Batch } from "@/types/batch";
import type { ImportBatch } from "@/hooks/use-import";

export function ResourcesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const week = useWeek();
  const { data: resources = [], isLoading: resourcesLoading } = useResources();
  const deepLinkBatchId = searchParams.get("batchId");

  const weekStartStr = useMemo(
    () => format(week.weekStart, "yyyy-MM-dd"),
    [week.weekStart],
  );

  const { data: batches = [], isLoading: batchesLoading } = useBatches({
    weekStart: weekStartStr,
    weekEnding: week.weekEndingStr,
  });

  const { data: blocks = [], isLoading: blocksLoading } = useResourceBlocks({
    weekStart: weekStartStr,
    weekEnding: week.weekEndingStr,
  });

  const bulkAssign = useBulkAssignResources();

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const unassignedBatches = useMemo(
    () => batches.filter((b) => !b.planResourceId),
    [batches],
  );

  const handleAutoAssign = useCallback(() => {
    if (unassignedBatches.length === 0) {
      toast.info("All batches are already assigned to resources");
      return;
    }

    const assignments = new Map<string, string>();
    for (const batch of unassignedBatches) {
      // Convert Batch to ImportBatch-like shape for the assignment function
      const importBatch: ImportBatch = {
        sapOrder: batch.sapOrder,
        materialCode: batch.materialCode,
        materialDescription: batch.materialDescription,
        bulkCode: batch.bulkCode,
        planDate: batch.planDate,
        batchVolume: batch.batchVolume,
        sapColorGroup: batch.sapColorGroup,
        packSize: batch.packSize,
        rmAvailable: batch.rmAvailable,
        packagingAvailable: batch.packagingAvailable,
        stockCover: batch.stockCover,
        safetyStock: batch.safetyStock,
        poDate: batch.poDate,
        poQuantity: batch.poQuantity,
        forecast: batch.forecast,
        materialShortage: batch.materialShortage,
        sapMixerResource: null,
        sapDisperser1: null,
        sapDisperser2: null,
        sapPreMixCount: null,
        sapIpt: null,
        sapFillOrder: null,
        sapFillQuantity: null,
      };
      const resourceId = assignBatchToResource(importBatch, resources);
      if (resourceId) {
        assignments.set(batch.id, resourceId);
      }
    }

    if (assignments.size === 0) {
      toast.warning("Could not find suitable resources for any unassigned batches");
      return;
    }

    bulkAssign.mutate(assignments, {
      onSuccess: (count) => {
        toast.success(`Assigned ${count} batch${count !== 1 ? "es" : ""} to resources`);
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to assign resources");
      },
    });
  }, [unassignedBatches, resources, bulkAssign]);

  const handleBatchClick = useCallback((batch: Batch) => {
    setSelectedBatchId(batch.id);
    setSheetOpen(true);
  }, []);

  useEffect(() => {
    if (!deepLinkBatchId) return;
    setSelectedBatchId(deepLinkBatchId);
    setSheetOpen(true);
  }, [deepLinkBatchId]);

  const handleSheetOpenChange = useCallback(
    (open: boolean) => {
      setSheetOpen(open);
      if (open || !deepLinkBatchId) return;

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("batchId");
      setSearchParams(nextParams, { replace: true });
    },
    [deepLinkBatchId, searchParams, setSearchParams],
  );

  const isLoading = batchesLoading || resourcesLoading || blocksLoading;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Resource View"
        description="Visualise batch assignments across resources for the week"
        actions={
          <div className="flex items-center gap-3">
            {unassignedBatches.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleAutoAssign}
                disabled={bulkAssign.isPending}
              >
                <Wand2 className="mr-1 h-4 w-4" />
                Auto-assign ({unassignedBatches.length})
              </Button>
            )}
            <WeekSelector week={week} />
          </div>
        }
      />

      <PermissionGate permission="alerts.read">
        <AlertManager mode="banner" activeOnly />
      </PermissionGate>

      <ResourceTimeline
        batches={batches}
        resources={resources}
        blocks={blocks}
        weekStart={week.weekStart}
        weekEnding={week.weekEnding}
        isLoading={isLoading}
        onBatchClick={handleBatchClick}
      />

      <BatchDetailSheet
        batchId={selectedBatchId}
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        resources={resources}
      />
    </div>
  );
}
