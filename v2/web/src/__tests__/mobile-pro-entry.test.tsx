import React from "react";
import * as jsx from "react/jsx-runtime";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { nativeLoader } from "./helpers/native-module";

describe("entrada a la agenda nativa", () => {
  it("permite recuperarse de una caída de red sin desmontar el panel", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce({ bookings: [] });
    const push = vi.fn();
    const workspace = {
      active: { id: "local-org" },
      revision: 1,
      run,
      isCurrent: () => true,
    };
    const load = nativeLoader({
      react: { ...React, default: React },
      "react/jsx-runtime": jsx,
      "expo-router": {
        useRouter: () => ({ push }),
        useFocusEffect: (callback: () => void) =>
          React.useEffect(callback, [callback]),
      },
      "@/components/WorkspaceProvider": { useWorkspace: () => workspace },
      "@/components/ui": {
        Btn: ({ label, onPress }: any) => (
          <button onClick={onPress}>{label}</button>
        ),
      },
    });
    const { ProAgendaEntry } = load(
      "../mobile/src/components/pro/ProAgendaEntry.tsx",
    );
    render(<ProAgendaEntry />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Comprobar agenda Pro" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Abrir Franky Pro" }),
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/pro/local-org");
  });
});
