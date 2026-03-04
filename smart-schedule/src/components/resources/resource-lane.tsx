import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/ui/cn";
import { BatchCard } from "./batch-card";
import { BlockedOverlay } from "./blocked-overlay";
import type { Batch } from "@/types/batch";
import type { Resource } from "@/types/resource";
import type { ResourceBlock } from "@/types/site";

interface ResourceLaneProps {
  resource: Resource;
  dates: string[];
  batches: Batch[];
  blocks: ResourceBlock[];
  highlightedBatchIds?: Set<string>;
  onBatchClick?: (batch: Batch) => void;
}

function CapacityBar({
  totalVolume,
  maxCapacity,
  batchCount,
}: {
  totalVolume: number;
  maxCapacity: number | null;
  batchCount: number;
}) {
  if (maxCapacity == null || maxCapacity === 0) {
    return (
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {batchCount} batch{batchCount !== 1 ? "es" : ""}
      </span>
    );
  }

  const percentage = Math.round((totalVolume / maxCapacity) * 100);
  const barColour =
    percentage > 100
      ? "bg-red-500"
      : percentage > 80
        ? "bg-amber-400"
        : "bg-emerald-500";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", barColour)}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {percentage}%
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {totalVolume.toLocaleString()}L / {maxCapacity.toLocaleString()}L
        ({batchCount} batch{batchCount !== 1 ? "es" : ""})
      </TooltipContent>
    </Tooltip>
  );
}

export function ResourceLane({
  resource,
  dates,
  batches,
  blocks,
  highlightedBatchIds,
  onBatchClick,
}: ResourceLaneProps) {
  // Group batches by date
  const batchesByDate = useMemo(() => {
    const map = new Map<string, Batch[]>();
    for (const date of dates) {
      map.set(date, []);
    }
    for (const batch of batches) {
      if (batch.planDate && map.has(batch.planDate)) {
        map.get(batch.planDate)!.push(batch);
      }
    }
    return map;
  }, [batches, dates]);

  // Check which dates are blocked for this resource
  const blockedDates = useMemo(() => {
    const map = new Map<string, ResourceBlock>();
    for (const date of dates) {
      const block = blocks.find(
        (b) =>
          b.resourceId === resource.id &&
          b.startDate <= date &&
          b.endDate >= date,
      );
      if (block) {
        map.set(date, block);
      }
    }
    return map;
  }, [blocks, dates, resource.id]);

  return (
    <div className="contents">
      {/* Resource label cell */}
      <div className="sticky left-0 z-20 flex flex-col justify-center border-b border-r bg-card px-3 py-2">
        <span className="font-semibold text-sm truncate">
          {resource.displayName ?? resource.resourceCode}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {resource.trunkLine && `Trunk ${resource.trunkLine} · `}
          {resource.minCapacity != null && resource.maxCapacity != null
            ? `${resource.minCapacity.toLocaleString()}–${resource.maxCapacity.toLocaleString()}L`
            : resource.resourceType}
        </span>
      </div>

      {/* Day cells */}
      {dates.map((date) => {
        const dayBatches = batchesByDate.get(date) ?? [];
        const block = blockedDates.get(date);
        const totalVolume = dayBatches.reduce(
          (sum, b) => sum + (b.batchVolume ?? 0),
          0,
        );

        return (
          <div
            key={date}
            className="relative flex min-h-[80px] flex-col border-b border-r p-1.5"
          >
            {block && <BlockedOverlay reason={block.reason} />}

            {/* Capacity indicator */}
            {dayBatches.length > 0 && !block && (
              <div className="mb-1 flex justify-end">
                <CapacityBar
                  totalVolume={totalVolume}
                  maxCapacity={resource.maxCapacity}
                  batchCount={dayBatches.length}
                />
              </div>
            )}

            {/* Batch cards */}
            <div className="flex flex-col gap-1">
              {dayBatches.map((batch) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  resource={resource}
                  isHighlighted={highlightedBatchIds?.has(batch.id)}
                  onClick={onBatchClick}
                />
              ))}
            </div>

            {/* Empty state */}
            {dayBatches.length === 0 && !block && (
              <div className="flex flex-1 items-center justify-center text-[10px] text-muted-foreground/40">
                —
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
