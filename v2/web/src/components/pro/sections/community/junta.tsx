"use client";

import * as React from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  Download,
  FileText,
  FolderLock,
  KeyRound,
  Landmark,
  Plus,
  Printer,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProBoardSeat, ProData } from "@/lib/pro/types";
import { addDays, dayLabel, localDate, money, pct, relative } from "@/lib/pro/format";
import { communityLedger, communityOps, withCommunityOps } from "@/lib/pro/community";
import type {
  CommunityArchiveDoc,
  CommunityArchiveKind,
  CommunityMember,
} from "@/lib/pro/community-types";
import { archiveDocumentHtml, registryPackHtml } from "@/lib/pro/community-docs";
import {
  REGISTRY_COMMUNITY_PCT,
  registryPack,
  registryTag,
  representationAttendance,
  type RegistryPack,
} from "@/lib/pro/community-registry";
import { daysBetween } from "@/lib/pro/demo/community";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  IconButton,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import { TONE_ORDER } from "../../tones";
import { downloadDataUrl, openPrintable, readAsDataUrl, receiptThumbnail } from "./files";
import { markFrankyAccessDone } from "@/lib/pro/community-handover";
import { AnnualReportPanel, HandoverGuide } from "./relevo";

const KIND_LABEL: Record<CommunityArchiveKind, string> = {
  estatutos: "Estatutos",
  acta: "Acta",
  cuentas: "Cuentas",
  registro: "Registro",
  certificado: "Certificado",
  memoria: "Memoria",
  otro: "Otro",
};

/** Lo que cabe en el archivo sin llenar el almacenamiento del navegador. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

type ArchiveFilter = "all" | CommunityArchiveKind;

function fullDate(date: string) {
  return dayLabel(`${date.slice(0, 10)}T12:00:00Z`, { weekday: false });
}

/**
 * Cambia la junta: nuevos cargos con acceso, la saliente sigue como socia y el
 * relevo queda apuntado en el archivo con quién entra y quién sale.
 */
function applyBoard(d: ProData, board: ProBoardSeat[], at: string): ProData {
  const names = new Set(board.map((b) => b.name));
  const before = d.board;
  const body = [
    `Relevo de la junta directiva de ${d.space.name} con efecto desde el ${fullDate(board[0]?.since ?? at)}.`,
    `Entran: ${board.map((b) => `${b.name} (${b.role.toLowerCase()})`).join(", ")}.`,
    before.length
      ? `Salen: ${before.map((b) => `${b.name} (${b.role.toLowerCase()})`).join(", ")}.`
      : "",
    "Socios, actividades, documentos y cuentas siguen en la asociación.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const record: CommunityArchiveDoc = {
    id: localId("d"),
    title: "Relevo de la junta directiva",
    kind: "registro",
    at,
    by: "Secretaría",
    body,
  };
  const next: ProData = {
    ...d,
    board,
    communityMembers: d.communityMembers.map((m) => {
      if (names.has(m.name)) return { ...m, role: "junta" as const };
      if (m.role === "junta") return { ...m, role: "socio" as const };
      return m;
    }),
    staff: [
      ...board.map((b, i) => ({
        id: `s-${b.id}`,
        name: b.name,
        role: "board" as const,
        tone: TONE_ORDER[i % TONE_ORDER.length],
        title: b.role,
        commissionPct: 0,
        clockedInAt: null,
        weekMinutes: 0,
      })),
      ...d.staff.filter((s) => s.role !== "board"),
    ],
  };
  // El paso de accesos de la guía del relevo queda hecho con el traspaso.
  return withCommunityOps(next, (o) =>
    markFrankyAccessDone(
      { ...o, scheduledBoard: undefined, documents: [record, ...o.documents] },
      d.space.owner.name,
      at,
    ),
  );
}

