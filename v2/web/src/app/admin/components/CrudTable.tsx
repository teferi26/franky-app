"use client";
import { useState } from 'react';
import { Plus, Search, Save, X, Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { adminOperationError, isUuidResult, isCatalogueDeleteResult } from '@/lib/admin-operation-result';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAdminAction, useAdminData, logManagementAction } from './useAdminManagement';
import {
  SectionTitle, Notice, Quiet, controlClass, controlSmClass, labelClass,
  tableWrapClass, tableClass, thClass, thRightClass, tdClass, trClass,
} from './panel-ui';
/* ─── Slug helper ─── */
function slugify(s: string): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ─── Generic CRUD Table ─── */
// Valores que puede tener una celda editable (columnas escalares de Supabase).
type FieldValue = string | number | boolean | null | undefined;
type Row = Record<string, FieldValue>;
type CatalogueItem = Row & { id: string };
/** Texto para inputs y src: los booleanos y vacíos se muestran como "". */
const asText = (v: FieldValue): string =>
  v === null || v === undefined || typeof v === "boolean" ? "" : String(v);

type CrudColumn = {
  key: string;
  label: string;
  editable?: boolean;
  type?: string;
  step?: number;
  options?: string[];
  autoSlugFrom?: string;
};
export default function CrudTable({
  table,
  columns,
  label,
  readOnly = false,
}: {
  table: string;
  columns: CrudColumn[];
  label: string;
  readOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Row>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState<Row>({});
  const [page, setPage] = useState(0);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const PAGE_SIZE = 15;
  const confirmDelete = useConfirm();
  const { act, saving, error: saveError, isCurrent } = useAdminAction(readOnly);
  const canDelete = ['universities', 'careers', 'scholarships', 'leisure_spots'].includes(table);
  const fieldKeys = columns.map(column => column.key).join(',');
  const { data: listing, loading, error: fetchError, reload: fetchItems } = useAdminData<{ items: CatalogueItem[]; totalCount: number }>(async request => {
    const fields = [...new Set([...fieldKeys.split(','), 'id'])].join(',');
    let query = createClient().from(table).select(fields, { count: 'exact' }).order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const searchColumn = columns.find(column => ['name', 'title', 'full_name'].includes(column.key));
    const term = search.trim().slice(0, 120).replace(/[\\%_]/g, '\\$&');
    if (term && searchColumn) query = query.ilike(searchColumn.key, `%${term}%`);
    const { data, error, count } = await request.query(query);
    if (error || data === null || count === null) throw new Error('No se pudo cargar el catálogo completo de esta página. Reinténtalo.');
    return { items: data as unknown as CatalogueItem[], totalCount: count };
  }, JSON.stringify([table, fieldKeys, search, page]), 250);
  const items = listing?.items ?? [];
  const totalCount = listing?.totalCount ?? null;
  const payloadFor = (source: Row): Row => Object.fromEntries(columns.filter(column => column.editable !== false && Object.hasOwn(source, column.key)).map(column => [column.key, source[column.key]]));

  const handleUpload = async (file: File, colKey: string, target: "edit" | "create") => {
    await act(async request => {
      setUploadError(null); setUploadingKey(`${target}:${colKey}`);
      try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", table);
      const res = await fetch("/api/admin/upload-image", { method: "POST", body: fd, signal: request.signal, headers: { Authorization: request.authorization } });
      const json = await res.json();
      request.check();
      if (!res.ok || !json.url) {
        throw new Error('No se ha podido subir la imagen. Revisa el archivo y vuelve a intentarlo.');
      }
      if (target === "edit") {
        setEditData((p) => ({ ...p, [colKey]: json.url }));
      } else {
        setCreateData((p) => ({ ...p, [colKey]: json.url }));
      }
      } finally { if (isCurrent()) setUploadingKey(null); }
    });
  };

  const handleSave = async (id: string) => {
    await act(async request => {
      const { data, error } = await request.query(createClient().from(table).update(payloadFor(editData)).eq('id', id).select('id'));
      if (error) throw new Error(adminOperationError(error, 'No se ha guardado la ficha. Revisa los campos e inténtalo de nuevo.'));
      if (data?.length !== 1 || data[0].id !== id) throw new Error('La ficha no está disponible o no tienes permiso para editarla. Actualiza el catálogo.');
      await logManagementAction(request, 'update_catalogue_record', table, id);
    }, async () => { setEditId(null); await fetchItems(); });
  };

  const handleCreate = async () => {
    // Auto-fill slug fields that weren't manually edited
    const payload = payloadFor(createData);
    for (const c of columns) {
      if (c.autoSlugFrom && !payload[c.key]) {
        payload[c.key] = slugify(asText(payload[c.autoSlugFrom]));
      }
    }
    await act(async request => {
      const { data, error } = await request.query(createClient().from(table).insert(payload).select('id'));
      if (error) throw new Error(adminOperationError(error, 'No se ha creado la ficha. Completa los campos obligatorios y revisa que no exista ya.'));
      if (data?.length !== 1 || !isUuidResult(data[0].id)) throw new Error('No se pudo confirmar la creación. Actualiza antes de repetirla.');
      await logManagementAction(request, 'create_catalogue_record', table, data[0].id);
    }, async () => { setShowCreate(false); setCreateData({}); await fetchItems(); });
  };

  const handleSoftDelete = async (id: string) => {
    if (!canDelete) return;
    let removed = false;
    await act(async request => {
      const confirmed = await confirmDelete({ title: '¿Mover esta ficha a la papelera?', description: 'Se guardará una copia completa. Si la ficha está relacionada con otros datos, se conservará y te avisaremos.', confirmText: 'Mover a la papelera', variant: 'danger' });
      request.check(); if (!confirmed) return;
      const { data, error } = await request.query(createClient().rpc('delete_catalogue_record', { p_table: table, p_record_id: id }));
      if (error) throw new Error(adminOperationError(error));
      if (!isCatalogueDeleteResult(data, table, id)) throw new Error('No se ha confirmado el borrado. Actualiza antes de repetirlo.');
      removed = true;
    }, async () => { if (!removed) return; if (items.length === 1 && page > 0) setPage(page - 1); else await fetchItems(); });
  };

  return (
    <Card>
      <CardHeader>
        <SectionTitle
          eyebrow="Catálogo"
          title={label}
          aside={
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" strokeWidth={1.75} />
                <Input
                  placeholder={`Buscar ${label.toLowerCase()}...`}
                  className="w-full pl-9 sm:w-56"
                  aria-label={`Buscar ${label.toLowerCase()}`}
                  disabled={saving}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                />
              </div>
              {!readOnly && (
                <Button size="sm" disabled={saving} onClick={() => setShowCreate(!showCreate)}>
                  <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
                  Nuevo
                </Button>
              )}
            </>
          }
        />
      </CardHeader>
      <CardContent>
        <fieldset disabled={saving} className="min-w-0">
        {showCreate && (
          <div className="mb-5 rounded-xl border border-border bg-bg-secondary/60 p-4">
            <p className="eyebrow mb-3">Crear nuevo</p>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              {columns.filter((c) => c.editable !== false).map((col) => {
                const isWide = col.type === "textarea";
                return (
                <div key={col.key} className={isWide ? "sm:col-span-2" : ""}>
                  <label className={labelClass}>{col.label}</label>
                  {col.type === "image" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {createData[col.key] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asText(createData[col.key])} alt="" className="h-10 w-10 rounded-lg border border-border object-cover" />
                      ) : null}
                      <Input
                        type="url"
                        placeholder="https://… o sube archivo"
                        value={asText(createData[col.key])}
                        onChange={(e) => setCreateData((p) => ({ ...p, [col.key]: e.target.value }))}
                        className="flex-1 min-w-[160px]"
                      />
                      <label className="link-underline cursor-pointer whitespace-nowrap text-xs font-semibold text-violet">
                        {uploadingKey === `create:${col.key}` ? "Subiendo…" : "Subir archivo"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          disabled={uploadingKey !== null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUpload(f, col.key, "create");
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  ) : col.type === "select" && col.options ? (
                    <select
                      value={asText(createData[col.key])}
                      onChange={(e) => setCreateData((p) => ({ ...p, [col.key]: e.target.value }))}
                      className={controlClass}
                    >
                      <option value="">Elige una opción</option>
                      {col.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : col.type === "boolean" ? (
                    <button
                      type="button"
                      onClick={() => setCreateData((p) => ({ ...p, [col.key]: !p[col.key] }))}
                      className={`h-11 w-full rounded-xl border px-3.5 text-sm font-medium transition-colors duration-200 ${createData[col.key] ? "border-text-primary bg-text-primary text-bg-primary" : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/40 hover:text-text-primary"}`}
                    >
                      {createData[col.key] ? "Sí" : "No"}
                    </button>
                  ) : col.type === "textarea" ? (
                    <textarea
                      value={asText(createData[col.key])}
                      onChange={(e) => setCreateData((p) => ({ ...p, [col.key]: e.target.value }))}
                      rows={6}
                      className={`${controlClass} h-auto py-2.5 font-mono`}
                    />
                  ) : col.autoSlugFrom ? (
                    <Input
                      type="text"
                      readOnly
                      placeholder="(se genera del título)"
                      value={asText(createData[col.key]) || slugify(asText(createData[col.autoSlugFrom]))}
                      className="bg-bg-secondary/60"
                    />
                  ) : (
                    <Input
                      type={col.type || "text"}
                      step={col.step}
                      value={asText(createData[col.key])}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCreateData((p) => {
                          const next: Row = { ...p, [col.key]: v };
                          // auto-update any slug field that points to this column
                          for (const c of columns) {
                            if (c.autoSlugFrom === col.key) next[c.key] = slugify(v);
                          }
                          return next;
                        });
                      }}
                    />
                  )}
                </div>
                );
              })}
            </div>
            {uploadError && <Notice tone="error" className="mb-3">{uploadError}</Notice>}
            {saveError && <Notice tone="error" className="mb-3">{saveError}</Notice>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate}><Save className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} /> Guardar</Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {fetchError && (
          <Notice tone="error" className="mb-4">
            <strong className="font-semibold text-text-primary">Error al cargar:</strong> {fetchError}
            <Button type="button" variant="outline" size="sm" className="ml-3" onClick={() => void fetchItems()}>Reintentar</Button>
          </Notice>
        )}
        {uploadError && !showCreate && (
          <Notice tone="error" className="mb-4"><strong className="font-semibold text-text-primary">Error al subir imagen:</strong> {uploadError}</Notice>
        )}
        {saveError && !showCreate && (
          <Notice tone="error" className="mb-4"><strong className="font-semibold text-text-primary">Error al guardar:</strong> {saveError}</Notice>
        )}
        {!loading && totalCount !== null && (
          <p className="eyebrow mb-3">{totalCount} registros</p>
        )}
        {loading ? (
          <Quiet role="status">Cargando…</Quiet>
        ) : fetchError ? null : items.length === 0 ? (
          <Quiet>No hay registros</Quiet>
        ) : (
          <>
            <div className={tableWrapClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col.key} className={thClass}>{col.label}</th>
                    ))}
                    <th className={`${thRightClass} w-24`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={trClass}>
                      {columns.map((col) => (
                        <td key={col.key} className={tdClass}>
                          {editId === item.id && col.editable !== false ? (
                            col.type === "image" ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                {(editData[col.key] ?? item[col.key]) ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={asText(editData[col.key] ?? item[col.key])} alt="" className="h-10 w-10 rounded-lg border border-border object-cover" />
                                ) : null}
                                <Input
                                  type="url"
                                  placeholder="https://… o sube archivo"
                                  value={asText(editData[col.key] ?? item[col.key])}
                                  onChange={(e) => setEditData((p) => ({ ...p, [col.key]: e.target.value }))}
                                  className="h-8 min-w-[180px] flex-1 text-xs"
                                />
                                <label className="link-underline cursor-pointer whitespace-nowrap text-xs font-semibold text-violet">
                                  {uploadingKey === `edit:${col.key}` ? "Subiendo…" : "Subir archivo"}
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    className="hidden"
                                    disabled={uploadingKey !== null}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleUpload(f, col.key, "edit");
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              </div>
                            ) : col.type === "select" && col.options ? (
                              <select
                                value={asText(editData[col.key] ?? item[col.key])}
                                onChange={(e) => setEditData((p) => ({ ...p, [col.key]: e.target.value }))}
                                className={controlSmClass}
                              >
                                <option value="">Ninguno</option>
                                {col.options.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : col.type === "boolean" ? (
                              <button
                                type="button"
                                onClick={() => setEditData((p) => ({ ...p, [col.key]: !(p[col.key] ?? item[col.key]) }))}
                                className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors duration-200 ${(editData[col.key] ?? item[col.key]) ? "border-text-primary bg-text-primary text-bg-primary" : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/40"}`}
                              >
                                {(editData[col.key] ?? item[col.key]) ? "Sí" : "No"}
                              </button>
                            ) : col.type === "textarea" ? (
                              <textarea
                                value={asText(editData[col.key] ?? item[col.key])}
                                onChange={(e) => setEditData((p) => ({ ...p, [col.key]: e.target.value }))}
                                rows={3}
                                className={`${controlSmClass} h-auto w-[260px] py-1.5 font-mono`}
                              />
                            ) : (
                            <Input
                              type={col.type || "text"}
                              step={col.step}
                              value={asText(editData[col.key] ?? item[col.key])}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditData((p) => {
                                  const next: Row = { ...p, [col.key]: v };
                                  for (const c of columns) {
                                    if (c.autoSlugFrom === col.key) next[c.key] = slugify(v);
                                  }
                                  return next;
                                });
                              }}
                              className="h-8 text-xs"
                            />
                            )
                          ) : (
                            col.type === "image" ? (
                              item[col.key] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={asText(item[col.key])} alt="" className="h-10 w-10 rounded-lg border border-border object-cover" />
                              ) : <span className="text-text-muted">-</span>
                            ) : (
                            <span className="block max-w-[280px] whitespace-normal break-words text-text-secondary">
                              {typeof item[col.key] === "boolean" ? (item[col.key] ? "Sí" : "No") : String(item[col.key] ?? "-")}
                            </span>
                            )
                          )}
                        </td>
                      ))}
                      <td className={`${tdClass} text-right`}>
                        {readOnly ? (
                          <span className="text-xs text-text-muted">solo lectura</span>
                        ) : (
                          <div className="flex justify-end gap-0.5">
                            {editId === item.id ? (
                              <>
                                <Button variant="ghost" size="icon-sm" className="text-success hover:text-success" onClick={() => handleSave(item.id)} title="Guardar" aria-label="Guardar"><Save className="h-4 w-4" strokeWidth={1.75} /></Button>
                                <Button variant="ghost" size="icon-sm" onClick={() => setEditId(null)} title="Cancelar" aria-label="Cancelar"><X className="h-4 w-4" strokeWidth={1.75} /></Button>
                              </>
                            ) : (
                              <>
                                <Button variant="ghost" size="icon-sm" onClick={() => { setEditId(item.id); setEditData(payloadFor(item)); }} title="Editar" aria-label="Editar"><Pencil className="h-4 w-4" strokeWidth={1.75} /></Button>
                                {canDelete && <Button variant="ghost" size="icon-sm" className="text-error hover:text-error" onClick={() => handleSoftDelete(item.id)} title="Mover a la papelera" aria-label="Mover a la papelera"><Trash2 className="h-4 w-4" strokeWidth={1.75} /></Button>}
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border-light pt-4">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="tabular text-xs text-text-muted">Página {page + 1}</span>
              <Button size="sm" variant="outline" disabled={totalCount === null || (page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </>
        )}
        {!canDelete && !readOnly && <p className="mt-4 text-xs text-text-muted">La retirada de publicaciones, eventos y alojamientos se hace desde su gestión específica para revisar las notificaciones, reservas y pagos asociados.</p>}
        </fieldset>
      </CardContent>
    </Card>
  );
}

