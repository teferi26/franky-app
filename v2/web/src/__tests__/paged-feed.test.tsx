import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePagedFeed } from "@/hooks/usePagedFeed";

type Row = { id: string };
function deferred() {
  let resolve!: (rows: Row[]) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Row[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("campus feed pagination", () => {
  it("ignores a late response from the previous campus", async () => {
    const old = deferred();
    const oldFetch = vi.fn(() => old.promise);
    const nextFetch = vi.fn(async () => [{ id: "new-campus" }]);
    const { result, rerender } = renderHook(({ fetch }) => usePagedFeed(fetch, 2), { initialProps: { fetch: oldFetch as (n: number) => Promise<Row[]> } });
    rerender({ fetch: nextFetch });
    await waitFor(() => expect(result.current.items).toEqual([{ id: "new-campus" }]));
    await act(async () => old.resolve([{ id: "old-campus" }]));
    expect(result.current.items).toEqual([{ id: "new-campus" }]);
  });

  it("serializes repeated load-more taps and does not duplicate rows", async () => {
    const page = deferred();
    const fetch = vi.fn().mockResolvedValueOnce([{ id: "1" }, { id: "2" }]).mockImplementationOnce(() => page.promise);
    const { result } = renderHook(() => usePagedFeed<Row>(fetch, 2));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => { void result.current.loadMore(); void result.current.loadMore(); });
    expect(fetch.mock.calls).toEqual([[0], [2]]);
    await act(async () => page.resolve([{ id: "2" }, { id: "3" }]));
    expect(result.current.items.map(x => x.id)).toEqual(["1", "2", "3"]);
  });

  it("preserves the next offset when a page fails so retry loses no posts", async () => {
    const fetch = vi.fn().mockResolvedValueOnce([{ id: "1" }, { id: "2" }]).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce([{ id: "3" }]);
    const { result } = renderHook(() => usePagedFeed<Row>(fetch, 2));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => result.current.loadMore());
    expect(result.current.moreError).toBe(true);
    await act(async () => result.current.loadMore());
    expect(fetch.mock.calls).toEqual([[0], [2], [2]]);
    expect(result.current.items.map(x => x.id)).toEqual(["1", "2", "3"]);
    expect(result.current.hasMore).toBe(false);
  });
});
