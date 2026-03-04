import { useState, useMemo } from "react";
import { format, addDays, isToday, isWeekend } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/ui/cn";
import { Search, X } from "lucide-react";
import { ResourceLane } from "./resource-lane";
import type { Batch } from "@/types/batch";
import type { Resource } from "@/types/resource";
import type { ResourceBlock } from "@/types/site";

type ResourceTab = "mixers" | "dispersers" | "all";

interface ResourceTimelineProps {
  batches: Batch[];
  resources: Resource[];
  blocks: ResourceBlock[];
  weekStart: Date;
  weekEnding: Date;
  isLoading: boolean;
  onBatchClick?: (batch: Batch) => void;
}

function getWeekDates(weekStart: Date, weekEnding: Date): string[] {
  const dates: string[] = [];
  let current = new Date(weekStart);
  const end = new Date(weekEnding);

  while (current <= end) {
    dates.push(format(current, "yyyy-MM-dd"));
    current = addDays(current, 1);
  }
  return dates;
}

export function ResourceTimeline({
  batches,
  resources,
  blocks,
  weekStart,
  weekEnding,
  isLoading,
  onBatchClick,
}: ResourceTimelineProps) {
  const [tab, setTab] = useState<ResourceTab>("mixers");
  const [search, setSearch] = useState("");

  const dates = useMemo(
    () => getWeekDates(weekStart, weekEnding),
    [weekStart, weekEnding],
  );

  // Filter resources by tab
  const filteredResources = useMemo(() => {
    switch (tab) {
      case "mixers":
        return resources.filter((r) => r.resourceType === "mixer");
      case "dispersers":
        return resources.filter((r) => r.resourceType === "disperser");
      case "all":
        return resources;
    }
  }, [resources, tab]);

  // Group batches by resource
  const batchesByResource = useMemo(() => {
    const map = new Map<string, Batch[]>();
    for (const r of filteredResources) {
      map.set(r.id, []);
    }
    for (const batch of batches) {
      if (batch.planResourceId && map.has(batch.planResourceId)) {
        map.get(batch.planResourceId)!.push(batch);
      }
    }
    return map;
  }, [batches, filteredResources]);

  // Completion stats per date (only visible resources)
  const completionByDate = useMemo(() => {
    const visibleIds = new Set(filteredResources.map((r) => r.id));
    const map = new Map<string, { total: number; completed: number }>();
    for (const date of dates) {
      map.set(date, { total: 0, completed: 0 });
    }
    for (const batch of batches) {
      if (
        batch.planDate &&
        map.has(batch.planDate) &&
        batch.planResourceId &&
        visibleIds.has(batch.planResourceId)
      ) {
        const s = map.get(batch.planDate)!;
        s.total++;
        if (batch.status === "Complete") s.completed++;
      }
    }
    return map;
  }, [batches, dates, filteredResources]);

  // Highlighted batch IDs from search
  const highlightedBatchIds = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const term = search.toLowerCase();
    const ids = new Set<string>();
    for (const batch of batches) {
      if (
        batch.sapOrder.toLowerCase().includes(term) ||
        (batch.materialDescription?.toLowerCase().includes(term) ?? false) ||
        (batch.materialCode?.toLowerCase().includes(term) ?? false) ||
        (batch.bulkCode?.toLowerCase().includes(term) ?? false)
      ) {
        ids.add(batch.id);
      }
    }
    return ids;
  }, [batches, search]);

  const searchMatchCount = highlightedBatchIds.size;

  const colCount = dates.length;

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-lg border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as ResourceTab)}
        >
          <TabsList>
            <TabsTrigger value="mixers">
              Mixers ({resources.filter((r) => r.resourceType === "mixer").length})
            </TabsTrigger>
            <TabsTrigger value="dispersers">
              Dispersers ({resources.filter((r) => r.resourceType === "disperser").length})
            </TabsTrigger>
            <TabsTrigger value="all">
              All ({resources.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search batches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 pl-9"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          {search && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {searchMatchCount} match{searchMatchCount !== 1 ? "es" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Timeline grid */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div
          className="grid min-w-[800px]"
          style={{
            gridTemplateColumns: `180px repeat(${colCount}, minmax(120px, 1fr))`,
          }}
        >
          {/* Header: empty corner + date headers */}
          <div className="sticky left-0 z-30 border-b border-r bg-muted px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Resource
            </span>
          </div>
          {dates.map((dateStr) => {
            const date = new Date(dateStr + "T12:00:00");
            const today = isToday(date);
            const weekend = isWeekend(date);
            const { total, completed } = completionByDate.get(dateStr) ?? { total: 0, completed: 0 };
            const pct = total > 0 ? (completed / total) * 100 : 0;
            return (
              <div
                key={dateStr}
                className={cn(
                  "border-b border-r px-2 py-2 text-center",
                  today && "bg-primary/5",
                  weekend && "bg-muted/50",
                  !today && !weekend && "bg-muted",
                )}
              >
                <div className="text-xs font-semibold">
                  {format(date, "EEE")}
                </div>
                <div
                  className={cn(
                    "text-sm tabular-nums",
                    today && "font-bold text-primary",
                  )}
                >
                  {format(date, "d MMM")}
                </div>
                {total > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    <div className="h-1 w-full rounded-full bg-muted-foreground/20 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          pct === 100
                            ? "bg-emerald-500"
                            : pct > 0
                              ? "bg-amber-400"
                              : "bg-muted-foreground/30",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[9px] tabular-nums text-muted-foreground">
                      {completed}/{total}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Resource lanes */}
          {filteredResources.map((resource) => (
            <ResourceLane
              key={resource.id}
              resource={resource}
              dates={dates}
              batches={batchesByResource.get(resource.id) ?? []}
              blocks={blocks}
              highlightedBatchIds={
                search ? highlightedBatchIds : undefined
              }
              onBatchClick={onBatchClick}
            />
          ))}

          {/* Empty state */}
          {filteredResources.length === 0 && (
            <div
              className="col-span-full flex items-center justify-center py-12 text-muted-foreground"
            >
              No {tab === "all" ? "resources" : tab} configured for this site.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