export default function CommunityJunta() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const ops = communityOps(data);
  const [handover, setHandover] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const board = data.board;
  const until = board[0]?.until ?? addDays(today, 180);
  const since = board[0]?.since ?? today;
  const left = Math.max(0, daysBetween(today, until));
  const total = Math.max(1, daysBetween(since, until));
  const ledger = communityLedger(data, now);
  const members = data.communityMembers as CommunityMember[];
  const pastActivities = data.activities.filter((a) => a.status === "done").length;
  const attendance = new Map(representationAttendance(data).map((r) => [r.seat.id, r]));
  const scheduled = ops.scheduledBoard;
  const scheduledDue = scheduled?.[0] ? scheduled[0].since <= today : false;
  const pack = registryPack(data, now);

  const cancelScheduled = () => {
    update("community.board.unschedule", (d) =>
      withCommunityOps(d, (o) => ({ ...o, scheduledBoard: undefined })),
    );
    toast.success("Relevo cancelado", "La junta actual sigue con su acceso.");
  };

  const applyScheduled = () => {
    if (!scheduled?.length) return;
    update("board.handover", (d) => applyBoard(d, scheduled, new Date().toISOString()));
    toast.success("Junta traspasada", "La nueva junta ya tiene su acceso. Todo lo demás sigue en su sitio.");
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Junta"
        title="Junta directiva"
        description={
          board.length
            ? `${board.length} cargos con mandato hasta el ${fullDate(until)}, dentro de ${left} días. ` +
              "Cuando toque el relevo, lo traspasas aquí y no se pierde nada."
            : "Configura quién hace qué y hasta cuándo. Así el cambio de junta no se lleva nada por delante."
        }
        actions={
          <Button variant="dark" onClick={() => setHandover(true)}>
            <KeyRound className="h-4 w-4" /> {board.length ? "Traspasar junta" : "Configurar junta"}
          </Button>
        }
      />

      <KpiRow>
        <Kpi
          icon={Users}
          label="Cargos"
          value={board.length}
          hint={`${data.staff.filter((s) => s.role === "editor").length} voluntarios con acceso`}
        />
        <Kpi
          icon={CalendarClock}
          label="Quedan de mandato"
          value={`${left} días`}
          hint={`Hasta el ${fullDate(until)}`}
          emphasis={left < 45}
        />
        <Kpi icon={FileText} label="Archivo" value={ops.documents.length} hint="Estatutos, actas, cuentas y más" />
        <Kpi
          icon={Wallet}
          label="Saldo del curso"
          value={money(ledger.balanceCents, { round: true })}
          hint="Se queda en la asociación"
        />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {board.length ? (
            <section className="grid gap-3 sm:grid-cols-2" aria-label="Cargos">
              {board.map((b, i) => {
                const a = attendance.get(b.id);
                return (
                  <article
                    key={b.id}
                    className="flex items-center gap-3.5 rounded-2xl border border-border bg-bg-primary p-4 shadow-card"
                  >
                    <Avatar name={b.name} tone={TONE_ORDER[i % TONE_ORDER.length]} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{b.role}</p>
                      <p className="truncate font-heading text-base font-bold">{b.name}</p>
                      <p className="truncate text-xs text-text-muted">
                        Desde {relative(`${b.since}T12:00:00Z`, now.getTime())}
                        {a?.sessions ? ` · ${a.attended} de ${a.sessions} reuniones` : ""}
                      </p>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : (
            <Panel>
              <Empty
                icon={Users}
                title="Aún no has configurado la junta"
                body="Añade los cargos para que cada persona tenga su acceso y quede constancia de quién firma qué."
                action={
                  <Button variant="dark" onClick={() => setHandover(true)}>
                    Configurar junta
                  </Button>
                }
              />
            </Panel>
          )}

          {scheduled?.length ? (
            <Panel
              title={scheduledDue ? "Toca hacer el relevo" : "Relevo programado"}
              description={
                scheduledDue
                  ? `La nueva junta empezaba el ${fullDate(scheduled[0].since)}. Dale acceso cuando quieras.`
                  : `El ${fullDate(scheduled[0].since)} la nueva junta recibe su acceso.`
              }
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={cancelScheduled}>
                    Cancelar
                  </Button>
                  {scheduledDue ? (
                    <Button size="sm" variant="dark" onClick={applyScheduled}>
                      Hacer el relevo
                    </Button>
                  ) : null}
                </div>
              }
              flush
            >
              <ul className="divide-y divide-border-light">
                {scheduled.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <Avatar name={b.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{b.name}</span>
                    <span className="shrink-0 text-xs text-text-muted">{b.role}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <HandoverGuide />

          <RegistryPanel pack={pack} />

          <AnnualReportPanel />

          <ArchivePanel onUpload={() => setUploading(true)} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Mandato" description="El curso de la junta actual.">
            <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">
              {pct(total - left, total)} %
            </p>
            <p className="text-sm text-text-muted">del mandato cumplido</p>
            <Meter value={total - left} max={total} className="mt-3" tone={left < 45 ? "warning" : "violet"} />
            <div className="mt-2 flex justify-between text-xs text-text-muted">
              <span>{fullDate(since)}</span>
              <span>{fullDate(until)}</span>
            </div>
          </Panel>

          <section className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
            <p className="flex items-center gap-2 font-heading text-base font-bold">
              <FolderLock className="h-4 w-4 text-violet" strokeWidth={1.9} /> Lo que se queda en la asociación
            </p>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm">
              <Keep label="Socios con su cuota y su historial" value={members.length} />
              <Keep label="Actividades con su asistencia" value={pastActivities} />
              <Keep label="Documentos del archivo" value={ops.documents.length} />
              <Keep label="Movimientos de caja con ticket" value={ops.movements.length} />
              <Keep label="Patrocinadores y sus informes" value={data.sponsors.length} />
            </ul>
          </section>

          <Tip title="El relevo sin dramas">
            Cada año se pierde media asociación en el cambio de junta: contraseñas, el Excel de cuotas, los
            contactos de los patrocinadores. Aquí la cuenta es de la asociación, no de la presidenta.
          </Tip>
        </div>
      </div>

      <HandoverDrawer open={handover} onClose={() => setHandover(false)} docs={ops.documents.length} />
      <UploadDrawer open={uploading} onClose={() => setUploading(false)} />
    </div>
  );
}

function Keep({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-text-secondary">{label}</span>
      <span className="font-semibold tabular">{value}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Papeles del registro universitario                                  */
/* ------------------------------------------------------------------ */

function RegistryPanel({ pack }: { pack: RegistryPack }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const share = pack.share;

  const prepare = () => {
    const html = registryPackHtml(data, now);
    const doc: CommunityArchiveDoc = {
      id: localId("d"),
      title: `Papeles del registro, curso ${pack.course.label}`,
      kind: "registro",
      at: new Date().toISOString(),
      by: "Secretaría",
      html,
      tag: registryTag(pack.course),
    };
    update("community.registry.prepare", (d) =>
      withCommunityOps(d, (o) => ({
        ...o,
        // Solo se guarda la última versión de los papeles de cada curso.
        documents: [doc, ...o.documents.filter((x) => x.tag !== doc.tag)],
      })),
    );
    const opened = openPrintable(html, doc.title);
    toast.success(
      "Papeles preparados",
      opened
        ? "Guárdalos en PDF desde la ventana de impresión. Quedan también en el archivo."
        : "Se han descargado y quedan también en el archivo.",
    );
  };

  const reopen = () => {
    if (pack.prepared?.html) openPrintable(pack.prepared.html, pack.prepared.title);
  };

  return (
    <Panel
      title="Papeles del registro universitario"
      description={
        pack.inSeason
          ? `Se entregan en el primer trimestre: quedan ${pack.daysLeft} días para acabarlo.`
          : `Certificado de junta, lista de socios y memoria del curso ${pack.previous.label}, en un paso.`
      }
      action={
        pack.prepared ? (
          <Pill tone="success">
            <Check className="h-3 w-3" /> Preparados
          </Pill>
        ) : pack.inSeason ? (
          <Pill tone="warning">{pack.daysLeft} días</Pill>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold">Socios de la {data.space.campus}</p>
            <p className="font-heading text-lg font-bold tabular">{share.pct} %</p>
          </div>
          <Meter
            value={share.pct}
            max={100}
            className="mt-1.5"
            tone={share.meets ? "success" : share.total ? "warning" : "violet"}
          />
          <p className="mt-1.5 text-xs text-text-muted">
            {share.total
              ? `${share.community} de ${share.total} socios activos. El registro pide al menos el ${REGISTRY_COMMUNITY_PCT} %.`
              : "Cuando tengas socios en el libro, aquí verás el porcentaje."}
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {pack.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border-light px-3 py-2.5">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  item.ready ? "border-emerald-500 bg-emerald-500 text-white" : "border-amber-400",
                )}
              >
                {item.ready ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{item.title}</span>
                <span className="block text-xs text-text-muted">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        {pack.prepared ? (
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
            Preparados el {dayLabel(pack.prepared.at, { weekday: false })}. Están en el archivo.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant={pack.prepared ? "outline" : "dark"} onClick={prepare} disabled={!data.board.length}>
            <Landmark className="h-4 w-4" /> {pack.prepared ? "Volver a preparar" : "Preparar los papeles"}
          </Button>
          {pack.prepared?.html ? (
            <Button variant="ghost" onClick={reopen}>
              <Printer className="h-4 w-4" /> Abrir los últimos
            </Button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Archivo                                                             */
/* ------------------------------------------------------------------ */

function ArchivePanel({ onUpload }: { onUpload: () => void }) {
  const { data, now } = usePro();
  const toast = useToast();
  const docs = communityOps(data).documents;
  const [filter, setFilter] = React.useState<ArchiveFilter>("all");

  const kinds = (Object.keys(KIND_LABEL) as CommunityArchiveKind[]).filter((k) =>
    docs.some((d) => d.kind === k),
  );
  const list = [...docs]
    .filter((d) => filter === "all" || d.kind === filter)
    .sort((a, b) => b.at.localeCompare(a.at));

  const open = (doc: CommunityArchiveDoc) => {
    if (doc.file?.dataUrl) {
      downloadDataUrl(doc.file.dataUrl, doc.file.name);
      return;
    }
    const html = archiveDocumentHtml(data, doc, now);
    if (!html) {
      toast.info("Este documento no tiene archivo", "Súbelo de nuevo para tenerlo a mano.");
      return;
    }
    if (!openPrintable(html, doc.title)) toast.success("Documento descargado", doc.title);
  };

  return (
    <Panel
      title="Archivo de la asociación"
      description="Todo lo oficial, en un sitio que no depende del Drive de nadie."
      action={
        <Button size="sm" variant="outline" onClick={onUpload}>
          <Plus className="h-3.5 w-3.5" /> Subir
        </Button>
      }
      flush
    >
      {docs.length ? (
        <>
          {kinds.length > 1 ? (
            <div className="border-b border-border-light px-4 py-2.5 sm:px-5">
              <Segmented<ArchiveFilter>
                label="Filtrar el archivo"
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "Todo", count: docs.length },
                  ...kinds.map((k) => ({
                    value: k,
                    label: KIND_LABEL[k],
                    count: docs.filter((d) => d.kind === k).length,
                  })),
                ]}
              />
            </div>
          ) : null}
          <ul className="divide-y divide-border-light">
            {list.map((d) => {
              const readable = Boolean(d.file?.dataUrl || d.html || d.body || d.source);
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <FileText className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{d.title}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {d.by} · {dayLabel(d.at, { weekday: false })}
                      {d.file ? ` · ${d.file.name}` : ""}
                    </span>
                  </span>
                  <Pill className="hidden sm:inline-flex">{KIND_LABEL[d.kind]}</Pill>
                  <IconButton
                    label={d.file?.dataUrl ? `Descargar ${d.title}` : `Abrir ${d.title}`}
                    icon={d.file?.dataUrl ? Download : Printer}
                    onClick={() => open(d)}
                    disabled={!readable}
                    className="h-10 w-10"
                  />
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <Empty
          icon={FolderLock}
          title="El archivo está vacío"
          body="Sube los estatutos y la última acta. Las actas, cuentas y memorias que prepares aquí se guardan solas."
          action={
            <Button variant="dark" onClick={onUpload}>
              <Upload className="h-4 w-4" /> Subir documento
            </Button>
          }
        />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Traspaso                                                            */
/* ------------------------------------------------------------------ */

function HandoverDrawer({ open, onClose, docs }: { open: boolean; onClose: () => void; docs: number }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const nextUntil = (() => {
    const current = data.board[0]?.until;
    if (!current) return `${Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 7 ? 1 : 0)}-06-30`;
    return `${Number(current.slice(0, 4)) + 1}-06-30`;
  })();
  const defaultSeats = data.board.length
    ? data.board.map((b) => ({ id: localId("b"), role: b.role, name: "", previous: b.name }))
    : ["Presidencia", "Tesorería", "Secretaría"].map((role) => ({ id: localId("b"), role, name: "", previous: "" }));

  const [seats, setSeats] = React.useState(defaultSeats);
  const [until, setUntil] = React.useState(nextUntil);
  const [mode, setMode] = React.useState<"now" | "end">(data.board.length ? "end" : "now");

  React.useEffect(() => {
    if (!open) return;
    setSeats(defaultSeats);
    setUntil(nextUntil);
    setMode(data.board.length ? "end" : "now");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const members = data.communityMembers as CommunityMember[];
  const valid = seats.every((s) => s.name.trim().length > 2 && s.role.trim()) && until > today;

  const confirm = () => {
    const current = data.board[0]?.until;
    const since = mode === "now" ? today : current ? addDays(current, 1) : today;
    const board: ProBoardSeat[] = seats.map((s) => ({
      id: s.id,
      role: s.role.trim(),
      name: s.name.trim(),
      since,
      until,
    }));
    if (mode === "end") {
      update("community.board.schedule", (d) =>
        withCommunityOps(d, (o) => ({ ...o, scheduledBoard: board })),
      );
      toast.success(
        "Traspaso programado",
        `El ${fullDate(since)} la nueva junta recibe su acceso. Socios, historia, documentos y cuentas se quedan en la asociación.`,
      );
      onClose();
      return;
    }
    update("board.handover", (d) => applyBoard(d, board, new Date().toISOString()));
    toast.success(
      data.board.length ? "Junta traspasada" : "Junta configurada",
      "La nueva junta ya tiene su acceso. El relevo queda apuntado en el archivo.",
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      wide
      title={data.board.length ? "Traspasar la junta" : "Configurar la junta"}
      description="Elige los cargos. La asociación sigue igual, solo cambian las llaves."
      footer={
        <Button variant="dark" onClick={confirm} disabled={!valid}>
          <KeyRound className="h-4 w-4" /> {mode === "now" ? "Guardar ahora" : "Programar traspaso"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {data.board.length ? (
          <FormField label="Cuándo">
            <ChoiceChips
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: "end",
                  label: "Al terminar el mandato",
                  hint: `El ${fullDate(addDays(data.board[0].until, 1))}`,
                },
                { value: "now", label: "Ahora mismo", hint: "Tras una asamblea" },
              ]}
            />
          </FormField>
        ) : null}

        <div className="flex flex-col gap-3">
          {seats.map((s, i) => (
            <div
              key={s.id}
              className="grid gap-2 rounded-2xl border border-border p-3.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] sm:items-end"
            >
              <FormField label="Cargo" htmlFor={`seat-role-${i}`}>
                <input
                  id={`seat-role-${i}`}
                  className={inputClass}
                  value={s.role}
                  onChange={(e) =>
                    setSeats((list) => list.map((x) => (x.id === s.id ? { ...x, role: e.target.value } : x)))
                  }
                />
              </FormField>
              <FormField
                label={data.board.length ? "Nueva persona" : "Persona"}
                htmlFor={`seat-name-${i}`}
                hint={s.previous ? `Ahora: ${s.previous}` : undefined}
              >
                <input
                  id={`seat-name-${i}`}
                  list="board-members"
                  className={inputClass}
                  value={s.name}
                  placeholder="Busca entre tus socios"
                  onChange={(e) =>
                    setSeats((list) => list.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))
                  }
                />
              </FormField>
            </div>
          ))}
          <datalist id="board-members">
            {members.slice(0, 200).map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setSeats((list) => [...list, { id: localId("b"), role: "Vocal", name: "", previous: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Añadir cargo
          </Button>
        </div>

        <FormField label="Mandato hasta" htmlFor="until">
          <input id="until" type="date" className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />
        </FormField>

        <div className="rounded-2xl bg-bg-secondary p-4">
          <p className="text-sm font-semibold">Se queda todo en la asociación</p>
          <ul className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {[
              [`${members.length} socios`, "con cuota e historial"],
              [`${data.activities.length} actividades`, "con su asistencia"],
              [`${docs} documentos`, "estatutos, actas, cuentas"],
              ["La caja", "movimientos, tickets y saldo"],
            ].map(([a, b]) => (
              <li key={a} className="flex items-start gap-1.5">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet" />
                <span>
                  <span className="font-semibold">{a}</span> <span className="text-text-muted">{b}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-muted">
            La junta saliente pierde el acceso de gestión y sigue como socia. Nadie se lleva contraseñas.
          </p>
        </div>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Subir un documento                                                  */
/* ------------------------------------------------------------------ */

function UploadDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { update } = usePro();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<CommunityArchiveKind>("acta");
  const [file, setFile] = React.useState<CommunityArchiveDoc["file"] | null>(null);
  const [reading, setReading] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setKind("acta");
    setFile(null);
    setProblem(null);
  }, [open]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setProblem(null);
    setReading(true);
    try {
      // Las fotos se reducen para que quepan; los PDF van tal cual si no pesan demasiado.
      const isImage = f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name);
      const dataUrl = isImage ? await receiptThumbnail(f, 1600) : f.size <= MAX_FILE_BYTES ? await readAsDataUrl(f) : null;
      if (!dataUrl) {
        setFile(null);
        setProblem(
          isImage
            ? "No hemos podido abrir esta foto. Prueba con una captura o un JPG."
            : "Este PDF pesa más de 2 MB. Comprímelo o súbelo por páginas.",
        );
        return;
      }
      setFile({ name: f.name, mime: isImage ? "image/jpeg" : f.type || "application/pdf", size: f.size, dataUrl });
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    } catch {
      setProblem("No hemos podido leer el archivo. Prueba de nuevo.");
    } finally {
      setReading(false);
    }
  };

  const save = () => {
    const doc: CommunityArchiveDoc = {
      id: localId("d"),
      title: title.trim(),
      kind,
      at: new Date().toISOString(),
      by: "Junta",
      file: file ?? undefined,
    };
    update("community.archive.upload", (d) =>
      withCommunityOps(d, (o) => ({ ...o, documents: [doc, ...o.documents] })),
    );
    toast.success("Documento guardado", `${doc.title} queda en la asociación.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Subir documento"
      description="PDF o foto. Queda guardado en la asociación, no en tu móvil."
      footer={
        <Button variant="dark" disabled={title.trim().length < 3 || !file || reading} onClick={save}>
          Guardar documento
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <label
          className={cn(
            "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-text-muted hover:border-text-primary/25",
            file ? "border-emerald-400" : "border-border",
          )}
        >
          {file ? (
            <BadgeCheck className="h-5 w-5 text-emerald-600" strokeWidth={1.75} />
          ) : (
            <Upload className="h-5 w-5" strokeWidth={1.75} />
          )}
          <span className="font-semibold text-text-primary">
            {reading ? "Leyendo el archivo" : file ? file.name : "Elige el archivo"}
          </span>
          <span className="text-xs">{file ? "Toca para cambiarlo" : "PDF hasta 2 MB, o una foto"}</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
        {problem ? <p className="text-sm text-rose-700 dark:text-rose-300">{problem}</p> : null}
        <FormField label="Nombre" htmlFor="doc-title">
          <input
            id="doc-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Acta de la reunión de octubre"
          />
        </FormField>
        <FormField label="Tipo">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={(Object.keys(KIND_LABEL) as CommunityArchiveKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
        </FormField>
      </div>
    </Drawer>
  );
}
