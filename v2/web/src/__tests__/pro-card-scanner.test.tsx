import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProCardScanner } from "@/lib/pro/card-scanner";

function Scanner({
  active = true,
  onRead,
}: {
  active?: boolean;
  onRead: (value: string) => void;
}) {
  const scanner = useProCardScanner(active, onRead);
  return (
    <>
      <video ref={scanner.video} />
      <p>{scanner.error}</p>
    </>
  );
}
const oldMediaDevices = navigator.mediaDevices;
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: oldMediaDevices,
  });
});

describe("Lector Card: cámara local", () => {
  it("sólo acepta credenciales reales y apaga la cámara tras leer", async () => {
    const stop = vi.fn();
    const detect = vi
      .fn()
      .mockResolvedValue([
        { rawValue: "QR ajeno" },
        { rawValue: `franky:card:v1:${"a".repeat(64)}` },
      ]);
    class Detector {
      detect = detect;
    }
    vi.stubGlobal("BarcodeDetector", Detector);
    const getUserMedia = vi
      .fn()
      .mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const onRead = vi.fn();
    render(<Scanner onRead={onRead} />);
    await waitFor(() => expect(onRead).toHaveBeenCalledWith("a".repeat(64)));
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "environment" },
      audio: false,
    });
    expect(stop).toHaveBeenCalled();
  });

  it("no pide cámara hasta abrir el lector", () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    render(<Scanner active={false} onRead={vi.fn()} />);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("detiene un permiso resuelto después de cerrar la pantalla", async () => {
    let finish!: (value: unknown) => void;
    const permission = new Promise((resolve) => {
      finish = resolve;
    });
    const stop = vi.fn();
    class Detector {
      detect = vi.fn();
    }
    vi.stubGlobal("BarcodeDetector", Detector);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => permission },
    });
    const onRead = vi.fn();
    const view = render(<Scanner onRead={onRead} />);
    view.unmount();
    finish({ getTracks: () => [{ stop }] });
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(onRead).not.toHaveBeenCalled();
  });
});
