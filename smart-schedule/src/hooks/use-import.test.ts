import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import React from "react";
import { useImport, processFilesToBatches } from "./use-import";
import { QueryClientTestProvider, createTestQueryClient } from "@/test/query-client";

const { mockParseExcelFile, mockFrom } = vi.hoisted(() => ({
  mockParseExcelFile: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/utils/excel-parser", () => ({
  parseExcelFile: mockParseExcelFile,
  excelDateToISO: (value: unknown) => (typeof value === "string" ? value : null),
}));

vi.mock("@/hooks/use-current-site", () => ({
  useCurrentSite: () => ({ site: { id: "site-1" } }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: mockFrom,
  },
}));

describe("use-import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes bulk file rows into import batches", () => {
    const result = processFilesToBatches([
      {
        fileName: "bulk.xlsx",
        type: "bulk_data",
        headers: ["Order", "Material", "Total Order Qty", "Colour Group"],
        rows: [{ Order: "1001", Material: "MAT-20L", "Total Order Qty": "12", "Colour Group": "Blue" }],
        rowCount: 1,
      },
    ]);

    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]?.sapOrder).toBe("1001");
    expect(result.batches[0]?.batchVolume).toBe(12);
    expect(result.batches[0]?.packSize).toBe("20L");
    expect(result.missingDates).toBe(1);
  });

  it("adds files and derives parsed file metadata and batches", async () => {
    mockParseExcelFile.mockResolvedValueOnce([
      {
        "Bulk Order": "2001",
        Material: "RM-5L",
        "Order Quantity": 5,
      },
    ]);

    const client = createTestQueryClient();
    const { result } = renderHook(() => useImport(), {
      wrapper: ({ children }) =>
        React.createElement(QueryClientTestProvider, { client }, children),
    });

    await act(async () => {
      await result.current.addFiles([new File(["x"], "bulk-file.xlsx")]);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0]?.type).toBe("bulk_data");
    expect(result.current.batches).toHaveLength(1);
    expect(result.current.batches[0]?.sapOrder).toBe("2001");

    act(() => {
      result.current.clearFiles();
    });

    expect(result.current.files).toHaveLength(0);
    expect(result.current.batches).toHaveLength(0);
  });

  it("imports in replace mode and clears staged data on success", async () => {
    mockParseExcelFile.mockResolvedValueOnce([
      {
        "Bulk Order": "3001",
        Material: "MAT-1L",
        "Order Quantity": 1,
      },
    ]);

    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteMock = vi.fn(() => ({ eq: deleteEq }));
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "batches") {
        return {
          delete: deleteMock,
          insert: insertMock,
        };
      }
      return {};
    });

    const client = createTestQueryClient();
    const { result } = renderHook(() => useImport(), {
      wrapper: ({ children }) =>
        React.createElement(QueryClientTestProvider, { client }, children),
    });

    await act(async () => {
      await result.current.addFiles([new File(["x"], "bulk-file.xlsx")]);
    });

    act(() => {
      result.current.importBatches({ data: result.current.batches, mode: "replace" });
    });

    await waitFor(() => {
      expect(result.current.isImporting).toBe(false);
    });

    expect(deleteEq).toHaveBeenCalledWith("site_id", "site-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(result.current.files).toHaveLength(0);
    expect(result.current.batches).toHaveLength(0);
  });
});
