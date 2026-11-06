"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  EyeOff,
  Languages,
  MessageCircleQuestion,
  Plus,
  Search,
  Send,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { localId, usePro } from "@/lib/pro/store";
import { relative } from "@/lib/pro/format";
import {
  FAQ_HELPFUL_MIN,
  faqProblem,
  faqSummary,
  faqsOf,
  helpfulPct,
  needsRewrite,
  parseKeywords,
  removeFaq,
  saveFaq,
  searchFaqs,
  setFaqHidden,
  uncoveredTopics,
  withFaqs,
  type FaqDraft,
} from "@/lib/pro/university-faq";
import { DESK_LABEL, DESK_ORDER, officeOf } from "@/lib/pro/university-office";
import type { ProUniDesk, ProUniFaq } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Detail,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  Row,
  RowList,
  SearchInput,
  Segmented,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { sectionHref } from "../../shell";
import { ToggleRow, useUniAction } from "./ui";

type DeskFilter = ProUniDesk | "all";

/** Lo que llega al abrir el editor: una pregunta existente o una nueva preparada. */
type Editing = { id: string } | { draft: Partial<FaqDraft> } | null;

export default function UniversityPreguntas() {
  const { data, now, spaceId } = usePro();
  const [query, setQuery] = React.useState("");
  const [desk, setDesk] = React.useState<DeskFilter>("all");
  const [editing, setEditing] = React.useState<Editing>(null);

  const faqs = faqsOf(data);
  const office = officeOf(data);
  const summary = faqSummary(faqs, office.appointments, now);
  const uncovered = uncoveredTopics(office.appointments, faqs, now);
  const results = searchFaqs(faqs, query, { desk: desk === "all" ? null : desk, includeHidden: true });
  const searching = query.trim().length > 0;
  const top = searchFaqs(faqs, "")[0];

  const description = faqs.length
    ? `${summary.published} preguntas publicadas, abiertas ${summary.opensWeek.toLocaleString("es-ES")} veces esta semana${
        top ? `. La más buscada: “${top.question}”` : ""
      }.`
    : "Responde una vez lo que se pregunta cada octubre y el estudiante lo encuentra en Franky antes de pedir cita.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Preguntas frecuentes"
        title="Preguntas frecuentes"
        description={description}
        actions={
          <Button variant="dark" onClick={() => setEditing({ draft: {} })}>
            <Plus className="h-4 w-4" /> Nueva pregunta
          </Button>
        }
      >
        {faqs.length ? (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Busca como lo haría un estudiante: padrón, fianza, NIE"
              className="sm:max-w-md sm:flex-1"
            />
            <Segmented<DeskFilter>
              label="Mesa"
              value={desk}
              onChange={setDesk}
              options={[
                { value: "all", label: "Todas", count: faqs.length },
                ...DESK_ORDER.filter((d) => faqs.some((f) => f.desk === d)).map((d) => ({
                  value: d,
                  label: DESK_LABEL[d],
                  count: faqs.filter((f) => f.desk === d).length,
                })),
              ]}
            />
          </div>
        ) : null}
      </PageHeader>

      <KpiRow>
        <Kpi
          icon={Search}
          label="Abiertas esta semana"
          value={summary.opensWeek.toLocaleString("es-ES")}
          hint="Sin pasar por la mesa"
          emphasis
        />
        <Kpi
          icon={MessageCircleQuestion}
          label="Publicadas"
          value={summary.published}
          hint={summary.hidden ? (summary.hidden === 1 ? "1 oculta" : `${summary.hidden} ocultas`) : "Todas visibles"}
        />
        <Kpi
          icon={Send}
          label="Enviadas desde la cita"
          value={summary.answeredFromDesk}
          hint="Últimas cuatro semanas"
        />
        <Kpi
          icon={TriangleAlert}
          label="Por reescribir"
          value={summary.toRewrite}
          hint={`Útiles para menos del ${FAQ_HELPFUL_MIN} %`}
        />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {!faqs.length ? (
            <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
              <Empty
                icon={MessageCircleQuestion}
                title="Aún no hay preguntas frecuentes"
                body="Empieza por lo que más se repite en tu mostrador: el certificado de empadronamiento, la fianza del piso o el NIE. Cada respuesta es una cita menos cada semana."
                action={
                  <Button variant="dark" onClick={() => setEditing({ draft: {} })}>
                    Escribir la primera
                  </Button>
                }
              />
            </div>
          ) : results.length ? (
            <ol className="flex flex-col gap-2.5">
              {results.map((f, i) => (
                <li key={f.id} className="animate-list-in" style={{ "--i": i } as React.CSSProperties}>
                  <FaqCard faq={f} rank={searching ? null : i + 1} onOpen={() => setEditing({ id: f.id })} />
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
              <Empty
                icon={Search}
                title="Quien busque esto no encontrará respuesta"
                body={`Ninguna pregunta habla de “${query.trim()}”. Si te lo preguntan a menudo, escríbela ahora.`}
                action={
                  <Button
                    variant="dark"
                    onClick={() =>
                      setEditing({ draft: { question: query.trim(), desk: desk === "all" ? "general" : desk } })
                    }
                  >
                    <Plus className="h-4 w-4" /> Crear esta pregunta
                  </Button>
                }
              />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Se repite en la cita previa"
            description="Temas de las últimas cuatro semanas que ninguna pregunta responde."
            flush
          >
            {uncovered.length ? (
              <RowList>
                {uncovered.slice(0, 6).map((t) => (
                  <Row
                    key={`${t.desk}-${t.topic}`}
                    onClick={() => setEditing({ draft: { question: t.topic, desk: t.desk } })}
                  >
                    <CalendarClock className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{t.topic}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {DESK_LABEL[t.desk]} · {t.count} citas
                      </span>
                    </span>
                    <Pill tone="info">Responder</Pill>
                  </Row>
                ))}
              </RowList>
            ) : (
              <p className="px-4 py-4 text-sm text-text-muted sm:px-5">
                {office.appointments.length
                  ? "Lo que más se pide en la mesa ya tiene respuesta aquí."
                  : "Cuando publiques horas de atención, verás aquí lo que se repite en las citas."}
              </p>
            )}
          </Panel>

          <Tip title="Cómo escribirlas">
            Con las palabras del estudiante, no las del reglamento: “¿Cómo consigo el padrón para la beca?”. Primero qué tiene
            que hacer, después dónde. Añade la versión en inglés en las de alojamiento e internacional.
          </Tip>

          <Link href={sectionHref(spaceId, "atencion")} className="text-sm font-semibold text-violet">
            Ir a la cita previa
          </Link>
        </div>
      </div>

      <FaqDrawer editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta de la lista                                                 */
/* ------------------------------------------------------------------ */

function FaqCard({ faq, rank, onOpen }: { faq: ProUniFaq; rank: number | null; onOpen: () => void }) {
  const helpful = helpfulPct(faq);
  const rewrite = needsRewrite(faq);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-[border-color,box-shadow] hover:border-text-primary/15 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:gap-4 sm:p-5",
        faq.hidden && "opacity-70",
      )}
    >
      {rank ? (
        <span className="w-6 shrink-0 pt-0.5 text-right font-heading text-lg font-bold leading-none text-text-muted tabular">
          {rank}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill>{DESK_LABEL[faq.desk]}</Pill>
          {faq.questionEn ? <Pill>ES · EN</Pill> : null}
          {faq.hidden ? (
            <Pill tone="neutral">
              <EyeOff className="h-3 w-3" /> Oculta
            </Pill>
          ) : null}
          {rewrite && !faq.hidden ? <Pill tone="warning">Por reescribir</Pill> : null}
        </span>
        <span className="mt-2 block font-heading text-base font-bold leading-snug">{faq.question}</span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-text-muted">{faq.answer}</span>
      </span>
      <span className="hidden shrink-0 flex-col items-end gap-1 text-right sm:flex">
        <span className="font-heading text-xl font-bold tabular">{faq.opensWeek.toLocaleString("es-ES")}</span>
        <span className="text-xs text-text-muted">esta semana</span>
        {helpful !== null ? (
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-xs font-semibold tabular",
              rewrite ? "text-amber-700 dark:text-amber-300" : "text-text-secondary",
            )}
          >
            <ThumbsUp className="h-3 w-3" /> {helpful} %
          </span>
        ) : null}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

type Form = {
  desk: ProUniDesk;
  question: string;
  answer: string;
  keywords: string;
  english: boolean;
  questionEn: string;
  answerEn: string;
};

const EMPTY_FORM: Form = {
  desk: "general",
  question: "",
  answer: "",
  keywords: "",
  english: false,
  questionEn: "",
  answerEn: "",
};

function FaqDrawer({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const faqs = faqsOf(data);
  const existing = editing && "id" in editing ? faqs.find((f) => f.id === editing.id) ?? null : null;
  const [form, setForm] = React.useState<Form>(EMPTY_FORM);
  const [lang, setLang] = React.useState<"es" | "en">("es");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (!editing) return;
    setLang("es");
    setConfirmDelete(false);
    if (existing) {
      setForm({
        desk: existing.desk,
        question: existing.question,
        answer: existing.answer,
        keywords: (existing.keywords ?? []).join(", "),
        english: Boolean(existing.questionEn),
        questionEn: existing.questionEn ?? "",
        answerEn: existing.answerEn ?? "",
      });
      return;
    }
    const draft = "draft" in editing ? editing.draft : {};
    const english = draft.desk === "internacional";
    setForm({ ...EMPTY_FORM, desk: draft.desk ?? "general", question: draft.question ?? "", english });
    // Solo al abrir: mientras se escribe no se pisa lo que teclea la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const draft: FaqDraft = {
    id: existing?.id,
    desk: form.desk,
    question: form.question,
    answer: form.answer,
    questionEn: form.english ? form.questionEn : undefined,
    answerEn: form.english ? form.answerEn : undefined,
    keywords: parseKeywords(form.keywords),
    hidden: existing?.hidden,
  };
  const problem = faqProblem(faqs, draft);
  const touched = form.question.trim().length > 0 || form.answer.trim().length > 0;
  const helpful = existing ? helpfulPct(existing) : null;

  const save = async () => {
    const ok = await run(
      existing ? "faq.update" : "faq.create",
      (d) => withFaqs(d, (list) => saveFaq(list, draft, now, localId("fq"))),
      existing ? "Pregunta actualizada" : "Pregunta publicada",
      existing ? undefined : "Ya aparece cuando un estudiante busca en Franky antes de pedir cita.",
    );
    if (ok) onClose();
  };

  const toggleHidden = async () => {
    if (!existing) return;
    const hide = !existing.hidden;
    const ok = await run(
      "faq.visibility",
      (d) => withFaqs(d, (list) => setFaqHidden(list, existing.id, hide, now)),
      hide ? "Pregunta oculta" : "Pregunta publicada de nuevo",
      hide ? "No aparece en Franky hasta que la vuelvas a publicar." : undefined,
    );
    if (ok) onClose();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await run("faq.delete", (d) => withFaqs(d, (list) => removeFaq(list, existing.id)), "Pregunta borrada");
    if (ok) onClose();
  };

  const previewQuestion = lang === "en" && form.questionEn ? form.questionEn : form.question;
  const previewAnswer = lang === "en" && form.answerEn ? form.answerEn : form.answer;

  return (
    <Drawer
      open={Boolean(editing)}
      onOpenChange={(o) => !o && onClose()}
      wide
      title={existing ? "Editar pregunta" : "Nueva pregunta"}
      description={
        existing
          ? `Actualizada ${relative(existing.updatedAt, now.getTime())}. Las cifras se conservan al editar.`
          : "La ve quien busca en Franky antes de pedir cita."
      }
      footer={
        <>
          {existing ? (
            confirmDelete ? (
              <Button variant="destructive" onClick={remove}>
                Sí, borrarla
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                Borrar
              </Button>
            )
          ) : null}
          {existing ? (
            <Button variant="outline" onClick={toggleHidden}>
              {existing.hidden ? "Publicar de nuevo" : "Ocultar"}
            </Button>
          ) : null}
          <Button variant="dark" onClick={save} disabled={Boolean(problem)}>
            {existing ? "Guardar cambios" : "Publicar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {existing ? (
          <section className="grid grid-cols-3 gap-2 rounded-2xl border border-border p-3 text-center">
            <div>
              <p className="font-heading text-xl font-bold tabular">{existing.opensWeek.toLocaleString("es-ES")}</p>
              <p className="text-xs text-text-muted">esta semana</p>
            </div>
            <div>
              <p className="font-heading text-xl font-bold tabular">{existing.opens.toLocaleString("es-ES")}</p>
              <p className="text-xs text-text-muted">en total</p>
            </div>
            <div>
              <p
                className={cn(
                  "font-heading text-xl font-bold tabular",
                  needsRewrite(existing) && "text-amber-700 dark:text-amber-300",
                )}
              >
                {helpful === null ? "Pocos votos" : `${helpful} %`}
              </p>
              <p className="text-xs text-text-muted">dice que le sirve</p>
            </div>
          </section>
        ) : null}

        {existing && needsRewrite(existing) ? (
          <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            Solo al {helpful} % le ha servido. Suele pasar cuando la respuesta no dice dónde ir o qué llevar: añade el
            paso que falta.
          </p>
        ) : null}

        <FormField label="Mesa que la responde">
          <ChoiceChips
            value={form.desk}
            onChange={(v) => set("desk", v)}
            options={DESK_ORDER.map((d) => ({ value: d, label: DESK_LABEL[d] }))}
          />
        </FormField>

        <FormField label="Pregunta" htmlFor="faq-question" hint="Como la escribiría un estudiante.">
          <input
            id="faq-question"
            className={inputClass}
            value={form.question}
            onChange={(e) => set("question", e.target.value)}
            placeholder="¿Cómo consigo el certificado de empadronamiento?"
          />
        </FormField>

        <FormField label="Respuesta" htmlFor="faq-answer">
          <textarea
            id="faq-answer"
            className={cn(textareaClass, "min-h-[140px]")}
            value={form.answer}
            onChange={(e) => set("answer", e.target.value)}
            placeholder="Qué tiene que hacer, dónde y qué llevar."
          />
        </FormField>

        <FormField
          label="Otras palabras con las que la buscan"
          htmlFor="faq-keywords"
          hint="Separadas por comas: padrón, empadronamiento, certificado."
        >
          <input
            id="faq-keywords"
            className={inputClass}
            value={form.keywords}
            onChange={(e) => set("keywords", e.target.value)}
          />
        </FormField>

        <ToggleRow
          id="faq-english"
          label="Versión en inglés"
          hint="Erasmus e internacionales la ven en inglés si usan Franky en ese idioma."
          checked={form.english}
          onChange={(v) => set("english", v)}
        />
        {form.english ? (
          <div className="grid gap-3 rounded-xl border border-border p-3.5">
            <FormField label="Question" htmlFor="faq-question-en">
              <input
                id="faq-question-en"
                lang="en"
                className={inputClass}
                value={form.questionEn}
                onChange={(e) => set("questionEn", e.target.value)}
                placeholder="How do I get my registration certificate?"
              />
            </FormField>
            <FormField label="Answer" htmlFor="faq-answer-en">
              <textarea
                id="faq-answer-en"
                lang="en"
                className={textareaClass}
                value={form.answerEn}
                onChange={(e) => set("answerEn", e.target.value)}
              />
            </FormField>
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-bg-secondary/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-text-muted">Así lo verán</p>
            {form.english ? (
              <Segmented<"es" | "en">
                label="Idioma de la vista previa"
                value={lang}
                onChange={setLang}
                options={[
                  { value: "es", label: "ES" },
                  { value: "en", label: "EN" },
                ]}
              />
            ) : (
              <Languages className="h-4 w-4 text-text-muted" strokeWidth={1.9} aria-hidden />
            )}
          </div>
          <div className="mt-3 rounded-xl border border-border bg-bg-primary p-3.5">
            <p className="font-heading text-base font-bold">{previewQuestion || "Tu pregunta"}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-text-secondary">
              {previewAnswer || "La respuesta que leerá el estudiante."}
            </p>
            <p className="mt-3 text-xs font-semibold text-text-muted">
              {lang === "en" ? "Did this help?" : "¿Te ha servido?"}
            </p>
          </div>
        </div>

        {touched && problem ? <p className="text-sm text-text-muted">{problem}</p> : null}

        {existing ? (
          <div className="divide-y divide-border-light">
            <Detail label="Votos">
              {(existing.helpful + existing.unhelpful).toLocaleString("es-ES")}
            </Detail>
            <Detail label="Estado">{existing.hidden ? "Oculta" : "Publicada"}</Detail>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
