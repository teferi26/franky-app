"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  Award,
  BadgeCheck,
  BellRing,
  CameraOff,
  Check,
  Download,
  HandHelping,
  IdCard,
  Link2,
  MessageCircle,
  Moon,
  QrCode,
  Settings2,
  Sparkles,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProCommunityMember } from "@/lib/pro/types";
import { addDays, dayLabel, localDate, money, relative, shortDay } from "@/lib/pro/format";
import { UNIVERSITIES } from "@/lib/pro/demo/common";
import { mandateEnd } from "@/lib/pro/demo/community";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import {
  PAY_METHOD_LABEL,
  communityOps,
  courseLabel,
  courseStart,
  dormantInviteMessage,
  dormantMembers,
  feeReminderMessage,
  isActiveMember,
  memberFeeCents,
  memberHistory,
  memberNumbers,
  membersCsv,
  standDay,
  withCommunityOps,
} from "@/lib/pro/community";
import type {
  CommunityActivity,
  CommunityMember,
  CommunityPayMethod,
  CommunitySponsor,
} from "@/lib/pro/community-types";
import {
  memberCourseCertificateHtml,
  volunteerAgreementHtml,
  volunteerCertificateHtml,
} from "@/lib/pro/community-docs";
import {
  endVolunteer,
  signVolunteerAgreement,
  startVolunteer,
  volunteerHoursSince,
  volunteerRegistry,
  volunteerRegistryCsv,
  volunteerState,
} from "@/lib/pro/community-volunteers";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Detail,
  Drawer,
  Empty,
  FixedPortal,
  FormField,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  SearchInput,
  Segmented,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { downloadCsv, openPrintable } from "./files";

type Filter = "todos" | "pendiente" | "junta" | "nuevos" | "dormidos" | "franky" | "bajas";

const ROLE_LABEL: Record<ProCommunityMember["role"], string> = {
  socio: "Socio",
  junta: "Junta",
  voluntario: "Voluntario",
};
const FEE: Record<ProCommunityMember["fee"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  paid: { label: "Cuota pagada", tone: "success" },
  pending: { label: "Cuota pendiente", tone: "warning" },
  exempt: { label: "Exento", tone: "neutral" },
};
const PAGE = 40;

/** Enlace de alta que se enseña en el QR y se comparte en redes. */
function joinUrl(slug: string) {
  return `https://franky.es/n/${slug}/alta`;
}

