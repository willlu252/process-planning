import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "./status-badge";
import { StatusCommentModal } from "@/components/shared/status-comment-modal";
import { AuditLog } from "@/components/shared/audit-log";
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
  TrendingUp,
  ShieldCheck,
  History,
  ShoppingCart,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useBatch } from "@/hooks/use-batches";
import { useUpdateBatch, useAddAuditEntry } from "@/hooks/use-batch-mutations";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentSite } from "@/hooks/use-current-site";
import { BATCH_STATUS_LIST, BATCH_STATUSES } from "@/lib/constants/statuses";
import { COMMENT_REQUIRED_STATUSES } from "@/types/batch";
import type { BatchStatus } from "@/types/batch";
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
        <p className="text-sm">{value ?? "\u2014"}</p>
      </div>
    </div>
  );
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  try {
    return format(new Date(dateStr), "EEE d MMM yyyy, HH:mm");
  } catch {
    return dateStr;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
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
  const updateBatch = useUpdateBatch();
  const addAudit = useAddAuditEntry();
  const { hasPermission } = usePermissions();
  const { user } = useCurrentSite();

  const canEditStatus = hasPermission("batches.status");

  // Status comment modal state
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<BatchStatus | null>(null);

  const resource = batch?.planResourceId
    ? resources.find((r) => r.id === batch.planResourceId)
    : null;

  const handleStatusChange = (newStatus: string) => {
    if (!batch) return;
    const status = newStatus as BatchStatus;
    if (status === batch.status) return;

    if (COMMENT_REQUIRED_STATUSES.includes(status)) {
      setPendingStatus(status);
      setCommentModalOpen(true);
      return;
    }

    // Direct status change (no comment required)
    updateBatch.mutate(
      { batchId: batch.id, updates: { status } },
      {
        onSuccess: () => {
          addAudit.mutate({
            batchId: batch.id,
            action: "status_change",
            details: {
              from: batch.status,
              to: status,
              changed_by: user?.email ?? user?.id ?? "unknown",
            },
          });
          toast.success(`Status changed to ${status}`);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to update status");
        },
      },
    );
  };

  const handleCommentConfirm = (comment: string) => {
    if (!batch || !pendingStatus) return;

    updateBatch.mutate(
      {
        batchId: batch.id,
        updates: { status: pendingStatus, statusComment: comment },
      },
      {
        onSuccess: () => {
          addAudit.mutate({
            batchId: batch.id,
            action: "status_change",
            details: {
              from: batch.status,
              to: pendingStatus,
              comment,
              changed_by: user?.email ?? user?.id ?? "unknown",
            },
          });
          toast.success(`Status changed to ${pendingStatus}`);
          setCommentModalOpen(false);
          setPendingStatus(null);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to update status");
        },
      },
    );
  };

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
                {canEditStatus ? (
                  <Select
                    value={batch.status}
                    onValueChange={handleStatusChange}
                    disabled={updateBatch.isPending}
                  >
                    <SelectTrigger className="h-7 w-auto gap-1.5">
                      <SelectValue>
                        <StatusBadge status={batch.status} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {BATCH_STATUS_LIST.map((s) => {
                        const cfg = BATCH_STATUSES[s];
                        return (
                          <SelectItem key={s} value={s}>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: cfg.color }}
                              />
                              <span>{cfg.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <StatusBadge status={batch.status} />
                )}
              </div>
              <SheetDescription>
                {batch.materialDescription ?? "No description"}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Material alerts */}
              {(!batch.rmAvailable || !batch.packagingAvailable) ? (
                <div className="flex flex-col gap-1.5">
                  {!batch.rmAvailable && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="text-muted-foreground">Waiting on Materials</span>
                    </div>
                  )}
                  {!batch.packagingAvailable && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Package className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="text-muted-foreground">Waiting on Packaging</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-muted-foreground">All Materials Available</span>
                </div>
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
                      {" \u2014 "}{resource.maxCapacity?.toLocaleString() ?? "?"}L
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

              {/* Coverage & stock */}
              {(batch.stockCover != null || batch.safetyStock != null || batch.forecast != null) && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Coverage</h3>
                    <div className="grid gap-1">
                      <DetailRow
                        icon={TrendingUp}
                        label="Stock Cover"
                        value={batch.stockCover != null ? `${batch.stockCover} weeks` : null}
                      />
                      <DetailRow
                        label="Safety Stock"
                        value={batch.safetyStock != null ? batch.safetyStock.toLocaleString() : null}
                      />
                      <DetailRow
                        label="Forecast"
                        value={batch.forecast != null ? batch.forecast.toLocaleString() : null}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Purchase orders */}
              {(batch.poDate || batch.poQuantity != null) && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Purchase Order</h3>
                    <div className="grid gap-1">
                      <DetailRow
                        icon={ShoppingCart}
                        label="PO Date"
                        value={formatDate(batch.poDate)}
                      />
                      <DetailRow
                        label="PO Quantity"
                        value={batch.poQuantity != null ? batch.poQuantity.toLocaleString() : null}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Vetting */}
              {batch.vettingStatus !== "not_required" && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Vetting</h3>
                    <div className="grid gap-1">
                      <DetailRow
                        icon={ShieldCheck}
                        label="Vetting Status"
                        value={
                          <span className="capitalize">
                            {batch.vettingStatus}
                          </span>
                        }
                      />
                      {batch.vettedBy && (
                        <DetailRow
                          icon={User}
                          label="Vetted By"
                          value={batch.vettedBy}
                        />
                      )}
                      {batch.vettedAt && (
                        <DetailRow
                          icon={Clock}
                          label="Vetted At"
                          value={formatDateTime(batch.vettedAt)}
                        />
                      )}
                      {batch.vettingComment && (
                        <div className="ml-7 rounded-md bg-muted p-2 text-sm">
                          {batch.vettingComment}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

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

              {/* Audit trail */}
              <Separator />
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4" />
                  Activity
                </h3>
                <AuditLog batchId={batch.id} />
              </div>
            </div>

            {/* Status comment modal */}
            {pendingStatus && (
              <StatusCommentModal
                open={commentModalOpen}
                onOpenChange={(open) => {
                  setCommentModalOpen(open);
                  if (!open) setPendingStatus(null);
                }}
                batchId={batch.id}
                sapOrder={batch.sapOrder}
                newStatus={pendingStatus}
                onConfirm={handleCommentConfirm}
              />
            )}
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
