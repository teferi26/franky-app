"use client";

import * as React from "react";
import { Plus, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { TAG_SUGGESTIONS, cleanTag, normalizeSearch, saveNotes, toggleTag, type NoteTarget } from "@/lib/pro/housing-tools";
import { cn } from "@/lib/utils";
import { inputClass, textareaClass } from "../../kit";

/**
 * Nota interna y etiquetas de un interesado, inquilino o piso. Es la memoria
 * del equipo ("los padres llaman mucho", "caldera antigua"): solo la ve el
 * negocio y la búsqueda de la cabecera la encuentra.
 */
export function NotesBox({
  target,
  id,
  note,
  tags,
}: {
  target: NoteTarget;
  id: string;
  note?: string;
  tags?: string[];
}) {
  const { update } = usePro();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(note ?? "");
  const [draftTags, setDraftTags] = React.useState<string[]>(tags ?? []);
  const [custom, setCustom] = React.useState("");
  const current = tags ?? [];
  const suggestions = [
    ...TAG_SUGGESTIONS[target],
    ...draftTags.filter((t) => !TAG_SUGGESTIONS[target].some((s) => normalizeSearch(s) === normalizeSearch(t))),
  ];

  const start = () => {
    setText(note ?? "");
    setDraftTags(current);
    setCustom("");
    setEditing(true);
  };

  const addCustom = () => {
    const tag = cleanTag(custom);
    if (!tag) return;
    if (!draftTags.some((t) => normalizeSearch(t) === normalizeSearch(tag))) setDraftTags((prev) => [...prev, tag]);
    setCustom("");
  };

  const save = () => {
    update(`${target}.notes`, (d) => saveNotes(d, target, id, { note: text, tags: draftTags }));
    toast.success("Nota guardada", "Solo la ve tu equipo.");
    setEditing(false);
  };

  if (!editing) {
    const empty = !note && !current.length;
    return (
      <div className="rounded-2xl border border-dashed border-border p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <StickyNote className="h-4 w-4 text-text-muted" strokeWidth={1.8} /> Notas del equipo
          </p>
          <Button size="sm" variant="ghost" onClick={start}>
            {empty ? "Añadir" : "Editar"}
          </Button>
        </div>
        {empty ? (
          <p className="mt-0.5 text-xs text-text-muted">Lo que conviene recordar la próxima vez. Solo lo ve tu equipo.</p>
        ) : (
          <>
            {current.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {current.map((t) => (
                  <span key={t} className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-text-secondary">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            {note ? <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{note}</p> : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border p-3.5">
      <p className="text-sm font-semibold">Notas del equipo</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((t) => {
          const on = draftTags.some((x) => normalizeSearch(x) === normalizeSearch(t));
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => setDraftTags((prev) => toggleTag(prev, t))}
              className={cn(
                "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors",
                on ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-text-secondary hover:border-text-primary/25",
              )}
            >
              {t}
              {on ? <X className="h-3 w-3" strokeWidth={2} /> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          aria-label="Otra etiqueta"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Otra etiqueta"
          maxLength={40}
          className={cn(inputClass, "h-9")}
        />
        <Button size="sm" variant="outline" onClick={addCustom} disabled={!cleanTag(custom)} aria-label="Añadir etiqueta">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <textarea
        aria-label="Nota"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Prefiere que le llamen por la tarde. Su madre firma como avalista."
        maxLength={600}
        className={cn(textareaClass, "mt-2")}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
        <Button size="sm" variant="secondary" onClick={save}>
          Guardar nota
        </Button>
      </div>
    </div>
  );
}
