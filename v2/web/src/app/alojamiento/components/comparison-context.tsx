"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

interface ComparisonContextValue {
  selectedIds: string[];
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  isFull: boolean;
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null);

const MAX_ITEMS = 4;
const STORAGE_KEY = "franky_accommodation_compare";

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Restore from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setSelectedIds(parsed);
      }
    } catch {}
  }, []);

  // Persist to sessionStorage on change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
    } catch {}
  }, [selectedIds]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_ITEMS) return prev;
      return [...prev, id];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const isSelected = useCallback(
    (id: string) => selectedIds.includes(id),
    [selectedIds]
  );

  return (
    <ComparisonContext.Provider
      value={{
        selectedIds,
        toggleSelection,
        clearSelection,
        isSelected,
        isFull: selectedIds.length >= MAX_ITEMS,
      }}
    >
      {children}
    </ComparisonContext.Provider>
  );
}

export function useComparison() {
  const ctx = useContext(ComparisonContext);
  if (!ctx) throw new Error("useComparison must be used within ComparisonProvider");
  return ctx;
}
