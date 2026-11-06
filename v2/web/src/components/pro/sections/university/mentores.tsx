"use client";

import * as React from "react";
import { Globe2, MessageCircle, Sprout, UserPlus, Users, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import { relative } from "@/lib/pro/format";
import {
  MENTOR_YEAR_LABEL,
  autoMatch,
  hasRoom,
  mentorLoad,
  mentoringByFaculty,
  mentorsOf,
  silentMatches,
  waitingDays,
  withMentors,
} from "@/lib/pro/university-mentors";
import { cn } from "@/lib/utils";
import { Avatar, Empty, Kpi, KpiRow, Meter, PageHeader, Panel, Pill, Row, RowList, Tip } from "../../kit";
import { HiddenGroup, useUniAction } from "./ui";
import { AssignDrawer, MentorDrawer, NewMentorDrawer } from "./mentores-parts";

export default function UniversityMentores() {
  const { data, now } = usePro();
  const run = useUniAction();
  const m = mentorsOf(data);
  const [creating, setCreating] = React.useState(false);
  const [openMentor, setOpenMentor] = React.useState<string | null>(null);
  const [assigning, setAssigning] = React.useState<string | null>(null);

  const waiting = m.requests.filter((r) => r.status === "waiting").sort((a, b) => a.at.localeCompare(b.at));
  const matched = m.requests.filter((r) => r.status === "matched");
  const talked = matched.filter((r) => r.talked).length;
  const active = m.mentors.filter((x) => x.active);
  const room = active.reduce((a, x) => a + Math.max(0, x.capacity - mentorLoad(x, m.requests)), 0);
  const faculties = mentoringByFaculty(m);
  const silent = silentMatches(m.requests, now);
  // Cuántos se emparejarían ahora mismo con "Emparejar a todos".
  const preview = autoMatch(m.mentors, m.requests, now);
  const talkedHidden = matched.length < 10;

  const matchAll = () =>
    run(
      "mentors.match",
      (d) => withMentors(d, (x) => ({ requests: autoMatch(x.mentors, x.requests, now).requests })),
      preview.matched === 1 ? "1 persona ya tiene mentor" : `${preview.matched} personas ya tienen mentor`,
      preview.withoutMentor.length
        ? `Siguen esperando en ${preview.withoutMentor.join(", ")}: hace falta un mentor más allí.`
        : "A cada mentor le llega un aviso para escribir primero.",
    );

  const description = m.mentors.length
    ? `${waiting.length === 1 ? "1 persona de primero espera" : `${waiting.length} personas de primero esperan`} mentor y ${matched.length} ya tienen. ${
        talkedHidden ? "" : `${Math.round((talked / matched.length) * 10)} de cada 10 parejas ya se han escrito.`
      }`
    : "Estudiantes de segundo en adelante que acompañan a quien llega. Da de alta a los primeros y quien pida mentor en Franky te llegará aquí.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Primero"
        title="Mentores de primero"
        description={description}
        actions={
          <>
            {m.mentors.length ? (
              <Button variant="outline" onClick={() => setCreating(true)}>
                <UserPlus className="h-4 w-4" /> Nuevo mentor
              </Button>
            ) : null}
            {preview.matched > 0 ? (
              <Button variant="dark" onClick={matchAll}>
                <Wand2 className="h-4 w-4" /> Emparejar a {preview.matched}
              </Button>
            ) : !m.mentors.length ? (
              <Button variant="dark" onClick={() => setCreating(true)}>
                <UserPlus className="h-4 w-4" /> Dar de alta un mentor
              </Button>
            ) : null}
          </>
        }
      />

      {m.mentors.length || m.requests.length ? (
        <>
          <KpiRow>
            <Kpi icon={Sprout} label="Esperan mentor" value={waiting.length} hint={waiting[0] ? `La más antigua, ${relative(waiting[0].at, now.getTime())}` : "Nadie esperando"} emphasis={waiting.length > 0} />
            <Kpi icon={Users} label="Acompañados" value={matched.length} hint="Personas de primero con mentor" />
            <Kpi icon={UserPlus} label="Mentores activos" value={active.length} hint={`${room} plazas libres`} />
            <Kpi icon={MessageCircle} label="Ya se han escrito" value={talkedHidden ? "Oculto" : `${Math.round((talked / matched.length) * 100)} %`} hint={talkedHidden ? "Menos de 10 parejas" : "De las parejas emparejadas"} />
          </KpiRow>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-5">
              <Panel title="Esperando mentor" description="Sin nombres: solo facultad y cuándo lo pidió. Tócala para elegir mentor a mano." flush>
                {waiting.length ? (
                  <RowList>
                    {waiting.map((r) => {
                      const days = waitingDays(r, now);
                      const facultyRoom = active.some((x) => x.faculty === r.faculty && hasRoom(x, m.requests));
                      return (
                        <Row key={r.id} onClick={() => setAssigning(r.id)}>
                          <Sprout className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">Primero de {r.faculty}</span>
                            <span className="block truncate text-xs text-text-muted">
                              Lo pidió {relative(r.at, now.getTime())}
                              {facultyRoom ? "" : ". No hay mentor libre en su facultad"}
                            </span>
                          </span>
                          {r.international ? (
                            <Pill tone="info">
                              <Globe2 className="h-3 w-3" /> De fuera
                            </Pill>
                          ) : null}
                          <Pill tone={days >= 3 ? "warning" : "neutral"}>{days === 0 ? "Hoy" : `${days} d`}</Pill>
                        </Row>
                      );
                    })}
                  </RowList>
                ) : (
                  <Empty icon={Sprout} title="Nadie espera mentor" body="Cuando alguien de primero lo pida desde Franky, aparecerá aquí para emparejarlo." />
                )}
              </Panel>

              <Panel title="Por facultad" description="Plazas, espera y parejas que ya han hablado. Por debajo de 10 parejas el porcentaje se oculta." flush>
                <div className="overflow-x-auto pro-scroll">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border-light text-left text-xs text-text-muted">
                        <th className="px-4 py-2.5 font-medium sm:px-5">Facultad</th>
                        <th className="px-3 py-2.5 text-right font-medium">Mentores</th>
                        <th className="px-3 py-2.5 text-right font-medium">Esperan</th>
                        <th className="px-3 py-2.5 text-right font-medium">Acompañados</th>
                        <th className="px-4 py-2.5 font-medium sm:px-5">Se han escrito</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {faculties.map((f) => (
                        <tr key={f.faculty} className="hover:bg-bg-secondary">
                          <td className="px-4 py-2.5 font-medium sm:px-5">
                            {f.faculty}
                            {f.waiting > 0 && f.room === 0 ? (
                              <Pill tone="warning" className="ml-2">
                                Falta un mentor
                              </Pill>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular">
                            {f.mentors}
                            <span className="text-text-muted"> · {f.room} libres</span>
                          </td>
                          <td className={cn("px-3 py-2.5 text-right font-semibold tabular", f.waiting ? "text-text-primary" : "text-text-muted")}>{f.waiting}</td>
                          <td className="px-3 py-2.5 text-right tabular">{f.matched}</td>
                          <td className="px-4 py-2.5 sm:px-5">
                            {f.hidden ? (
                              <HiddenGroup />
                            ) : (
                              <div className="flex items-center gap-2">
                                <Meter value={f.talked} max={f.matched} className="w-16" />
                                <span className="w-10 text-right font-semibold tabular">{f.talkedPct} %</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <Panel title="Mentores" description={`${active.length} activos de ${m.mentors.length}.`} flush>
                <RowList>
                  {[...m.mentors]
                    .sort((a, b) => Number(b.active) - Number(a.active) || a.faculty.localeCompare(b.faculty) || a.name.localeCompare(b.name))
                    .map((x) => {
                      const load = mentorLoad(x, m.requests);
                      return (
                        <Row key={x.id} onClick={() => setOpenMentor(x.id)}>
                          <Avatar name={x.name} size="sm" tone={x.active ? "violet" : "slate"} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{x.name}</span>
                            <span className="block truncate text-xs text-text-muted">
                              {x.faculty} · {MENTOR_YEAR_LABEL[x.year] ?? `${x.year}º`}
                            </span>
                          </span>
                          {x.active ? (
                            <span className="text-xs font-semibold tabular text-text-secondary">
                              {load} de {x.capacity}
                            </span>
                          ) : (
                            <Pill>En pausa</Pill>
                          )}
                        </Row>
                      );
                    })}
                </RowList>
              </Panel>

              {silent.length ? (
                <Tip title="Parejas en silencio">
                  {silent.length === 1 ? "1 pareja lleva" : `${silent.length} parejas llevan`} más de cinco días sin escribirse. Si un mentor no responde, abre su ficha y pasa a su gente a otro.
                </Tip>
              ) : null}

              <Tip title="Las conversaciones son suyas">
                Solo ves cifras: quién espera, cuántos acompaña cada mentor y si la pareja ya se ha escrito. Lo que se cuentan queda entre ellos, en el chat de Franky.
              </Tip>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
          <Empty
            icon={Sprout}
            title="Aún no hay mentores"
            body="Da de alta a estudiantes de segundo en adelante con cuántas personas pueden acompañar. Quien llegue a primero podrá pedir mentor desde Franky."
            action={
              <Button variant="dark" onClick={() => setCreating(true)}>
                <UserPlus className="h-4 w-4" /> Dar de alta un mentor
              </Button>
            }
          />
        </div>
      )}

      <NewMentorDrawer open={creating} onClose={() => setCreating(false)} />
      <MentorDrawer id={openMentor} onClose={() => setOpenMentor(null)} />
      <AssignDrawer id={assigning} onClose={() => setAssigning(null)} />
    </div>
  );
}
