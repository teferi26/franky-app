"use client";

import * as React from "react";
import QRCode from "qrcode";
import { Check, Copy, DoorOpen, Printer, QrCode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { plural, time } from "@/lib/pro/format";
import { checkinsToday, doorRooms, doorUrl } from "@/lib/pro/classes-growth";
import { Avatar, ChoiceChips, Drawer, Empty, Panel, Pill } from "../../kit";
import { escapeHtml, printSheet } from "./ui";

/**
 * QR de la puerta: un código por sala que el socio escanea al llegar. Su
 * reserva pasa a "llegó" sin que el monitor tenga que pasar lista, y sin
 * huellas ni tornos. Aquí se imprime el cartel y se ve quién ha entrado hoy.
 */

export function DoorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = usePro();
  const toast = useToast();
  const rooms = doorRooms(data);
  const [room, setRoom] = React.useState<string>("");
  const current = room || rooms[0] || "";
  const url = doorUrl(data.space.slug, current || undefined);
  const [qr, setQr] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 720, color: { dark: "#121019", light: "#ffffff" } })
      .then((png) => alive && setQr(png))
      .catch(() => alive && setQr(""));
    return () => {
      alive = false;
    };
  }, [open, url]);

  const print = () => {
    const e = escapeHtml;
    const ok = printSheet(
      `Entrada ${current}`,
      "main{max-width:560px;margin:0 auto;text-align:center}h1{font-size:40px;margin:24px 0 4px;letter-spacing:-0.02em}" +
        "p{font-size:18px;color:#4a4757;margin:6px 0}img{width:380px;height:380px;margin:28px auto}.small{font-size:13px;color:#6b6878}",
      `<main><p>${e(data.space.name)}</p><h1>Escanea al entrar</h1><p>${e(current || "Todas las salas")}</p>` +
        `<img src="${qr}" alt=""><p>Abre la cámara, apunta al código y escribe tu nombre.</p>` +
        `<p class="small">${e(url.replace("https://", ""))}</p></main>`,
    );
    if (!ok)
      toast.info(
        "No se pudo abrir la ventana",
        "Permite las ventanas emergentes para imprimir el cartel.",
      );
  };

  const copy = () => {
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => toast.info("Selecciona el enlace y cópialo"));
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="QR de la puerta"
      description="Un cartel por sala. Quien llega lo escanea y su reserva queda como llegada."
      footer={
        <>
          <Button variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{" "}
            {copied ? "Copiado" : "Copiar enlace"}
          </Button>
          <Button variant="dark" onClick={print} disabled={!qr}>
            <Printer className="h-4 w-4" /> Imprimir cartel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {rooms.length > 1 ? (
          <ChoiceChips
            value={current}
            onChange={setRoom}
            options={rooms.map((r) => ({ value: r, label: r }))}
          />
        ) : null}
        <div className="mx-auto w-full max-w-[260px] rounded-2xl border border-border bg-white p-4 text-center">
          {qr ? (
            <img
              src={qr}
              alt={`Código QR de la entrada${current ? ` de ${current}` : ""}`}
              className="h-auto w-full"
            />
          ) : (
            <div className="aspect-square rounded-xl skeleton-shimmer" />
          )}
          <p className="mt-2 text-sm font-semibold text-neutral-900">Escanea al entrar</p>
          {current ? <p className="text-xs text-neutral-500">{current}</p> : null}
        </div>
        <ol className="grid gap-2 text-sm">
          {[
            "Pega el cartel a la altura de los ojos, junto a la puerta de la sala.",
            "Se puede entrar desde media hora antes hasta 20 minutos después de empezar.",
            "Con reserva, pasa a llegada. Sin reserva y con plaza, entra de paso y lo ves en la lista.",
          ].map((t, i) => (
            <li key={t} className="flex gap-3 rounded-xl bg-bg-secondary px-3 py-2.5">
              <span className="font-heading font-bold tabular text-violet">{i + 1}</span>
              <span className="text-text-secondary">{t}</span>
            </li>
          ))}
        </ol>
      </div>
    </Drawer>
  );
}

/** Quién ha entrado hoy con el QR, para el monitor y recepción. */
export function DoorArrivals({ onOpenDoor }: { onOpenDoor: () => void }) {
  const { data, now } = usePro();
  const list = checkinsToday(data, now);
  const walkins = list.filter((c) => c.kind === "walkin").length;
  const typeOf = (sessionId: string) => {
    const s = data.sessions.find((x) => x.id === sessionId);
    const ct = data.classTypes.find((c) => c.id === s?.classTypeId);
    return s ? `${ct?.name ?? "Clase"} de las ${time(s.start)}` : "Clase";
  };

  return (
    <Panel
      title="Entradas con QR"
      description={
        list.length
          ? `${plural(list.length, "entrada", "entradas")} hoy${walkins ? `, ${plural(walkins, "sin reserva", "sin reserva")}` : ""}.`
          : undefined
      }
      action={
        <Button size="sm" variant="ghost" onClick={onOpenDoor}>
          <QrCode className="h-3.5 w-3.5" /> Cartel
        </Button>
      }
      flush
    >
      {list.length ? (
        <ul className="divide-y divide-border-light">
          {list.slice(0, 6).map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <Avatar name={c.name || "?"} size="sm" tone="emerald" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name || "Socio"}</span>
                <span className="block truncate text-xs text-text-muted">
                  {typeOf(c.sessionId)}
                </span>
              </span>
              {c.kind === "walkin" ? <Pill tone="info">Sin reserva</Pill> : null}
              <span className="w-11 shrink-0 text-right text-xs font-semibold tabular text-text-muted">
                {time(c.at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          icon={ScanLine}
          title="Nadie ha entrado con el QR hoy"
          body="Imprime el cartel de cada sala. Cuando alguien lo escanee, aparece aquí y en la lista de su clase."
          action={
            <Button size="sm" variant="outline" onClick={onOpenDoor}>
              <DoorOpen className="h-3.5 w-3.5" /> Ver el cartel
            </Button>
          }
        />
      )}
    </Panel>
  );
}
