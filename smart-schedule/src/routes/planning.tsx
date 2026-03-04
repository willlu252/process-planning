import { PageHeader } from "@/components/layout/page-header";
import { FileUpload } from "@/components/planning/file-upload";
import { ImportPreview } from "@/components/planning/import-preview";
import { CoverageTable } from "@/components/planning/coverage-table";
import { StockHeatmap } from "@/components/planning/stock-heatmap";
import { VettingPanel } from "@/components/planning/vetting-panel";
import { DraftReviewPanel } from "@/components/ai/draft-review";
import { useImport } from "@/hooks/use-import";
import { useBatches } from "@/hooks/use-batches";
import { useResources } from "@/hooks/use-resources";
import { useWeek } from "@/hooks/use-week";

export function PlanningPage() {
  const {
    files,
    batches: importBatchList,
    isProcessing,
    addFiles,
    clearFiles,
    importBatches,
    isImporting,
    importError,
    importSuccess,
  } = useImport();

  const { data: dbBatches = [] } = useBatches();
  const { data: resources = [] } = useResources();
  const { weekEnding } = useWeek();

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Planning"
        description="Import SAP data, analyse material coverage, and vet batches"
      />

      <FileUpload
        files={files}
        isProcessing={isProcessing}
        onAddFiles={addFiles}
        onClear={clearFiles}
      />

      <ImportPreview
        batches={importBatchList}
        isImporting={isImporting}
        importError={importError}
        importSuccess={importSuccess}
        onImport={importBatches}
      />

      <CoverageTable files={files} batches={dbBatches} />

      <VettingPanel batches={dbBatches} />

      <StockHeatmap
        batches={dbBatches}
        resources={resources}
        weekEnding={weekEnding}
      />

      <DraftReviewPanel />
    </div>
  );
}
