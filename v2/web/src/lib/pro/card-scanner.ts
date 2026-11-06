"use client";

import { useEffect, useRef, useState } from "react";
import { parseCardCredential } from "../../../../shared/franky-card";

type Detector = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

/** Misma API nativa que el lector de Card existente, sin capturar ni guardar imágenes. */
export function useProCardScanner(
  active: boolean,
  onRead: (credential: string) => void,
) {
  const video = useRef<HTMLVideoElement>(null);
  const onReadRef = useRef(onRead);
  const [error, setError] = useState<string | null>(null);
  onReadRef.current = onRead;

  useEffect(() => {
    if (!active) return;
    const element = video.current;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(null);
    const stopCamera = () =>
      stream?.getTracks().forEach((track) => track.stop());

    const start = async () => {
      try {
        const NativeDetector = (
          window as Window & { BarcodeDetector?: DetectorConstructor }
        ).BarcodeDetector;
        if (!NativeDetector || !navigator.mediaDevices?.getUserMedia)
          throw new Error("camera_unavailable");
        const detector = new NativeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped || !element) {
          stopCamera();
          return;
        }
        element.srcObject = stream;
        await element.play();
        const scan = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(element);
            if (stopped) return;
            const credential = found
              .map((code) => parseCardCredential(code.rawValue))
              .find(Boolean);
            if (credential) {
              stopped = true;
              stopCamera();
              onReadRef.current(credential);
              return;
            }
          } catch {
            // Un fotograma borroso no interrumpe la lectura ni se envía a ningún servidor.
          }
          timer = setTimeout(() => void scan(), 350);
        };
        void scan();
      } catch {
        stopCamera();
        if (!stopped)
          setError(
            "No podemos abrir la cámara. Pega el código que comparte el estudiante.",
          );
      }
    };
    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stopCamera();
      if (element) element.srcObject = null;
    };
  }, [active]);

  return { video, error };
}
