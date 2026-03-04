import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/ui/cn";
import { BATCH_STATUSES } from "@/lib/constants/statuses";
import { AlertTriangle, Package, Eye } from "lucide-react";
import type { Batch } from "@/types/batch";
import type { Resource } from "@/types/resource";

interface BatchCardProps {
  batch: Batch;
  resource: Resource | undefined;
  isHighlighted?: boolean;
  onClick?: (batch: Batch) => void;
}

function getCardBorder(batch: Batch): string {
  if (!batch.rmAvailable && !batch.packagingAvailable)
    return "border-red-300 bg-red-50/80 dark:border-red-800 dark:bg-red-950/40";
  if (!batch.rmAvailable)
    return "border-orange-300 bg-orange-50/80 dark:border-orange-800 dark:bg-orange-950/40";
  if (!batch.packagingAvailable)
    return "border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/40";

  const statusConfig = BATCH_STATUSES[batch.status];
  if (statusConfig) return `${statusConfig.bgClass} border-current/20`;
  return "border-border bg-card";
}

export function BatchCard({
  batch,
  resource,
  isHighlighted = false,
  onClick,
}: BatchCardProps) {
  const isOverCapacity =
    resource &&
    batch.batchVolume != null &&
    resource.maxCapacity != null &&
    batch.batchVolume > resource.maxCapacity;

  const isUnderCapacity =
    resource &&
    batch.batchVolume != null &&
    resource.minCapacity != null &&
    batch.batchVolume < resource.minCapacity;

  return (
    <div
      className={cn(
        "group relative cursor-pointer rounded-md border px-2 py-1.5 text-xs transition-shadow hover:shadow-md",
        getCardBorder(batch),
        isHighlighted && "ring-2 ring-primary ring-offset-1",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(batch);
      }}
    >
      {/* Top row: SAP order + volume */}
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold truncate">{batch.sapOrder}</span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {batch.batchVolume != null
            ? `${batch.batchVolume.toLocaleString()}L`
            : "—"}
        </span>
      </div>

      {/* Material description */}
      <div className="mt-0.5 truncate text-muted-foreground leading-tight">
        {batch.materialDescription ?? "—"}
      </div>

      {/* Alert indicators */}
      <div className="mt-1 flex items-center gap-1 flex-wrap">
        {/* Status badge (only for non-Planned) */}
        {batch.status !== "Planned" && (
          <span className="inline-flex items-center rounded-sm px-1 py-0.5 text-[9px] font-semibold bg-muted text-muted-foreground">
            {batch.status}
          </span>
        )}

        {!batch.rmAvailable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="h-3 w-3 text-orange-500" />
            </TooltipTrigger>
            <TooltipContent>Waiting on Materials</TooltipContent>
          </Tooltip>
        )}
        {!batch.packagingAvailable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Package className="h-3 w-3 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>Waiting on Packaging</TooltipContent>
          </Tooltip>
        )}
        {isOverCapacity && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center rounded-sm bg-red-100 px-1 py-0.5 text-[9px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                OVER
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Exceeds capacity ({resource!.maxCapacity?.toLocaleString()}L)
            </TooltipContent>
          </Tooltip>
        )}
        {isUnderCapacity && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center rounded-sm bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                UNDER
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Below minimum ({resource!.minCapacity?.toLocaleString()}L)
            </TooltipContent>
          </Tooltip>
        )}

        {batch.packSize && (
          <span className="text-[9px] text-muted-foreground">
            {batch.packSize}
          </span>
        )}

        {batch.qcObservedStage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Eye className="h-3 w-3 text-purple-500" />
            </TooltipTrigger>
            <TooltipContent>
              QC Observation: {batch.qcObservedStage}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
