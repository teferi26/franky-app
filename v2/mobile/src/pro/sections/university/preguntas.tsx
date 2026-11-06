import React from "react";
import { Text, View } from "react-native";
import { CalendarClock, EyeOff, MessageCircleQuestion, Plus, Search, Send, ThumbsUp, TriangleAlert } from "lucide-react-native";
import { C, FONT, R, S } from "@/theme";
import { relative } from "../../../../../shared/pro/format";
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
} from "../../../../../shared/pro/university-faq";
import { DESK_LABEL, DESK_ORDER, officeOf } from "../../../../../shared/pro/university-office";
import type { ProUniDesk, ProUniFaq } from "../../../../../shared/pro/university-types";
import { localId, usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import {
  ChoiceGrid,
  Chips,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  SearchInput,
  Segmented,
  Sheet,
  Tip,
  Toggle,
} from "../../kit";
import { Card, CardList, EmptyBox, Notice, PanelLink, useUniAction } from "./ui";

type DeskFilter = ProUniDesk | "all";

/** Lo que llega al abrir el editor: una pregunta existente o una nueva preparada. */
type Editing = { id: string } | { draft: Partial<FaqDraft> } | null;

/** Más allá de esta cifra se muestra "Ver más" en lugar de pintar toda la lista. */
const PAGE = 40;

export default function UniversityPreguntas() {
  const { data, now } = usePro();
  const go = useGoSection();
  const [query, setQuery] = React.useState("");
  const [desk, setDesk] = React.useState<DeskFilter>("all");
  const [editing, setEditing] = React.useState<Editing>(null);
  const [limit, setLimit] = React.useState(PAGE);

  React.useEffect(() => setLimit(PAGE), [query, desk]);

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
    <ProPage>
      <PageHeader
        eyebrow="Preguntas frecuentes"
        title="Preguntas frecuentes"
        description={description}
        actions={<PButton label="Nueva pregunta" icon={Plus} onPress={() => setEditing({ draft: {} })} />}
      >
        {faqs.length ? (
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Busca como un estudiante: padrón, fianza" />
            <Chips<DeskFilter>
              value={desk}
              onChange={setDesk}
              options={[
                { value: "all", label: "Todas" },
                ...DESK_ORDER.filter((d) => faqs.some((f) => f.desk === d)).map((d) => ({ value: d, label: DESK_LABEL[d] })),
              ]}
            />
          </>
        ) : null}
      </PageHeader>

      <KpiRow>
        <Kpi icon={Search} label="Abiertas esta semana" value={summary.opensWeek.toLocaleString("es-ES")} hint="Sin pasar por la mesa" emphasis />
        <Kpi
          icon={MessageCircleQuestion}
          label="Publicadas"
          value={summary.published}
          hint={summary.hidden ? (summary.hidden === 1 ? "1 oculta" : `${summary.hidden} ocultas`) : "Todas visibles"}
        />
        <Kpi icon={Send} label="Enviadas desde la cita" value={summary.answeredFromDesk} hint="Últimas cuatro semanas" />
        <Kpi icon={TriangleAlert} label="Por reescribir" value={summary.toRewrite} hint={`Útiles para menos del ${FAQ_HELPFUL_MIN} %`} />
      </KpiRow>

      {!faqs.length ? (
        <EmptyBox>
          <Empty
            icon={MessageCircleQuestion}
            title="Aún no hay preguntas frecuentes"
            body="Empieza por lo que más se repite en tu mostrador: el certificado de empadronamiento, la fianza del piso o el NIE. Cada respuesta es una cita menos cada semana."
            action={<PButton label="Escribir la primera" onPress={() => setEditing({ draft: {} })} />}
          />
        </EmptyBox>
      ) : results.length ? (
        <CardList>
          {results.slice(0, limit).map((f, i) => (
            <FaqCard key={f.id} faq={f} rank={searching ? null : i + 1} onOpen={() => setEditing({ id: f.id })} />
          ))}
          {results.length > limit ? <PButton label="Ver más" variant="outline" full onPress={() => setLimit((n) => n + PAGE)} /> : null}
        </CardList>
      ) : (
        <EmptyBox>
          <Empty
            icon={Search}
            title="Quien busque esto no encontrará respuesta"
            body={`Ninguna pregunta habla de “${query.trim()}”. Si te lo preguntan a menudo, escríbela ahora.`}
            action={
              <PButton
                label="Crear esta pregunta"
                icon={Plus}
                onPress={() => setEditing({ draft: { question: query.trim(), desk: desk === "all" ? "general" : desk } })}
              />
            }
          />
        </EmptyBox>
      )}

      <Panel title="Se repite en la cita previa" description="Temas de las últimas cuatro semanas que ninguna pregunta responde." flush>
        {uncovered.length ? (
          uncovered.slice(0, 6).map((t, i, list) => (
            <ListRow
              key={`${t.desk}-${t.topic}`}
              onPress={() => setEditing({ draft: { question: t.topic, desk: t.desk } })}
              accessibilityLabel={`Responder: ${t.topic}`}
              last={i === list.length - 1}
            >
              <CalendarClock size={16} color={C.muted} strokeWidth={1.9} />
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={2}>{t.topic}</PText>
                <PText v="tiny">{`${DESK_LABEL[t.desk]} · ${t.count} citas`}</PText>
              </View>
              <Pill tone="info" label="Responder" />
            </ListRow>
          ))
        ) : (
          <PText v="small" style={{ padding: S.lg }}>
            {office.appointments.length
              ? "Lo que más se pide en la mesa ya tiene respuesta aquí."
              : "Cuando publiques horas de atención, verás aquí lo que se repite en las citas."}
          </PText>
        )}
      </Panel>

      <Tip title="Cómo escribirlas">
        Con las palabras del estudiante, no las del reglamento: “¿Cómo consigo el padrón para la beca?”. Primero qué tiene que hacer, después dónde. Añade la versión en inglés en las de alojamiento e internacional.
      </Tip>

      <Panel>
        <PanelLink label="Ir a la cita previa" onPress={() => go("atencion")} />
      </Panel>

      <FaqSheet editing={editing} onClose={() => setEditing(null)} />
    </ProPage>
  );
}

