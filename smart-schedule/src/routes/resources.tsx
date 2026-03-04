import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { PageHeader } from "@/components/layout/page-header";
import { WeekSelector } from "@/components/schedule/week-selector";
import { ResourceTimeline } from "@/components/resources/resource-timeline";
import { BatchDetailSheet } from "@/components/schedule/batch-detail-sheet";
import { AlertManager } from "@/components/alerts/alert-manager";
import { PermissionGate } from "@/components/shared/permission-gate";
import { useWeek } from "@/hooks/use-week";
import { useBatches } from "@/hooks/use-batches";
import { useResources } from "@/hooks/use-resources";
import { useResourceBlocks } from "@/hooks/use-resource-blocks";
import type { Batch } from "@/types/batch";

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

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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
        actions={<WeekSelector week={week} />}
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