/** La primera actividad publicada que viene: para invitar a los dormidos. */
function nextActivity(activities: CommunityActivity[], now: Date) {
  return activities
    .filter((a) => a.status === "published" && a.date >= now.toISOString())
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export default function CommunityMiembros() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const params = useSearchParams();
  const all = data.communityMembers as CommunityMember[];
  const ops = communityOps(data);
  const fee = memberFeeCents(data);
  const today = localDate(now);
  const monthAgo = addDays(today, -30);
  const members = all.filter(isActiveMember);

  const initial = params.get("filtro");
  const [filter, setFilter] = React.useState<Filter>(
    initial === "pendiente" || initial === "dormidos" || initial === "nuevos" ? initial : "todos",
  );
  const [query, setQuery] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE);
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [queue, setQueue] = React.useState(false);
  const [stand, setStand] = React.useState(params.get("stand") === "1");
  const [settings, setSettings] = React.useState(false);

  const isNew = (m: CommunityMember) => localDate(m.joinedAt) >= monthAgo;
  const dormant = dormantMembers(all, now, ops.settings.dormantWeeks);
  const dormantIds = new Set(dormant.map((m) => m.id));
  const pending = members.filter((m) => m.fee === "pending");
  const counts = {
    todos: members.length,
    pendiente: pending.length,
    junta: members.filter((m) => m.role !== "socio").length,
    nuevos: members.filter(isNew).length,
    dormidos: dormant.length,
    franky: members.filter((m) => m.viaFranky).length,
    bajas: all.length - members.length,
  };
  const newViaFranky = members.filter((m) => isNew(m) && m.viaFranky).length;
  const upcoming = nextActivity(data.activities as CommunityActivity[], now);

  const list = (filter === "bajas" ? all.filter((m) => !isActiveMember(m)) : members)
    .filter((m) => {
      if (filter === "pendiente" && m.fee !== "pending") return false;
      if (filter === "junta" && m.role === "socio") return false;
      if (filter === "nuevos" && !isNew(m)) return false;
      if (filter === "dormidos" && !dormantIds.has(m.id)) return false;
      if (filter === "franky" && !m.viaFranky) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.studies.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (filter === "dormidos") return (a.lastSeenAt ?? "").localeCompare(b.lastSeenAt ?? "");
      if (a.role === "junta" && b.role !== "junta") return -1;
      if (b.role === "junta" && a.role !== "junta") return 1;
      return b.joinedAt.localeCompare(a.joinedAt);
    });

  const markReminded = (ids: string[]) => {
    const at = new Date().toISOString();
    update("members.remind", (d) => ({
      ...d,
      communityMembers: d.communityMembers.map((x) =>
        ids.includes(x.id) ? ({ ...x, feeRemindedAt: at } as CommunityMember) : x,
      ),
    }));
  };

  const remindAllInFranky = () => {
    update("members.remind", (d) => ({
      ...d,
      announcements: [
        {
          id: localId("an"),
          title: "Recordatorio: cuota del curso",
          body: `Te queda por pagar la cuota de ${money(fee)}. ${ops.settings.howToPay}`,
          at: new Date().toISOString(),
          audience: "socios",
          reads: 0,
        },
        ...d.announcements,
      ],
      communityMembers: d.communityMembers.map((x) =>
        x.fee === "pending" ? ({ ...x, feeRemindedAt: new Date().toISOString() } as CommunityMember) : x,
      ),
    }));
    toast.success("Recordatorio enviado", `${counts.pendiente} socios lo reciben en su Franky con el enlace de pago.`);
  };

  const exportBook = () => {
    downloadCsv(
      membersCsv(all, { feeCents: fee, course: courseLabel(now) }),
      `libro-de-socios-${data.space.slug}-${today}.csv`,
    );
    toast.success("Libro de socios descargado", `${all.length} personas con su alta, baja, rol y cuota.`);
  };

  const exportVolunteers = () => {
    const registry = volunteerRegistry(all);
    downloadCsv(
      volunteerRegistryCsv(all, data.activities as CommunityActivity[], now),
      `registro-de-voluntariado-${data.space.slug}-${today}.csv`,
    );
    toast.success("Registro de voluntariado descargado", `${registry.length} personas con su alta, acuerdo, baja y horas.`);
  };

  const trailing = (m: CommunityMember) => {
    if (filter === "pendiente") {
      const href = customerWhatsApp(
        m.phone,
        feeReminderMessage({
          member: m,
          spaceName: data.space.name,
          sender: data.space.owner.name,
          feeCents: fee,
          howToPay: ops.settings.howToPay,
          course: courseLabel(now),
        }),
      );
      return href ? (
        <WhatsAppLink
          href={href}
          label={`Recordar la cuota a ${m.name} por WhatsApp`}
          onOpen={() => markReminded([m.id])}
          done={Boolean(m.feeRemindedAt && localDate(m.feeRemindedAt) === today)}
        />
      ) : null;
    }
    if (filter === "dormidos") {
      const href = customerWhatsApp(
        m.phone,
        dormantInviteMessage({
          member: m,
          spaceName: data.space.name,
          activity: upcoming,
          url: `https://franky.es/n/${data.space.slug}`,
        }),
      );
      return href ? <WhatsAppLink href={href} label={`Invitar a ${m.name} por WhatsApp`} /> : null;
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Socios"
        title="Tus socios"
        description={`${members.length} socios, ${counts.pendiente} con la cuota pendiente. ${counts.nuevos} nuevos este mes, ${newViaFranky} de ellos llegados por Franky.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setStand(true)}>
              <QrCode className="h-4 w-4" /> Modo stand
            </Button>
            <Button variant="dark" onClick={() => setCreating(true)}>
              <UserPlus className="h-4 w-4" /> Nuevo socio
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi icon={Users} label="Socios" value={members.length} hint={`${counts.junta} en junta o voluntarios`} />
        <Kpi
          icon={BellRing}
          label="Cuotas pendientes"
          value={counts.pendiente}
          hint={`${money(counts.pendiente * fee, { round: true })} por cobrar`}
          emphasis={counts.pendiente > 0}
          onClick={() => setFilter("pendiente")}
        />
        <Kpi
          icon={Sparkles}
          label="Nuevos en 30 días"
          value={counts.nuevos}
          hint={`${newViaFranky} por Franky`}
          onClick={() => setFilter("nuevos")}
        />
        <Kpi
          icon={Moon}
          label="Dormidos"
          value={counts.dormidos}
          hint={`Sin venir en ${ops.settings.dormantWeeks} semanas`}
          onClick={() => setFilter("dormidos")}
        />
      </KpiRow>

      <div className="flex flex-col gap-3">
        <Segmented<Filter>
          label="Filtrar socios"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setLimit(PAGE);
          }}
          options={[
            { value: "todos", label: "Todos", count: counts.todos },
            { value: "pendiente", label: "Cuota pendiente", count: counts.pendiente },
            { value: "dormidos", label: "Dormidos", count: counts.dormidos },
            { value: "nuevos", label: "Nuevos", count: counts.nuevos },
            { value: "junta", label: "Junta y voluntarios", count: counts.junta },
            { value: "franky", label: "Por Franky", count: counts.franky },
            { value: "bajas", label: "Bajas", count: counts.bajas },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nombre o estudios"
            className="sm:w-72"
          />
          <div className="flex flex-wrap gap-1.5 sm:ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setSettings(true)}>
              <Settings2 className="h-3.5 w-3.5" /> Cuota: {money(fee)}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setImporting(true)}>
              <Upload className="h-3.5 w-3.5" /> Importar
            </Button>
            <Button variant="ghost" size="sm" onClick={exportBook}>
              <Download className="h-3.5 w-3.5" /> Libro de socios
            </Button>
            {volunteerRegistry(all).length ? (
              <Button variant="ghost" size="sm" onClick={exportVolunteers}>
                <HandHelping className="h-3.5 w-3.5" /> Registro de voluntariado
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {filter === "pendiente" && counts.pendiente ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
          <p className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-200">
            {counts.pendiente} socios deben {money(counts.pendiente * fee, { round: true })}. Escríbeles uno a
            uno por WhatsApp con el mensaje ya preparado, o mándalo a todos en Franky.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={remindAllInFranky}>
              <BellRing className="h-3.5 w-3.5" /> En Franky
            </Button>
            <Button size="sm" variant="dark" onClick={() => setQueue(true)}>
              <MessageCircle className="h-3.5 w-3.5" /> Por WhatsApp, uno a uno
            </Button>
          </div>
        </div>
      ) : null}

      {filter === "dormidos" && counts.dormidos ? (
        <div className="rounded-2xl border border-border bg-bg-secondary/60 px-4 py-3 text-sm text-text-secondary">
          {counts.dormidos} socios no han venido a nada en {ops.settings.dormantWeeks} semanas.
          {upcoming
            ? ` Invítales a ${upcoming.title} (${shortDay(upcoming.date)}): el mensaje ya lleva la fecha y el enlace.`
            : " Publica una actividad y tendrás a quién invitarles."}
        </div>
      ) : null}

      <Panel flush>
        {list.length ? (
          <ul className="divide-y divide-border-light">
            {list.slice(0, limit).map((m) => (
              <li key={m.id} className="flex items-center pr-2 sm:pr-3">
                <button
                  type="button"
                  onClick={() => setOpen(m.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left transition-colors hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none sm:pl-5"
                >
                  <Avatar
                    name={m.name}
                    size="sm"
                    tone={m.role === "junta" ? "violet" : m.role === "voluntario" ? "emerald" : "slate"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      <span className="truncate">{m.name}</span>
                      {m.verified !== false ? (
                        <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Verificado" />
                      ) : null}
                      {m.imageConsent === false ? (
                        <CameraOff className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-label="No quiere salir en fotos" />
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {m.studies} · {m.university === UNIVERSITIES[0] ? "UA" : "UMH"}
                      {filter === "dormidos"
                        ? m.lastSeenAt
                          ? ` · vino por última vez ${relative(m.lastSeenAt, now.getTime())}`
                          : " · aún no ha venido a nada"
                        : filter === "bajas" && m.leftAt
                          ? ` · baja el ${shortDay(m.leftAt)}`
                          : isNew(m)
                            ? ` · se unió ${relative(m.joinedAt, now.getTime())}`
                            : ""}
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    {m.viaFranky && isNew(m) ? <Pill tone="violet">Por Franky</Pill> : null}
                    {m.role !== "socio" ? <Pill tone="dark">{ROLE_LABEL[m.role]}</Pill> : null}
                    <Pill tone={FEE[m.fee].tone}>{FEE[m.fee].label}</Pill>
                  </span>
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full sm:hidden",
                      m.fee === "pending" ? "bg-amber-500" : m.fee === "paid" ? "bg-emerald-500" : "bg-border",
                    )}
                    aria-label={FEE[m.fee].label}
                  />
                  <span className="w-10 shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular">{m.activities}</span>
                    <span className="block text-[0.68rem] text-text-muted">activ.</span>
                  </span>
                </button>
                {trailing(m)}
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            icon={filter === "dormidos" ? Moon : Users}
            title={
              filter === "dormidos"
                ? "Nadie se ha dormido"
                : all.length
                  ? "Nadie coincide con el filtro"
                  : "Aún no tienes socios"
            }
            body={
              filter === "dormidos"
                ? `Todos tus socios han venido a algo en las últimas ${ops.settings.dormantWeeks} semanas.`
                : all.length
                  ? "Prueba con otro filtro o busca por nombre."
                  : "Importa tu lista de socios o saca el QR en el stand de acogida. Cada socio queda con su cuota y su rol."
            }
            action={
              all.length ? null : (
                <Button variant="dark" onClick={() => setStand(true)}>
                  Abrir el modo stand
                </Button>
              )
            }
          />
        )}
        {list.length > limit ? (
          <div className="border-t border-border-light px-4 py-3 text-center sm:px-5">
            <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
              Ver {Math.min(PAGE, list.length - limit)} más de {list.length - limit}
            </Button>
          </div>
        ) : null}
      </Panel>

      <Tip title="Tu lista ya no se pierde">
        Los socios, sus cuotas y su historial se quedan en la asociación aunque cambie la junta. El libro de
        socios se descarga en un toque cuando lo pida el registro o la asamblea.
      </Tip>

      <MemberDrawer memberId={open} onClose={() => setOpen(null)} />
      <NewMemberDrawer open={creating} onClose={() => setCreating(false)} />
      <ImportDrawer open={importing} onClose={() => setImporting(false)} />
      <ReminderQueue open={queue} onClose={() => setQueue(false)} />
      <FeeSettingsDrawer open={settings} onClose={() => setSettings(false)} />
      {stand ? <StandMode onClose={() => setStand(false)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function WhatsAppLink({
  href,
  label,
  onOpen,
  done,
}: {
  href: string;
  label: string;
  onOpen?: () => void;
  done?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      onClick={onOpen}
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
        done
          ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-border text-text-secondary hover:border-text-primary/25 hover:text-text-primary",
      )}
    >
      {done ? <Check className="h-4 w-4" strokeWidth={1.9} /> : <MessageCircle className="h-4 w-4" strokeWidth={1.9} />}
    </a>
  );
}

function MemberCard({
  member,
  number,
  now,
  spaceName,
  perks,
}: {
  member: CommunityMember;
  number: number;
  now: Date;
  spaceName: string;
  perks: CommunitySponsor[];
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-bg-dark p-5 text-white shadow-float">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/60">Carné de socio</p>
          <p className="mt-1 font-heading text-lg font-bold">{spaceName}</p>
        </div>
        <p className="rounded-full border border-white/20 px-2 py-0.5 text-[0.68rem] font-semibold text-white/80">
          Curso {courseLabel(now)}
        </p>
      </div>
      <div className="mt-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-heading text-xl font-bold">
            {member.name}
            {member.verified !== false ? <BadgeCheck className="h-4 w-4 shrink-0 text-violet-light" /> : null}
          </p>
          <p className="truncate text-xs text-white/60">{member.studies}</p>
          <p className="mt-2 text-xs text-white/60 tabular">
            N.º {String(number).padStart(4, "0")} · {ROLE_LABEL[member.role]} · válido hasta el{" "}
            {dayLabel(`${mandateEnd(now)}T12:00:00Z`, { weekday: false })}
          </p>
        </div>
        <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white text-bg-dark">
          <QrCode className="h-12 w-12" strokeWidth={1.4} />
        </span>
      </div>
      {perks.length ? (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-white/10 pt-3">
          {perks.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-xs text-white/80">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-light" />
              <span>
                <span className="font-semibold text-white">{s.business}:</span> {s.perk ?? s.packageName}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MemberDrawer({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [method, setMethod] = React.useState<CommunityPayMethod>("bizum");
  React.useEffect(() => setMethod("bizum"), [memberId]);

  const all = data.communityMembers as CommunityMember[];
  const member = all.find((m) => m.id === memberId);
  if (!member) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Socio">
        <span />
      </Drawer>
    );
  }
  const m = member;
  const ops = communityOps(data);
  const fee = memberFeeCents(data);
  const first = m.name.split(" ")[0];
  const activities = data.activities as CommunityActivity[];
  const history = memberHistory(m.id, activities, all, now, courseStart(now));
  const number = memberNumbers(all).get(m.id) ?? 0;
  const perks = (data.sponsors as CommunitySponsor[]).filter((s) => s.status === "active");
  const reminder = customerWhatsApp(
    m.phone,
    feeReminderMessage({
      member: m,
      spaceName: data.space.name,
      sender: data.space.owner.name,
      feeCents: fee,
      howToPay: ops.settings.howToPay,
      course: courseLabel(now),
    }),
  );

  const set = (patch: Partial<CommunityMember>, title: string, detail?: string) => {
    update("member.update", (d) => ({
      ...d,
      communityMembers: d.communityMembers.map((x) => (x.id === m.id ? { ...x, ...patch } : x)),
    }));
    toast.success(title, detail);
  };

  const certificate = () => {
    const html = memberCourseCertificateHtml(data, m.id, now);
    if (!html) return;
    const opened = openPrintable(html, `certificado-${m.name}`);
    toast.success(
      "Certificado del curso listo",
      opened ? "Imprímelo o guárdalo en PDF desde la pestaña nueva." : "Se ha descargado para abrirlo e imprimirlo.",
    );
  };

  const consent = m.imageConsent === undefined ? "sin" : m.imageConsent ? "si" : "no";
  const volunteerHours = Math.round((history.volunteerMinutes / 60) * 10) / 10;

  return (
    <Drawer
      open={Boolean(memberId)}
      onOpenChange={(o) => !o && onClose()}
      title={m.name}
      description={`${m.studies}, ${m.university}`}
      footer={
        m.leftAt ? (
          <Button variant="dark" onClick={() => set({ leftAt: undefined }, `${first} vuelve a ser socio`)}>
            Readmitir
          </Button>
        ) : m.fee === "pending" ? (
          <>
            {reminder ? (
              <Button asChild variant="outline">
                <a
                  href={reminder}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => set({ feeRemindedAt: new Date().toISOString() }, "WhatsApp abierto con el mensaje")}
                >
                  <MessageCircle className="h-4 w-4" /> Recordar por WhatsApp
                </a>
              </Button>
            ) : null}
            <Button
              variant="dark"
              onClick={() =>
                set(
                  { fee: "paid", feePaidVia: method, feePaidAt: new Date().toISOString() },
                  "Cuota marcada como pagada",
                  `${PAY_METHOD_LABEL[method]}, ${money(fee)}. Queda anotada en la caja.`,
                )
              }
            >
              <Check className="h-4 w-4" /> Marcar pagada
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={certificate} disabled={!history.attended.length && !history.shifts.length}>
              <Award className="h-4 w-4" /> Certificado del curso
            </Button>
            <Button variant="dark" onClick={() => toast.success("Carné enviado", `${first} lo tiene en su Franky.`)}>
              <IdCard className="h-4 w-4" /> Enviar carné
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <MemberCard member={m} number={number} now={now} spaceName={data.space.name} perks={perks} />
        <div className="flex flex-wrap gap-1.5">
          {m.leftAt ? <Pill tone="danger">Baja desde el {shortDay(m.leftAt)}</Pill> : null}
          <Pill tone={FEE[m.fee].tone}>{FEE[m.fee].label}</Pill>
          {m.verified !== false ? (
            <Pill tone="violet">
              <BadgeCheck className="h-3 w-3" /> Estudiante verificado
            </Pill>
          ) : (
            <Pill>Sin verificar</Pill>
          )}
          {m.viaFranky ? <Pill tone="info">Llegó por Franky</Pill> : null}
          {m.feeRemindedAt && m.fee === "pending" ? (
            <Pill>Recordado {relative(m.feeRemindedAt, now.getTime())}</Pill>
          ) : null}
        </div>

        {m.fee === "pending" && !m.leftAt ? (
          <FormField label="Si te ha pagado, ¿cómo?">
            <ChoiceChips
              value={method}
              onChange={setMethod}
              options={[
                { value: "bizum", label: "Bizum" },
                { value: "efectivo", label: "Efectivo" },
                { value: "transferencia", label: "Transferencia" },
              ]}
            />
          </FormField>
        ) : null}

        <section>
          <h3 className="font-heading text-base font-bold">Este curso</h3>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Actividades" value={history.attended.length} />
            <MiniStat label="Horas créditos" value={history.ectsHours} />
            <MiniStat label="Voluntariado" value={`${String(volunteerHours).replace(".", ",")} h`} />
          </div>
          {history.attended.length ? (
            <ul className="mt-3 divide-y divide-border-light rounded-xl border border-border">
              {history.attended.slice(0, 6).map(({ activity: a, hours }) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{a.title}</span>
                  <span className="shrink-0 text-xs text-text-muted tabular">
                    {shortDay(a.date)} · {String(hours).replace(".", ",")} h
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-text-muted">
              Aún no tiene asistencias este curso. Sus check-in aparecerán aquí y en su certificado.
            </p>
          )}
          {history.shifts.length ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
              <HandHelping className="h-3.5 w-3.5 shrink-0" /> {history.shifts.length} turnos de voluntariado:{" "}
              {history.shifts.map((s) => s.shift.role.toLowerCase()).slice(0, 3).join(", ")}
            </p>
          ) : null}
        </section>

        <div className="divide-y divide-border-light">
          <Detail label="N.º de socio">{String(number).padStart(4, "0")}</Detail>
          <Detail label="Universidad">{m.university}</Detail>
          <Detail label="Estudios">
            {m.studies}
            {m.course ? `, ${m.course}.º` : ""}
          </Detail>
          <Detail label="Socio desde">{dayLabel(m.joinedAt, { weekday: false })}</Detail>
          {m.phone ? <Detail label="Teléfono">{m.phone}</Detail> : null}
          <Detail label="Actividades en total">{m.activities}</Detail>
          <Detail label={`Cuota ${courseLabel(now)}`}>
            {m.fee === "exempt" ? "Exento" : `${money(fee)}${m.feePaidVia ? `, ${PAY_METHOD_LABEL[m.feePaidVia].toLowerCase()}` : ""}`}
          </Detail>
          {(m.feeHistory ?? []).map((f) => (
            <Detail key={f.course} label={`Cuota ${f.course}`}>
              {f.status === "paid" ? `Pagada, ${money(f.cents)}` : f.status === "exempt" ? "Exento" : "No la pagó"}
            </Detail>
          ))}
        </div>

        <VolunteerBlock member={m} />

        <FormField label="Fotos en actividades" hint="Quien no quiere salir lleva una marca en la lista de la puerta.">
          <ChoiceChips
            value={consent}
            onChange={(v) =>
              set(
                { imageConsent: v === "sin" ? undefined : v === "si" },
                v === "no" ? `${first} no saldrá en fotos` : "Preferencia guardada",
              )
            }
            options={[
              { value: "si", label: "Puede salir" },
              { value: "no", label: "Prefiere no salir" },
              { value: "sin", label: "Sin respuesta" },
            ]}
          />
        </FormField>

        <FormField label="Rol en la asociación">
          <ChoiceChips
            value={m.role}
            onChange={(role) =>
              set({ role }, "Rol actualizado", `${first} ahora es ${ROLE_LABEL[role].toLowerCase()}.`)
            }
            options={[
              { value: "socio", label: "Socio" },
              { value: "voluntario", label: "Voluntario", hint: "Turnos y puerta" },
              { value: "junta", label: "Junta" },
            ]}
          />
        </FormField>

        <div className="flex flex-wrap gap-2">
          {m.fee !== "exempt" ? (
            <Button variant="ghost" size="sm" onClick={() => set({ fee: "exempt" }, "Socio exento de cuota")}>
              Eximir de la cuota este curso
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => set({ fee: "pending" }, "Vuelve a pagar cuota")}>
              Quitar la exención
            </Button>
          )}
          {!m.leftAt ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                set(
                  { leftAt: new Date().toISOString() },
                  `${first} ha causado baja`,
                  "Sigue en el libro de socios con su fecha de baja.",
                )
              }
            >
              <UserMinus className="h-3.5 w-3.5" /> Dar de baja
            </Button>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Voluntariado: alta, acuerdo firmado, baja y certificado             */
/* ------------------------------------------------------------------ */

function VolunteerBlock({ member: m }: { member: CommunityMember }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const state = volunteerState(m);
  const first = m.name.split(" ")[0];
  const all = data.communityMembers as CommunityMember[];
  const hours = m.volunteer ? volunteerHoursSince(m, data.activities as CommunityActivity[], all, now) : 0;

  const patch = (fn: (x: CommunityMember) => CommunityMember, title: string, detail?: string) => {
    update("member.volunteer", (d) => ({
      ...d,
      communityMembers: d.communityMembers.map((x) => (x.id === m.id ? fn(x as CommunityMember) : x)),
    }));
    toast.success(title, detail);
  };

  const print = (html: string | null, name: string) => {
    if (!html) return;
    const opened = openPrintable(html, name);
    if (!opened) toast.success("Documento descargado", "Ábrelo para imprimirlo o guardarlo en PDF.");
  };

  if (state === "none" || state === "left") {
    return (
      <section className="rounded-2xl border border-border p-4">
        <h3 className="flex items-center gap-2 font-heading text-base font-bold">
          <HandHelping className="h-4 w-4 text-violet" strokeWidth={1.9} /> Voluntariado
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          {state === "left" && m.volunteer?.leftAt
            ? `Fue voluntario hasta el ${shortDay(`${m.volunteer.leftAt}T12:00:00Z`)}, con ${String(hours).replace(".", ",")} h de turnos.`
            : "Si echa una mano en las actividades, dale de alta: queda en el registro y sus horas salen en su certificado."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              patch((x) => startVolunteer(x, today), `${first} es voluntario`, "Imprime el acuerdo para que lo firme.")
            }
          >
            <UserPlus className="h-3.5 w-3.5" /> {state === "left" ? "Volver a dar de alta" : "Dar de alta como voluntario"}
          </Button>
          {state === "left" ? (
            <Button size="sm" variant="ghost" onClick={() => print(volunteerCertificateHtml(data, m.id, now), `voluntariado-${m.name}`)}>
              <Award className="h-3.5 w-3.5" /> Certificado
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 font-heading text-base font-bold">
          <HandHelping className="h-4 w-4 text-violet" strokeWidth={1.9} /> Voluntariado
        </h3>
        {state === "active" ? <Pill tone="success">Acuerdo firmado</Pill> : <Pill tone="warning">Falta el acuerdo</Pill>}
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Desde el {shortDay(`${m.volunteer?.since}T12:00:00Z`)} · {String(hours).replace(".", ",")} h de turnos
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => print(volunteerAgreementHtml(data, m.id, now), `acuerdo-voluntariado-${m.name}`)}>
          <Download className="h-3.5 w-3.5" /> Acuerdo de incorporación
        </Button>
        {state === "pending_agreement" ? (
          <Button
            size="sm"
            variant="dark"
            onClick={() => patch((x) => signVolunteerAgreement(x, today), "Acuerdo firmado", "Queda apuntado en el registro de voluntariado.")}
          >
            <Check className="h-3.5 w-3.5" /> Ya lo ha firmado
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            patch((x) => endVolunteer(x, today), `${first} deja el voluntariado`, "Sigue como socio. Te abrimos su certificado.");
            // El certificado se genera con la fecha de baja ya puesta.
            const after = { ...data, communityMembers: all.map((x) => (x.id === m.id ? endVolunteer(x, today) : x)) };
            print(volunteerCertificateHtml(after, m.id, now), `voluntariado-${m.name}`);
          }}
        >
          <UserMinus className="h-3.5 w-3.5" /> Baja y certificado
        </Button>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-secondary px-2 py-2.5">
      <p className="font-heading text-lg font-bold tabular">{value}</p>
      <p className="text-[0.7rem] text-text-muted">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recordatorios por WhatsApp, uno detrás de otro                      */
/* ------------------------------------------------------------------ */

function ReminderQueue({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const ops = communityOps(data);
  const fee = memberFeeCents(data);
  // La fila se fija al abrir: marcar a alguien como recordado no la reordena.
  const [ids, setIds] = React.useState<string[]>([]);
  const [index, setIndex] = React.useState(0);
  const [sent, setSent] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    const members = (data.communityMembers as CommunityMember[]).filter(
      (m) => isActiveMember(m) && m.fee === "pending",
    );
    // Primero a quien nunca se le ha recordado y tiene teléfono.
    members.sort(
      (a, b) =>
        Number(Boolean(a.feeRemindedAt)) - Number(Boolean(b.feeRemindedAt)) ||
        Number(!a.phone) - Number(!b.phone) ||
        a.joinedAt.localeCompare(b.joinedAt),
    );
    setIds(members.map((m) => m.id));
    setIndex(0);
    setSent(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const member = (data.communityMembers as CommunityMember[]).find((m) => m.id === ids[index]);
  const finished = index >= ids.length;
  const message = member
    ? feeReminderMessage({
        member,
        spaceName: data.space.name,
        sender: data.space.owner.name,
        feeCents: fee,
        howToPay: ops.settings.howToPay,
        course: courseLabel(now),
      })
    : "";
  const href = member ? customerWhatsApp(member.phone, message) : undefined;

  const mark = (viaFranky: boolean) => {
    if (!member) return;
    const at = new Date().toISOString();
    update("members.remind", (d) => ({
      ...d,
      communityMembers: d.communityMembers.map((x) =>
        x.id === member.id ? ({ ...x, feeRemindedAt: at } as CommunityMember) : x,
      ),
    }));
    if (viaFranky) toast.success(`${member.name.split(" ")[0]} lo recibe en su Franky`);
    setSent((n) => n + 1);
    setIndex((i) => i + 1);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Recordar cuotas"
      description={
        finished
          ? "Fila terminada."
          : `${index + 1} de ${ids.length}. Se abre WhatsApp con el mensaje escrito; tú solo das a enviar.`
      }
      footer={
        finished ? (
          <Button variant="dark" onClick={onClose}>
            Listo
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setIndex((i) => i + 1)}>
              Saltar
            </Button>
            {href ? (
              <Button asChild variant="dark">
                <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => mark(false)}>
                  <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
                </a>
              </Button>
            ) : (
              <Button variant="dark" onClick={() => mark(true)}>
                <BellRing className="h-4 w-4" /> Enviar en Franky
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Meter value={Math.min(index, ids.length)} max={Math.max(1, ids.length)} tone="success" />
        {finished ? (
          <Empty
            icon={Check}
            title={sent ? `${sent} recordatorios enviados` : "No queda nadie en la fila"}
            body="Cuando paguen desde Franky se marcan solos. Si te pagan en mano, márcalo en su ficha."
          />
        ) : member ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={member.name} />
              <div className="min-w-0">
                <p className="truncate font-heading text-base font-bold">{member.name}</p>
                <p className="truncate text-xs text-text-muted">
                  {member.phone ?? "Sin teléfono: le llega en su Franky"}
                  {member.feeRemindedAt ? ` · recordado ${relative(member.feeRemindedAt, now.getTime())}` : ""}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-bg-secondary p-4 text-sm text-text-secondary">{message}</div>
            <p className="text-xs text-text-muted">
              Puedes cambiar el texto de «cómo se paga» en la cuota del curso.
            </p>
          </>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Modo stand: QR a pantalla completa en la feria de acogida           */
/* ------------------------------------------------------------------ */

function StandMode({ onClose }: { onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const fee = memberFeeCents(data);
  const url = joinUrl(data.space.slug);
  const [qr, setQr] = React.useState("");
  const [name, setName] = React.useState("");
  const [studies, setStudies] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [pay, setPay] = React.useState<"efectivo" | "bizum" | "pending">("efectivo");
  const [photos, setPhotos] = React.useState<"si" | "no">("si");

  React.useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 720 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const today = localDate(now);
  const day = standDay(data.communityMembers as CommunityMember[], today, fee);
  const valid = name.trim().split(/\s+/).length >= 2;

  const add = () => {
    const at = new Date().toISOString();
    const member: CommunityMember = {
      id: localId("m"),
      name: name.trim(),
      university: UNIVERSITIES[0],
      studies: studies.trim() || "Sin indicar",
      role: "socio",
      fee: pay === "pending" ? "pending" : "paid",
      feePaidVia: pay === "pending" ? undefined : pay,
      feePaidAt: pay === "pending" ? undefined : at,
      joinedAt: at,
      activities: 0,
      verified: false,
      viaFranky: false,
      course: 1,
      phone: phone.trim() || undefined,
      imageConsent: photos === "si",
      joinChannel: "stand",
    };
    update("member.create", (d) => ({ ...d, communityMembers: [member, ...d.communityMembers] }));
    toast.success(
      `${member.name.split(" ")[0]} ya es socio`,
      pay === "pending" ? "Le llega el enlace para pagar la cuota y verificar su cuenta." : `Cuota cobrada: ${money(fee)}.`,
    );
    setName("");
    setStudies("");
    setPhone("");
  };

  return (
    <FixedPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Modo stand"
        className="fixed inset-0 z-[70] overflow-y-auto bg-bg-primary pro-scroll"
      >
        <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 pb-10 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Modo stand</p>
              <p className="truncate font-heading text-lg font-bold">{data.space.name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Salir del modo stand"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" strokeWidth={1.9} />
            </button>
          </div>

          <div className="mt-6 grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            <section className="flex flex-col items-center text-center">
              <h2 className="font-heading text-[2rem] font-extrabold leading-tight tracking-[-0.03em] sm:text-[3rem]">
                Hazte socio en 30 segundos
              </h2>
              <p className="mt-2 max-w-md text-text-muted">
                Escanea con la cámara, entra con tu cuenta de la universidad y paga la cuota de {money(fee)} en
                el mismo paso.
              </p>
              <div className="mt-6 w-full max-w-[min(82vw,420px)] rounded-3xl border border-border bg-white p-4 shadow-card">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt={`Código QR para hacerse socio de ${data.space.name}`} className="aspect-square w-full" />
                ) : (
                  <div className="aspect-square w-full rounded-2xl skeleton-shimmer" />
                )}
              </div>
              <p className="mt-3 flex items-center gap-1.5 break-all text-sm text-text-muted">
                <Link2 className="h-4 w-4 shrink-0" /> {url.replace("https://", "")}
              </p>
            </section>

            <aside className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Altas hoy" value={day.joined.length} />
                <MiniStat label="Pagadas" value={day.paid} />
                <MiniStat label="En efectivo" value={money(day.cashCents, { round: true })} />
              </div>

              <section className="rounded-2xl border border-border p-4">
                <p className="font-heading text-base font-bold">Alta en mano</p>
                <p className="text-xs text-text-muted">Para quien no tiene el móvil a mano o paga en efectivo.</p>
                <div className="mt-3 flex flex-col gap-3">
                  <input
                    aria-label="Nombre y apellido"
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nombre y apellido"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      aria-label="Estudios"
                      className={inputClass}
                      value={studies}
                      onChange={(e) => setStudies(e.target.value)}
                      placeholder="Estudios"
                    />
                    <input
                      aria-label="Teléfono"
                      inputMode="tel"
                      className={inputClass}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Teléfono"
                    />
                  </div>
                  <ChoiceChips
                    value={pay}
                    onChange={setPay}
                    options={[
                      { value: "efectivo", label: "Efectivo" },
                      { value: "bizum", label: "Bizum" },
                      { value: "pending", label: "Paga luego" },
                    ]}
                  />
                  <ChoiceChips
                    value={photos}
                    onChange={setPhotos}
                    options={[
                      { value: "si", label: "Puede salir en fotos" },
                      { value: "no", label: "Sin fotos" },
                    ]}
                  />
                  <Button variant="dark" onClick={add} disabled={!valid}>
                    <UserPlus className="h-4 w-4" /> Dar de alta
                  </Button>
                </div>
              </section>

              {day.joined.length ? (
                <section>
                  <p className="text-sm font-semibold">Últimas altas</p>
                  <ul className="mt-2 divide-y divide-border-light rounded-2xl border border-border">
                    {day.joined.slice(0, 6).map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Avatar name={m.name} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
                        <Pill tone={m.fee === "paid" ? "success" : "warning"}>
                          {m.fee === "paid" ? "Pagada" : "Pendiente"}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-text-muted">
                  Las altas de hoy aparecen aquí según entran, por el QR o a mano.
                </p>
              )}
            </aside>
          </div>
        </div>
      </div>
    </FixedPortal>
  );
}

/* ------------------------------------------------------------------ */

function FeeSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const ops = communityOps(data);
  const [amount, setAmount] = React.useState("");
  const [how, setHow] = React.useState("");
  const [weeks, setWeeks] = React.useState("6");

  React.useEffect(() => {
    if (!open) return;
    setAmount(String(ops.settings.feeCents / 100).replace(".", ","));
    setHow(ops.settings.howToPay);
    setWeeks(String(ops.settings.dormantWeeks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cents = Math.round(Number(amount.replace(",", ".")) * 100);
  const valid = Number.isFinite(cents) && cents >= 0 && how.trim().length > 5 && Number(weeks) >= 2;

  const save = () => {
    update("community.settings", (d) =>
      withCommunityOps(d, (o) => ({
        ...o,
        settings: {
          feeCents: cents,
          howToPay: how.trim(),
          dormantWeeks: Math.round(Number(weeks)),
        },
      })),
    );
    toast.success("Cuota guardada", `${money(cents)} por curso. Los recordatorios ya salen con este texto.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Cuota del curso"
      description="Lo que paga cada socio y cómo se paga."
      footer={
        <Button variant="dark" onClick={save} disabled={!valid}>
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Cuota por curso" htmlFor="fee-amount">
          <div className="relative">
            <input
              id="fee-amount"
              inputMode="decimal"
              className={cn(inputClass, "pr-8")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
              €
            </span>
          </div>
        </FormField>
        <FormField label="Cómo se paga" htmlFor="fee-how" hint="Sale tal cual al final del recordatorio.">
          <textarea id="fee-how" className={textareaClass} value={how} onChange={(e) => setHow(e.target.value)} />
        </FormField>
        <FormField label="Socio dormido tras" htmlFor="fee-weeks" hint="Semanas sin venir a ninguna actividad.">
          <input
            id="fee-weeks"
            type="number"
            min={2}
            inputMode="numeric"
            className={inputClass}
            value={weeks}
            onChange={(e) => setWeeks(e.target.value)}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

function NewMemberDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const fee = memberFeeCents(data);
  const [name, setName] = React.useState("");
  const [studies, setStudies] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [university, setUniversity] = React.useState(UNIVERSITIES[0]);
  const [role, setRole] = React.useState<ProCommunityMember["role"]>("socio");
  const [feeState, setFeeState] = React.useState<ProCommunityMember["fee"]>("pending");
  const [photos, setPhotos] = React.useState<"si" | "no" | "sin">("sin");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setStudies("");
    setPhone("");
    setUniversity(UNIVERSITIES[0]);
    setRole("socio");
    setFeeState("pending");
    setPhotos("sin");
  }, [open]);

  const save = () => {
    const at = now.toISOString();
    const member: CommunityMember = {
      id: localId("m"),
      name: name.trim(),
      university,
      studies: studies.trim() || "Sin indicar",
      role,
      fee: feeState,
      feePaidAt: feeState === "paid" ? at : undefined,
      feePaidVia: feeState === "paid" ? "efectivo" : undefined,
      joinedAt: at,
      activities: 0,
      verified: false,
      viaFranky: false,
      course: 1,
      phone: phone.trim() || undefined,
      imageConsent: photos === "sin" ? undefined : photos === "si",
      joinChannel: "manual",
    };
    update("member.create", (d) => ({ ...d, communityMembers: [member, ...d.communityMembers] }));
    toast.success(
      "Socio añadido",
      feeState === "pending"
        ? `${name.split(" ")[0]} recibe el enlace para pagar la cuota y verificar su cuenta.`
        : undefined,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo socio"
      description="Le llega una invitación para verificar su cuenta universitaria."
      footer={
        <Button variant="dark" onClick={save} disabled={name.trim().split(/\s+/).length < 2}>
          Añadir socio
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre y apellido" htmlFor="m-name">
          <input id="m-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Alba Pastor" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Estudios" htmlFor="m-studies">
            <input id="m-studies" className={inputClass} value={studies} onChange={(e) => setStudies(e.target.value)} placeholder="Humanidades" />
          </FormField>
          <FormField label="Teléfono" htmlFor="m-phone">
            <input id="m-phone" inputMode="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="600 000 000" />
          </FormField>
        </div>
        <FormField label="Universidad" htmlFor="m-uni">
          <select id="m-uni" className={inputClass} value={university} onChange={(e) => setUniversity(e.target.value)}>
            {UNIVERSITIES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Rol">
          <ChoiceChips
            value={role}
            onChange={setRole}
            options={[
              { value: "socio", label: "Socio" },
              { value: "voluntario", label: "Voluntario" },
              { value: "junta", label: "Junta" },
            ]}
          />
        </FormField>
        <FormField label="Cuota" hint={`Cuota del curso: ${money(fee)}.`}>
          <ChoiceChips
            value={feeState}
            onChange={setFeeState}
            options={[
              { value: "pending", label: "Pendiente", hint: "Le mandamos el enlace" },
              { value: "paid", label: "Ya pagada" },
              { value: "exempt", label: "Exento" },
            ]}
          />
        </FormField>
        <FormField label="Fotos en actividades">
          <ChoiceChips
            value={photos}
            onChange={setPhotos}
            options={[
              { value: "si", label: "Puede salir" },
              { value: "no", label: "Prefiere no salir" },
              { value: "sin", label: "Se lo preguntamos" },
            ]}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

function ImportDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [text, setText] = React.useState("");

  React.useEffect(() => {
    if (open) setText("");
  }, [open]);

  const rows = text
    .split("\n")
    .map((l) => l.split(/[,;\t]/).map((x) => x.trim()))
    .filter((cols) => cols[0] && cols[0].split(/\s+/).length >= 2);

  const run = () => {
    const created: CommunityMember[] = rows.map((cols) => ({
      id: localId("m"),
      name: cols[0],
      studies: cols[1] || "Sin indicar",
      university: UNIVERSITIES[0],
      role: "socio",
      fee: /pag|s[ií]/i.test(cols[2] ?? "") ? "paid" : "pending",
      joinedAt: now.toISOString(),
      activities: 0,
      verified: false,
      viaFranky: false,
      phone: cols[3] || undefined,
      joinChannel: "import",
    }));
    update("member.import", (d) => ({ ...d, communityMembers: [...created, ...d.communityMembers] }));
    toast.success(
      `${created.length} socios importados`,
      "Les llega la invitación para verificar su cuenta y, si deben la cuota, el enlace de pago.",
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Importar socios"
      description="Pega tu Excel o tu Google Forms. Una persona por línea."
      footer={
        <Button variant="dark" onClick={run} disabled={!rows.length}>
          Importar {rows.length ? rows.length : ""} socios
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField
          label="Nombre, estudios, cuota, teléfono"
          htmlFor="imp"
          hint="Copia las columnas desde la hoja de cálculo. Si la tercera dice «pagada», se marca como pagada."
        >
          <textarea
            id="imp"
            className={cn(textareaClass, "min-h-[180px] font-mono text-xs")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Alba Pastor, Humanidades, pagada, 600 111 222\nIker Sempere, Derecho, pendiente"}
          />
        </FormField>
        {rows.length ? (
          <ul className="divide-y divide-border-light rounded-xl border border-border">
            {rows.slice(0, 5).map((cols, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">{cols[0]}</span>
                <span className="shrink-0 text-xs text-text-muted">{cols[1] || "Sin estudios"}</span>
              </li>
            ))}
            {rows.length > 5 ? <li className="px-3 py-2 text-xs text-text-muted">Y {rows.length - 5} más</li> : null}
          </ul>
        ) : null}
        <div className="rounded-2xl border border-dashed border-border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="h-4 w-4 text-violet" /> O comparte el enlace de alta
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Cada persona se da de alta con su cuenta universitaria y paga la cuota en el momento.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              try {
                void navigator.clipboard?.writeText(joinUrl(data.space.slug));
              } catch {
                // sin portapapeles: el aviso basta
              }
              toast.success("Enlace copiado", "Pégalo en tu grupo de WhatsApp o en la bio de Instagram.");
            }}
          >
            Copiar enlace de alta
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