function FaqCard({ faq, rank, onOpen }: { faq: ProUniFaq; rank: number | null; onOpen: () => void }) {
  const helpful = helpfulPct(faq);
  const rewrite = needsRewrite(faq);
  return (
    <Card onPress={onOpen} accessibilityLabel={faq.question} style={faq.hidden ? { opacity: 0.7 } : undefined}>
      <View style={{ flexDirection: "row", gap: S.md }}>
        {rank ? (
          <Text style={{ width: 22, textAlign: "right", fontFamily: FONT.display, fontSize: 18, color: C.muted }} maxFontSizeMultiplier={1.2}>
            {rank}
          </Text>
        ) : null}
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Pill label={DESK_LABEL[faq.desk]} />
            {faq.questionEn ? <Pill label="ES · EN" /> : null}
            {faq.hidden ? <Pill icon={EyeOff} label="Oculta" /> : null}
            {rewrite && !faq.hidden ? <Pill tone="warning" label="Por reescribir" /> : null}
          </View>
          <PText v="h2">{faq.question}</PText>
          <PText v="small" numberOfLines={2}>{faq.answer}</PText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.lg, marginTop: 2 }}>
            <PText v="tiny">{`${faq.opensWeek.toLocaleString("es-ES")} esta semana`}</PText>
            {helpful !== null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <ThumbsUp size={12} color={rewrite ? C.warning : C.muted} />
                <PText v="tiny" color={rewrite ? C.warning : undefined}>{`${helpful} %`}</PText>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

type Form = {
  desk: ProUniDesk;
  question: string;
  answer: string;
  keywords: string;
  english: boolean;
  questionEn: string;
  answerEn: string;
};

const EMPTY_FORM: Form = { desk: "general", question: "", answer: "", keywords: "", english: false, questionEn: "", answerEn: "" };

function FaqSheet({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { data, now, pending } = usePro();
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
    setForm({ ...EMPTY_FORM, desk: draft.desk ?? "general", question: draft.question ?? "", english: draft.desk === "internacional" });
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
    <Sheet
      open={Boolean(editing)}
      onClose={onClose}
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
              <PButton label="Sí, borrarla" variant="danger" onPress={() => void remove()} disabled={pending} />
            ) : (
              <PButton label="Borrar" variant="ghost" onPress={() => setConfirmDelete(true)} />
            )
          ) : null}
          {existing ? (
            <PButton label={existing.hidden ? "Publicar de nuevo" : "Ocultar"} variant="outline" onPress={() => void toggleHidden()} disabled={pending} />
          ) : null}
          <PButton label={existing ? "Guardar" : "Publicar"} onPress={() => void save()} disabled={pending || Boolean(problem)} />
        </>
      }
    >
      {existing ? (
        <View style={{ flexDirection: "row", borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingVertical: S.md }}>
          {[
            [existing.opensWeek.toLocaleString("es-ES"), "esta semana"],
            [existing.opens.toLocaleString("es-ES"), "en total"],
            [helpful === null ? "Pocos votos" : `${helpful} %`, "dice que le sirve"],
          ].map(([value, label]) => (
            <View key={label} style={{ flex: 1, alignItems: "center", gap: 2 }}>
              <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
                {value}
              </Text>
              <PText v="tiny">{label}</PText>
            </View>
          ))}
        </View>
      ) : null}

      {existing && needsRewrite(existing) ? (
        <Notice tone="warning" title={`Solo al ${helpful} % le ha servido`}>
          Suele pasar cuando la respuesta no dice dónde ir o qué llevar: añade el paso que falta.
        </Notice>
      ) : null}

      <Field label="Mesa que la responde">
        <ChoiceGrid value={form.desk} onChange={(v) => set("desk", v)} options={DESK_ORDER.map((d) => ({ value: d, label: DESK_LABEL[d] }))} />
      </Field>
      <Field label="Pregunta" hint="Como la escribiría un estudiante.">
        <Input value={form.question} onChangeText={(v) => set("question", v)} placeholder="¿Cómo consigo el certificado de empadronamiento?" label="Pregunta" />
      </Field>
      <Field label="Respuesta">
        <Input value={form.answer} onChangeText={(v) => set("answer", v)} multiline placeholder="Qué tiene que hacer, dónde y qué llevar." label="Respuesta" style={{ minHeight: 140 }} />
      </Field>
      <Field label="Otras palabras con las que la buscan" hint="Separadas por comas: padrón, empadronamiento, certificado.">
        <Input value={form.keywords} onChangeText={(v) => set("keywords", v)} label="Palabras clave" autoCapitalize="none" />
      </Field>

      <Toggle
        label="Versión en inglés"
        detail="Erasmus e internacionales la ven en inglés si usan Franky en ese idioma."
        value={form.english}
        onChange={(v) => set("english", v)}
      />
      {form.english ? (
        <View style={{ gap: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md }}>
          <Field label="Question">
            <Input value={form.questionEn} onChangeText={(v) => set("questionEn", v)} placeholder="How do I get my registration certificate?" label="Question" />
          </Field>
          <Field label="Answer">
            <Input value={form.answerEn} onChangeText={(v) => set("answerEn", v)} multiline label="Answer" />
          </Field>
        </View>
      ) : null}

      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, padding: S.md, gap: S.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
          <PText v="label">Así lo verán</PText>
          {form.english ? (
            <Segmented<"es" | "en">
              value={lang}
              onChange={setLang}
              options={[
                { value: "es", label: "ES" },
                { value: "en", label: "EN" },
              ]}
            />
          ) : null}
        </View>
        <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.md, gap: 4 }}>
          <PText v="h2">{previewQuestion || "Tu pregunta"}</PText>
          <PText v="small">{previewAnswer || "La respuesta que leerá el estudiante."}</PText>
          <PText v="tiny" style={{ marginTop: S.sm }}>{lang === "en" ? "Did this help?" : "¿Te ha servido?"}</PText>
        </View>
      </View>

      {touched && problem ? <PText v="small">{problem}</PText> : null}
    </Sheet>
  );
}
