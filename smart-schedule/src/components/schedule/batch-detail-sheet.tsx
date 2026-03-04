import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./status-badge";
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Beaker,
  Droplets,
  FileText,
  Clock,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { useBatch } from "@/hooks/use-batches";
import type { Resource } from "@/types/resource";

interface BatchDetailSheetProps {
  batchId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: Resource[];
}

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "EEE d MMM yyyy, HH:mm");
  } catch {
    return dateStr;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "EEE d MMM yyyy");
  } catch {
    return dateStr;
  }
}

export function BatchDetailSheet({
  batchId,
  open,
  onOpenChange,
  resources,
}: BatchDetailSheetProps) {
  const { data: batch, isLoading } = useBatch(batchId);

  const resource = batch?.planResourceId
    ? resources.find((r) => r.id === batch.planResourceId)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {isLoading ? (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : batch ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <SheetTitle>Batch {batch.sapOrder}</SheetTitle>
                <StatusBadge status={batch.status} />
              </div>
              <SheetDescription>
                {batch.materialDescription ?? "No description"}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Material alerts */}
              {(!batch.rmAvailable || !batch.packagingAvailable) && (
                <div className="flex flex-wrap gap-2">
                  {!batch.rmAvailable && (
                    <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-700">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Waiting on Materials
                    </Badge>
                  )}
                  {!batch.packagingAvailable && (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                      <Package className="mr-1 h-3 w-3" />
                      Waiting on Packaging
                    </Badge>
                  )}
                </div>
              )}

              {batch.rmAvailable && batch.packagingAvailable && (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  All Materials Available
                </Badge>
              )}

              <Separator />

              {/* Schedule details */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Schedule</h3>
                <div className="grid gap-1">
                  <DetailRow
                    icon={Calendar}
                    label="Plan Date"
                    value={formatDate(batch.planDate)}
                  />
                  <DetailRow
                    icon={Beaker}
                    label="Resource"
                    value={
                      resource
                        ? `${resource.displayName ?? resource.resourceCode} (${resource.resourceType})`
                        : "Unassigned"
                    }
                  />
                  <DetailRow
                    icon={Droplets}
                    label="Volume"
                    value={
                      batch.batchVolume != null
                        ? `${batch.batchVolume.toLocaleString()}L`
                        : null
                    }
                  />
                  {resource && batch.batchVolume != null && (
                    <div className="ml-7 text-xs text-muted-foreground">
                      Capacity: {resource.minCapacity?.toLocaleString() ?? "?"}L
                      — {resource.maxCapacity?.toLocaleString() ?? "?"}L
                      {resource.maxCapacity != null &&
                        batch.batchVolume > resource.maxCapacity && (
                          <span className="ml-2 font-semibold text-red-500">
                            Over capacity by{" "}
                            {(batch.batchVolume - resource.maxCapacity).toLocaleString()}L
                          </span>
                        )}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Material details */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Material</h3>
                <div className="grid gap-1">
                  <DetailRow
                    icon={FileText}
                    label="Material Code"
                    value={batch.materialCode}
                  />
                  <DetailRow label="Bulk Code" value={batch.bulkCode} />
                  <DetailRow label="Pack Size" value={batch.packSize} />
                  <DetailRow label="Colour Group" value={batch.sapColorGroup} />
                </div>
              </div>

              {/* QC observation */}
              {batch.qcObservedStage && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      QC Observation
                    </h3>
                    <div className="grid gap-1">
                      <DetailRow label="Stage" value={batch.qcObservedStage} />
                      <DetailRow
                        icon={Clock}
                        label="Observed At"
                        value={formatDateTime(batch.qcObservedAt)}
                      />
                      <DetailRow
                        icon={User}
                        label="Observed By"
                        value={batch.qcObservedBy}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Status comment */}
              {batch.statusComment && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      Status Comment
                    </h3>
                    <p className="rounded-md bg-muted p-3 text-sm">
                      {batch.statusComment}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {batch.statusChangedBy && `By ${batch.statusChangedBy}`}
                      {batch.statusChangedAt &&
                        ` on ${formatDateTime(batch.statusChangedAt)}`}
                    </p>
                  </div>
                </>
              )}

              {/* Job location */}
              {batch.jobLocation && (
                <>
                  <Separator />
                  <DetailRow label="Job Location" value={batch.jobLocation} />
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Batch not found
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
