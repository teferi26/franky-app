"use client";
import UserLookupTool from "./components/UserLookupTool";

import CrudTable from './components/CrudTable';
import CrushPartyPanel from './components/CrushPartyPanel';
import DecisionCenter from "./components/DecisionCenter";
import PaymentReview from "./components/PaymentReview";
import { useSession } from "@/components/SessionProvider";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { AdminSessionScope, useAdminRequest } from './components/AdminSessionScope';
import { adminOperationError, isUuidResult, isRestorationResult, restorationHint, isReportStrikeResult } from '@/lib/admin-operation-result';
import { useAdminData, useAdminAction, logManagementAction } from './components/useAdminManagement';
import { readManagementCounts } from '@/lib/admin-management-counts';
import Link from "next/link";
import {
  Users, BookOpen, Building2, Trophy, Newspaper, CalendarDays,
  BarChart3, Search,
  Shield, Trash2, X,
  Home, AlertTriangle, FileText, UserPlus,
  Ban, Eye, EyeOff, CheckCircle, XCircle, Clock, RotateCcw,
  Image as ImageIcon, Heart,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  PanelHeader, SectionTitle, Metric, Chip, Notice, Quiet,
  tableWrapClass, tableClass, thClass, thRightClass, tdClass, trClass,
} from "./components/panel-ui";
import { AdminNav } from "./admin-nav";
import InboxPanel from "./inbox-panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase-client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

interface Stats {
  users: number;
  careers: number;
  universities: number;
  scholarships: number;
  news: number;
  events: number;
  accommodations: number;
  lookingHousing: number;
  lookingRoommate: number;
  propietarios: number;
  discarded: number;
  pendingReports: number;
}

interface User {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  role: string | null;
  is_discarded: boolean | null;
  strikes_count: number | null;
  looking_for_housing: boolean | null;
  looking_for_roommate: boolean | null;
}

/* ─── User Management Panel ─── */

/* ─── Filas que leen los paneles (cliente de Supabase sin tipos generados) ─── */
type AdminUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
  is_discarded: boolean | null;
  self_deleted: boolean | null;
  strikes_count: number | null;
  looking_for_housing: boolean | null;
  looking_for_roommate: boolean | null;
  onboarding_completed: boolean | null;
  gender: string | null;
  comunidad_autonoma: string | null;
  city: string | null;
};
type ReportPerson = { full_name: string | null; email: string | null } | null;
type UserReportRow = {
  id: string;
  status: string;
  context: string;
  reason: string;
  admin_notes: string | null;
  created_at: string;
  reporter: ReportPerson;
  reported: ReportPerson;
};
type AuditLogRow = {
  id: string;
  action: string;
  actor_email: string | null;
  target_table: string | null;
  created_at: string;
  changes: Record<string, unknown> | null;
};
type LeisureSuggestionRow = {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  address: string | null;
  description: string | null;
  status: string;
};

function UserManagementPanel({ readOnly = false }: { readOnly?: boolean }) {
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "housing" | "roommate" | "propietarios" | "analysts" | "discarded">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [strikeUserId, setStrikeUserId] = useState<string | null>(null);
  const [strikeReason, setStrikeReason] = useState("");
  const { act, saving: strikeSaving, error: actionError, isCurrent } = useAdminAction(readOnly);
  const PAGE_SIZE = 15;

  const { data: userRows, loading, error: loadError, reload: fetchUsers } = useAdminData<AdminUserRow[]>(async request => {
    const supabase = createClient();
    let query = supabase
      .from("profiles")
      .select("id, full_name, email, role, created_at, is_discarded, self_deleted, strikes_count, looking_for_housing, looking_for_roommate, onboarding_completed, gender, comunidad_autonoma, city")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search) {
      const term = search.trim().slice(0, 100).replace(/[\u0000-\u001f*]/g, '').replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"');
      if (term) query = query.or(`full_name.ilike."%${term}%",email.ilike."%${term}%"`);
    }

    switch (filter) {
      case "housing":
        query = query.eq("looking_for_housing", true).not("is_discarded", "is", true);
        break;
      case "roommate":
        query = query.eq("looking_for_roommate", true).not("is_discarded", "is", true);
        break;
      case "propietarios":
        query = query.eq("role", "propietario").not("is_discarded", "is", true);
        break;
      case "analysts":
        query = query.eq("role", "analyst").not("is_discarded", "is", true);
        break;
      case "discarded":
        query = query.eq("is_discarded", true);
        break;
      case "all":
      default:
        // Por defecto excluimos los eliminados de la lista de usuarios.
        // Para verlos hay que pasar al filtro "Eliminados".
        query = query.not("is_discarded", "is", true);
        break;
    }

    const { data, error } = await request.query(query);
    if (error) throw new Error('No se pudieron cargar los usuarios. Vuelve a intentarlo.');
    return data ?? [];
  }, JSON.stringify([filter, search, page]), 250);
  const users = userRows ?? [];

  const issueStrike = async (userId: string) => {
    if (!strikeReason.trim()) return;
    await act(async request => {
      if (strikeReason.trim().length > 2000) throw new Error('El motivo debe tener como máximo 2000 caracteres.');
      const { error } = await request.query(createClient().from('user_strikes').insert({ user_id: userId, issued_by: request.owner, reason: strikeReason.trim() }));
      if (error) throw new Error('No se pudo guardar el strike. Actualiza antes de repetirlo.');
      await logManagementAction(request, 'issue_strike', 'user', userId, { reason: strikeReason.trim() });
    }, async () => { setStrikeUserId(null); setStrikeReason(''); await fetchUsers(); });
  };

  // Convertir en analista (solo lectura del panel) o revertir a usuario.
  // La RPC del servidor re-valida que el caller es admin y que el target no
  // es la cuenta admin; esto es solo la puerta de UI.
  const setUserRole = async (userId: string, role: "analyst" | "user", userName: string) => {
    const ok = await confirmDialog({
      title:
        role === "analyst"
          ? `¿Convertir a ${userName} en analista?`
          : `¿Quitar el rol de analista a ${userName}?`,
      description:
        role === "analyst"
          ? "Podrá ver todo el panel de control (usuarios, analytics, moderación) pero no podrá crear, editar ni borrar nada."
          : "Volverá a ser un usuario normal sin acceso al panel.",
      confirmText: role === "analyst" ? "Hacer analista" : "Quitar analista",
    });
    if (!ok || !isCurrent()) return;
    await act(async request => {
      const res = await fetch(`/api/admin/users/${userId}/set-role`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: request.authorization },
        body: JSON.stringify({ role }), signal: request.signal,
      });
      request.check();
      if (!res.ok) throw new Error('No se pudo cambiar el rol. Actualiza antes de repetirlo.');
    }, async () => { toast.success(role === 'analyst' ? 'Ahora es analista' : 'Rol revertido a usuario'); await fetchUsers(); });
  };

  const toggleDiscard = async (userId: string, currentlyDiscarded: boolean) => {
    await act(async request => {
      const { data, error } = await request.query(createClient().from('profiles').update({ is_discarded: !currentlyDiscarded }).eq('id', userId).not('self_deleted', 'is', true).select('id'));
      if (error || data?.length !== 1) throw new Error('La cuenta no está disponible para esta acción. Actualiza la lista.');
      await logManagementAction(request, currentlyDiscarded ? 'restore_user' : 'discard_user', 'user', userId);
    }, fetchUsers);
  };

  const filterButtons = [
    { key: "all" as const, label: "Todos", icon: Users },
    { key: "housing" as const, label: "Buscan Piso", icon: Home },
    { key: "roommate" as const, label: "Buscan Roomie", icon: Users },
    { key: "propietarios" as const, label: "Propietarios", icon: Building2 },
    { key: "analysts" as const, label: "Analistas", icon: Eye },
    { key: "discarded" as const, label: "Eliminados", icon: Ban },
  ];

  return (
    <Card>
      <CardHeader>
        <SectionTitle
          eyebrow="Comunidad"
          title="Usuarios"
          aside={
            <>
              {!readOnly && <UserLookupTool onReconciled={fetchUsers} />}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" strokeWidth={1.75} />
                <Input placeholder="Nombre o email" aria-label="Buscar usuarios" className="w-56 pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
              </div>
            </>
          }
        />
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="group" aria-label="Filtrar usuarios">
          {filterButtons.map(({ key, label, icon: Icon }, i) => (
            <Chip key={key} index={i} active={filter === key} aria-pressed={filter === key} onClick={() => { setFilter(key); setPage(0); }}>
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {label}
            </Chip>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {actionError && <Notice tone="error" className="mb-4">{actionError}</Notice>}
        {loadError ? <Notice tone="error"><span className="mr-3">{loadError}</span><Button size="sm" variant="outline" onClick={fetchUsers}>Reintentar</Button></Notice>
        : loading ? (
          <Quiet role="status">Cargando…</Quiet>
        ) : users.length === 0 ? (
          <Quiet>No hay usuarios</Quiet>
        ) : (
          <>
            <div className={tableWrapClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Usuario</th>
                    <th className={thClass}>Email</th>
                    <th className={thClass}>Rol</th>
                    <th className={thClass}>Strikes</th>
                    <th className={thClass}>Estado</th>
                    <th className={thClass}>Registro</th>
                    <th className={thRightClass}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={`${trClass} ${u.is_discarded ? "opacity-60" : ""}`}>
                      <td className={tdClass}>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[10px]">{u.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="max-w-[160px] truncate text-sm font-medium text-text-primary">{u.full_name || "Sin nombre"}</p>
                            <p className="text-xs text-text-muted">{u.city || u.comunidad_autonoma || ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`${tdClass} max-w-[180px] truncate text-xs text-text-secondary`}>{u.email || "-"}</td>
                      <td className={tdClass}>
                        <Badge variant={u.role === "admin" ? "default" : u.role === "analyst" ? "secondary" : "outline"}>
                          {u.role === "analyst" ? "analista" : u.role || "user"}
                        </Badge>
                      </td>
                      <td className={`${tdClass} tabular`}>
                        {(u.strikes_count || 0) > 0 ? (
                          <Badge variant="destructive">{u.strikes_count} strike{(u.strikes_count ?? 0) > 1 ? "s" : ""}</Badge>
                        ) : (
                          <span className="text-xs text-text-muted">0</span>
                        )}
                      </td>
                      <td className={tdClass}>
                        {u.is_discarded ? (
                          <Badge variant="destructive">Eliminado</Badge>
                        ) : u.onboarding_completed ? (
                          <Badge variant="success">Activo</Badge>
                        ) : (
                          <Badge variant="outline">Pendiente</Badge>
                        )}
                      </td>
                      <td className={`${tdClass} tabular whitespace-nowrap text-xs text-text-muted`}>{new Date(u.created_at).toLocaleDateString("es-ES")}</td>
                      <td className={`${tdClass} text-right`}>
                        {readOnly ? (
                          <span className="text-xs text-text-muted">solo lectura</span>
                        ) : (
                        <div className="flex justify-end gap-0.5">
                          {/* Conversión a/desde analista: nunca sobre admin ni gestores de universidad */}
                          {u.role !== "admin" && u.role !== "university_admin" && !u.is_discarded && (
                            u.role === "analyst" ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={strikeSaving}
                                onClick={() => setUserRole(u.id, "user", u.full_name || u.email || "este usuario")}
                                title="Quitar rol de analista"
                                aria-label="Quitar rol de analista"
                              >
                                <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={strikeSaving}
                                onClick={() => setUserRole(u.id, "analyst", u.full_name || u.email || "este usuario")}
                                title="Hacer analista (ve el panel en solo lectura)"
                                aria-label="Hacer analista"
                              >
                                <Eye className="h-4 w-4" strokeWidth={1.75} />
                              </Button>
                            )
                          )}
                          {u.role !== 'admin' && <Button variant="ghost" size="icon-sm" className="text-warning hover:text-warning" disabled={strikeSaving} onClick={() => { setStrikeUserId(u.id); setStrikeReason(""); }} title="Dar strike" aria-label="Dar strike"><AlertTriangle className="h-4 w-4" strokeWidth={1.75} /></Button>}
                          {u.role !== "admin" && !u.self_deleted && (
                          <Button variant="ghost" size="icon-sm" className={u.is_discarded ? "text-success hover:text-success" : "text-error hover:text-error"} disabled={strikeSaving} onClick={() => toggleDiscard(u.id, !!u.is_discarded)} title={u.is_discarded ? "Restaurar" : "Mandar a eliminados"} aria-label={u.is_discarded ? "Restaurar" : "Mandar a eliminados"}>
                            {u.is_discarded ? <CheckCircle className="h-4 w-4" strokeWidth={1.75} /> : <Ban className="h-4 w-4" strokeWidth={1.75} />}
                          </Button>
                          )}
                          {u.is_discarded && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-error hover:text-error"
                              disabled={strikeSaving}
                              onClick={async () => {
                                const ok = await confirmDialog({
                                  title: `¿Eliminar permanentemente a ${u.full_name || u.email}?`,
                                  description: "Esta acción es irreversible. El usuario y todos sus datos se borrarán para siempre.",
                                  confirmText: "Eliminar para siempre",
                                  variant: "danger",
                                });
                                if (!ok || !isCurrent()) return;
                                await act(async request => {
                                  const res = await fetch(`/api/admin/users/${u.id}/hard-delete`, { method: 'POST', headers: { Authorization: request.authorization }, signal: request.signal });
                                  request.check();
                                  if (!res.ok) throw new Error('No se pudo eliminar la cuenta. Actualiza antes de repetirlo.');
                                }, fetchUsers);
                              }}
                              title="Eliminar permanentemente"
                              aria-label="Eliminar permanentemente"
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                            </Button>
                          )}
                        </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Formulario de strike, en línea bajo la tabla */}
            {strikeUserId && (
              <div className="animate-scale-in mt-4 rounded-xl border border-border bg-bg-secondary/60 p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary"><AlertTriangle className="h-4 w-4 text-warning" strokeWidth={1.75} /> Dar strike a usuario</h4>
                <p className="mb-3 mt-1 text-xs text-text-muted">Usuario: {users.find((u) => u.id === strikeUserId)?.full_name || strikeUserId}</p>
                <Field id="strike-reason" label="Motivo del strike" className="mb-3">
                  <Input id="strike-reason" placeholder="Explica el motivo" value={strikeReason} onChange={(e) => setStrikeReason(e.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" variant="dark" disabled={strikeSaving || !strikeReason.trim()} loading={strikeSaving} onClick={() => issueStrike(strikeUserId)}>
                    {strikeSaving ? "Guardando…" : "Confirmar strike"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStrikeUserId(null)}>Cancelar</Button>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="tabular text-xs text-text-muted">Página {page + 1}</span>
              <Button size="sm" variant="outline" disabled={users.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Reports Queue ─── */
function ReportsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [statusFilter, setStatusFilter] = useState<"pending" | "reviewed" | "dismissed" | "all">("pending");
  const { act, saving, error: actionError } = useAdminAction(readOnly);

  const { data: reports, loading, error: loadError, reload: fetchReports } = useAdminData<UserReportRow[]>(async request => {
    const supabase = createClient();
    let query = supabase
      .from("user_reports")
      .select("*, reporter:profiles!user_reports_reporter_id_fkey(full_name, email), reported:profiles!user_reports_reported_user_id_fkey(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(30);

    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data, error } = await request.query(query);
    if (error) throw new Error('No se pudieron cargar los reportes. Vuelve a intentarlo.');
    return data ?? [];
  }, statusFilter);

  const updateReport = (reportId: string, status: 'reviewed' | 'dismissed', adminNotes?: string) => act(async request => {
    const { data, error } = await request.query(createClient().from("user_reports").update({
      status,
      admin_notes: adminNotes || null,
      reviewed_by: request.owner,
      reviewed_at: new Date().toISOString(),
    }).eq('id', reportId).eq('status', 'pending').select('id'));
    if (error || data?.length !== 1) throw new Error('El reporte ya cambió o no se pudo guardar. Actualiza la lista.');
    await logManagementAction(request, `report_${status}`, 'report', reportId, { admin_notes: adminNotes });
  }, fetchReports);

  const issueStrikeFromReport = (reportId: string) => act(async request => {
    const { data, error } = await request.query(createClient().rpc('issue_strike_from_report', { p_report_id: reportId }));
    if (error) throw new Error(adminOperationError(error));
    if (!isReportStrikeResult(data, reportId)) throw new Error('No se pudo confirmar el strike. Actualiza el reporte antes de repetirlo.');
  }, fetchReports);

  const contextLabels: Record<string, string> = {
    profile: "Perfil", chat: "Chat", comment: "Comentario", accommodation: "Alojamiento", other: "Otro",
  };

  return (
    <Card>
      <CardHeader>
        <SectionTitle eyebrow="Comunidad" title="Reportes" description="Cola de reportes entre usuarios. Cada decisión queda en la auditoría." />
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="group" aria-label="Estado de los reportes">
          {(["pending", "reviewed", "dismissed", "all"] as const).map((s, i) => (
            <Chip key={s} index={i} active={statusFilter === s} aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s === "pending" ? "Pendientes" : s === "reviewed" ? "Revisados" : s === "dismissed" ? "Descartados" : "Todos"}
            </Chip>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {actionError && <Notice tone="error" className="mb-4">{actionError}</Notice>}
        {loadError ? <Notice tone="error"><span className="mr-3">{loadError}</span><Button size="sm" variant="outline" onClick={fetchReports}>Reintentar</Button></Notice>
        : loading ? (
          <Quiet role="status">Cargando…</Quiet>
        ) : !reports?.length ? (
          <Quiet>No hay reportes {statusFilter !== "all" ? statusFilter === "pending" ? "pendientes" : "" : ""}</Quiet>
        ) : (
          <ul className="divide-y divide-border-light">
            {reports.map((r, i) => (
              <li key={r.id} style={{ "--i": i } as CSSProperties} className="animate-list-in py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{contextLabels[r.context] || r.context}</Badge>
                      <Badge variant={r.status === "pending" ? "warning" : r.status === "reviewed" ? "success" : "secondary"}>
                        {r.status === "pending" ? "Pendiente" : r.status === "reviewed" ? "Revisado" : "Descartado"}
                      </Badge>
                      <span className="tabular text-xs text-text-muted">{new Date(r.created_at).toLocaleString("es-ES")}</span>
                    </div>
                    <p className="mb-1 text-sm text-text-primary">
                      <span className="font-semibold">{r.reporter?.full_name || "Anónimo"}</span>
                      <span className="text-text-muted"> reportó a </span>
                      <span className="font-semibold">{r.reported?.full_name || "Usuario"}</span>
                    </p>
                    <p className="text-sm text-text-secondary">{r.reason}</p>
                    {r.admin_notes && <p className="mt-1 text-xs italic text-text-muted">Admin: {r.admin_notes}</p>}
                  </div>
                  {r.status === "pending" && !readOnly && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => issueStrikeFromReport(r.id)} title="Dar strike">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" strokeWidth={1.75} /> Strike
                      </Button>
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => updateReport(r.id, "reviewed")} title="Marcar revisado">
                        <CheckCircle className="h-3.5 w-3.5 text-success" strokeWidth={1.75} /> Revisado
                      </Button>
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => updateReport(r.id, "dismissed")} title="Descartar">
                        <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} /> Descartar
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Audit Log ─── */
function AuditLogPanel() {
  const { data: logs, loading, error, reload } = useAdminData<AuditLogRow[]>(async request => {
    const { data, error } = await request.query(createClient().from('admin_actions').select('*').order('created_at', { ascending: false }).limit(50));
    if (error) throw new Error('No se pudo cargar la auditoría. Vuelve a intentarlo.');
    return data ?? [];
  });

  const actionLabels: Record<string, string> = {
    issue_strike: "Strike emitido",
    discard_user: "Usuario descartado",
    restore_user: "Usuario restaurado",
    report_reviewed: "Reporte revisado",
    report_dismissed: "Reporte descartado",
    create_propietario: "Propietario creado",
    create_analyst: "Analista creado",
    grant_analyst: "Rol analista concedido",
    revoke_analyst: "Rol analista retirado",
    hard_delete_user: "Borrado permanente",
    issue_strike_from_report: 'Strike y reporte revisados',
    resolve_existing_report_strike: 'Revisión del strike anterior completada',
    approve_leisure_suggestion: 'Sugerencia aprobada y local creado',
    reject_leisure_suggestion: 'Sugerencia rechazada',
    restore_discarded_record: 'Ficha restaurada',
    delete_catalogue_record: 'Ficha enviada a la papelera',
    create_catalogue_record: 'Ficha creada',
    update_catalogue_record: 'Ficha actualizada',
    set_crush_party: 'Control de la fiesta actualizado',
    hide_crush_party_post: 'Mensaje de la fiesta ocultado',
    // Filas del trigger automático _log_admin_change (042)
    insert: "Creación",
    update: "Edición",
    delete: "Borrado",
  };

  return (
    <Card>
      <CardHeader>
        <SectionTitle eyebrow="Comunidad" title="Registro de auditoría" description="Las 50 acciones más recientes." />
      </CardHeader>
      <CardContent>
        {error ? <Notice tone="error"><span className="mr-3">{error}</span><Button size="sm" variant="outline" onClick={reload}>Reintentar</Button></Notice>
        : loading ? (
          <Quiet role="status">Cargando…</Quiet>
        ) : !logs?.length ? (
          <Quiet>No hay registros</Quiet>
        ) : (
          <ol className="divide-y divide-border-light">
            {logs.map((log, i) => (
              <li key={log.id} style={{ "--i": i } as CSSProperties} className="animate-list-in flex flex-wrap items-start gap-3 py-3 transition-colors">
                <Clock className="mt-1 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">
                    <span className="font-semibold">{log.actor_email || "Admin"}</span>
                    <span className="text-text-muted"> · </span>
                    <span>{actionLabels[log.action] || log.action}</span>
                    {log.target_table && <span className="text-text-muted"> · {log.target_table}</span>}
                  </p>
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <details className="text-xs text-text-muted"><summary className="cursor-pointer py-1.5 font-medium hover:text-text-primary">Ver cambios registrados</summary><pre className="whitespace-pre-wrap break-all rounded-lg bg-bg-secondary p-3">{JSON.stringify(log.changes, null, 2)}</pre></details>
                  )}
                </div>
                <span className="tabular shrink-0 text-xs text-text-muted">{new Date(log.created_at).toLocaleString("es-ES")}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Create team account (propietario o analista) ─── */
function CreateTeamAccountPanel() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"propietario" | "analyst">("propietario");
  const { act, saving: loading, error } = useAdminAction();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleCreate = async () => {
    if (!email.trim() || !name.trim()) return;
    await act(async request => {
      setResult(null);
      const res = await fetch("/api/admin/create-propietario", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: request.authorization },
        signal: request.signal,
        body: JSON.stringify({ email: email.trim(), name: name.trim(), role }),
      });
      const data = await res.json();
      request.check();
      if (res.ok) {
        setResult({ ok: true, message: data.message || "Cuenta creada correctamente" });
        setEmail("");
        setName("");
      } else {
        throw new Error(data.error || 'No se pudo crear la cuenta. Comprueba los datos.');
      }
    });
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <SectionTitle
          eyebrow="Equipo"
          title="Crear cuenta de equipo"
          description={<>Una cuenta con rol <strong className="text-text-primary">propietario</strong> (publica pisos) o <strong className="text-text-primary">analista</strong> (consulta el panel sin editar nada). Tras crearla, la persona entra con &quot;He olvidado mi contraseña&quot;.</>}
        />
      </CardHeader>
      <CardContent>
        <fieldset disabled={loading}>
        <div className="mb-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Rol de la cuenta">
          {([
            { value: "propietario", label: "Propietario", icon: Building2, hint: "Cuenta para publicar y gestionar alojamientos." },
            { value: "analyst", label: "Analista", icon: Eye, hint: "Consulta usuarios, estadísticas, reportes y auditoría." },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={role === opt.value}
              onClick={() => setRole(opt.value)}
              className={`rounded-xl border p-4 text-left transition-[border-color,background-color] duration-200 ${role === opt.value ? "border-text-primary bg-bg-secondary" : "border-border hover:border-text-primary/40"}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-text-primary"><opt.icon className={`h-4 w-4 ${role === opt.value ? "text-violet" : "text-text-muted"}`} strokeWidth={1.75} /> {opt.label}</span>
              <span className="mt-1 block text-xs text-text-muted">{opt.hint}</span>
            </button>
          ))}
        </div>
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <Field id="team-account-name" label="Nombre completo">
            <Input id="team-account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la persona" />
          </Field>
          <Field id="team-account-email" label="Email">
            <Input id="team-account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.com" />
          </Field>
        </div>
        {error && <Notice tone="error" className="mb-4">{error}</Notice>}
        {result && <Notice tone={result.ok ? "success" : "error"} className="mb-4">{result.message}</Notice>}
        <Button variant="dark" disabled={loading || !email.trim() || !name.trim()} loading={loading} onClick={handleCreate}>
          {!loading && <UserPlus className="h-4 w-4" strokeWidth={1.75} />}
          {loading ? "Creando…" : role === "analyst" ? "Crear analista" : "Crear propietario"}
        </Button>
        </fieldset>
      </CardContent>
    </Card>
  );
}

/* ─── Main Dashboard ─── */
// Inventario en dos filas de seis: comunidad primero, catálogo después.
const statCards = [
  { key: "users", label: "Usuarios" },
  { key: "lookingHousing", label: "Buscan piso" },
  { key: "lookingRoommate", label: "Buscan roomie" },
  { key: "propietarios", label: "Propietarios" },
  { key: "pendingReports", label: "Reportes pendientes" },
  { key: "discarded", label: "Cuentas descartadas" },
  { key: "careers", label: "Carreras" },
  { key: "universities", label: "Universidades" },
  { key: "scholarships", label: "Becas" },
  { key: "news", label: "Noticias" },
  { key: "events", label: "Eventos" },
  { key: "accommodations", label: "Alojamientos" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// AutofillLeisureImagesPanel — one-click batch autofill for leisure_spots images
// ─────────────────────────────────────────────────────────────────────────────
function AutofillLeisureImagesPanel() {
  const [running, setRunning] = useState(false);
  const [, setStop] = useState(false);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [lastMsg, setLastMsg] = useState<string>("");
  const [missingCount, setMissingCount] = useState<number | null>(null);

  const loadCount = useCallback(async () => {
    const supabase = createClient();
    const { count } = await supabase
      .from("leisure_spots")
      .select("id", { count: "exact", head: true })
      .or("image_url.is.null,image_url.eq.");
    setMissingCount(count ?? 0);
    setRemaining(count ?? 0);
  }, []);

  useEffect(() => { loadCount(); }, [loadCount]);

  const run = async () => {
    setRunning(true);
    setStop(false);
    setTotalUpdated(0);
    setTotalFailed(0);
    setLastMsg("Iniciando...");
    let shouldStop = false;
    let safety = 200; // max 200 batches (~16 000 rows)
    while (!shouldStop && safety-- > 0) {
      try {
        const res = await fetch("/api/admin/autofill-leisure-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch: 80 }),
        });
        const json = await res.json();
        if (!res.ok) {
          setLastMsg("Error: " + (json?.error || res.statusText));
          break;
        }
        setTotalUpdated((n) => n + (json.updated || 0));
        setTotalFailed((n) => n + (json.failed?.length || 0));
        setRemaining(json.remaining ?? 0);
        setLastMsg(`Lote: ${json.updated}/${json.processed} actualizados · Pendientes: ${json.remaining}`);
        if (json.done || (json.processed === 0)) break;
        // small breather for Unsplash rate limits
        await new Promise((r) => setTimeout(r, 300));
      } catch (e: unknown) {
        setLastMsg("Error de red: " + (e instanceof Error ? e.message : String(e)));
        break;
      }
      setStop((s) => { shouldStop = s; return s; });
    }
    setRunning(false);
    await loadCount();
  };

  const runBroken = async () => {
    setRunning(true);
    setStop(false);
    setTotalUpdated(0);
    setTotalFailed(0);
    setLastMsg("Revalidando imágenes existentes...");
    let shouldStop = false;
    let safety = 200;
    while (!shouldStop && safety-- > 0) {
      try {
        const res = await fetch("/api/admin/autofill-leisure-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch: 30, mode: "broken" }),
        });
        const json = await res.json();
        if (!res.ok) { setLastMsg("Error: " + (json?.error || res.statusText)); break; }
        setTotalUpdated((n) => n + (json.updated || 0));
        setTotalFailed((n) => n + (json.failed?.length || 0));
        setLastMsg(`Revisado lote de ${json.processed}: ${json.updated} reemplazadas, ${json.skipped ?? 0} OK`);
        if (json.done || json.processed === 0) break;
        await new Promise((r) => setTimeout(r, 400));
      } catch (e: unknown) {
        setLastMsg("Error de red: " + (e instanceof Error ? e.message : String(e)));
        break;
      }
      setStop((s) => { shouldStop = s; return s; });
    }
    setRunning(false);
    await loadCount();
  };

  const progressPct = missingCount && missingCount > 0
    ? Math.round(((missingCount - (remaining ?? missingCount)) / missingCount) * 100)
    : 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <SectionTitle
          as="h3"
          eyebrow="Herramienta"
          title="Imágenes de ocio"
          description={<>Busca una imagen real para cada zona de ocio sin foto (Unsplash con respaldo Picsum), valida que carga y la guarda.{missingCount !== null && <> <span className="tabular font-semibold text-text-primary">Pendientes: {missingCount.toLocaleString("es")}</span></>}</>}
          aside={<ImageIcon className="h-5 w-5 text-text-muted" strokeWidth={1.75} />}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="dark" size="sm" onClick={run} disabled={running || (missingCount ?? 0) === 0} loading={running}>
            {running ? "Procesando…" : missingCount === 0 ? "Todo listo" : "Rellenar ahora"}
          </Button>
          <Button variant="outline" size="sm" onClick={runBroken} disabled={running}>
            Revalidar rotas
          </Button>
          {running && (
            <Button variant="outline" size="sm" onClick={() => setStop(true)}>Parar</Button>
          )}
          <Button variant="ghost" size="sm" onClick={loadCount} disabled={running}><RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} /> Recuento</Button>
        </div>
        {running && missingCount !== null && missingCount > 0 && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-bg-tertiary" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-violet transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        )}
        {(running || totalUpdated > 0) && (
          <div className="tabular space-y-0.5 text-xs text-text-muted">
            <div>Actualizadas: <span className="font-semibold text-text-primary">{totalUpdated}</span> · Fallidas: <span className={`font-semibold ${totalFailed > 0 ? "text-warning" : "text-text-primary"}`}>{totalFailed}</span></div>
            {lastMsg && <div>{lastMsg}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LeisureSuggestionsPanel — approve/reject venue suggestions from users
// ─────────────────────────────────────────────────────────────────────────────
function LeisureSuggestionsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [status, setStatus] = useState('pending');
  const { data: items, loading, error, reload } = useAdminData<LeisureSuggestionRow[]>(async request => {
    let query = createClient().from('leisure_spot_suggestions').select('*').order('created_at', { ascending: false }).limit(100);
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await request.query(query);
    if (error) throw new Error('No se pudieron cargar las sugerencias. Vuelve a intentarlo.');
    return data ?? [];
  }, status);
  const { act, saving, error: actionError } = useAdminAction(readOnly);
  const approve = (id: string) => act(async request => {
    const { data, error } = await request.query(createClient().rpc('approve_leisure_suggestion', { p_suggestion_id: id, p_admin_note: 'Aprobado por admin' }));
    if (error) throw new Error(adminOperationError(error));
    if (!isUuidResult(data)) throw new Error('No se pudo confirmar el local creado. Actualiza antes de repetir la aprobación.');
  }, reload);
  const reject = (id: string) => act(async request => {
    const { data, error } = await request.query(createClient().from('leisure_spot_suggestions').update({ status: 'rejected' }).eq('id', id).eq('status', 'pending').select('id'));
    if (error) throw new Error('No se pudo rechazar la sugerencia. Vuelve a intentarlo.');
    if (data?.length !== 1) throw new Error('La sugerencia ya cambió o no está disponible. Actualiza la lista.');
    await logManagementAction(request, 'reject_leisure_suggestion', 'leisure_spot_suggestions', id);
  }, reload);

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge variant="success">Aprobada</Badge>;
    if (status === "rejected") return <Badge variant="destructive">Rechazada</Badge>;
    return <Badge variant="warning">Pendiente</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <SectionTitle eyebrow="Gestión" title="Sugerencias de zonas de ocio" description="Locales propuestos por la comunidad. Aprobar crea la ficha en el catálogo." />
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="tablist" aria-label="Estado de las sugerencias">
          {['pending', 'approved', 'rejected', 'all'].map((value, i) => <Chip key={value} index={i} role="tab" aria-selected={status === value} active={status === value} onClick={() => setStatus(value)}>{({ pending: 'Pendientes', approved: 'Aprobadas', rejected: 'Rechazadas', all: 'Todas' } as Record<string, string>)[value]}</Chip>)}
        </div>
      </CardHeader>
      <CardContent>
        {actionError && <Notice tone="error" className="mb-4">{actionError}</Notice>}
        {error ? <Notice tone="error"><span className="mr-3">{error}</span><Button size="sm" variant="outline" onClick={reload}>Reintentar</Button></Notice>
        : loading ? <Quiet role="status">Cargando…</Quiet> : !items?.length ? (
          <Quiet>No hay sugerencias con este estado.</Quiet>
        ) : (
          <ul className="divide-y divide-border-light">
            {items.map((item, i) => (
              <li key={item.id} style={{ "--i": i } as CSSProperties} className="animate-list-in flex flex-col items-start gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="break-words font-heading font-semibold text-text-primary">{item.name}</span>
                    {statusBadge(item.status)}
                  </div>
                  <p className="text-sm text-text-muted">{item.category} · {item.city}</p>
                  {item.address && <p className="mt-0.5 text-xs text-text-muted">{item.address}</p>}
                  {item.description && <p className="mt-1 text-xs text-text-muted">{item.description}</p>}
                </div>
                {item.status === "pending" && !readOnly && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" disabled={saving} variant="outline" onClick={() => approve(item.id)}>
                      <CheckCircle className="h-3.5 w-3.5 text-success" strokeWidth={1.75} /> Aprobar
                    </Button>
                    <Button size="sm" disabled={saving} variant="ghost" onClick={() => reject(item.id)}>
                      <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} /> Rechazar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {items?.length === 100 && <p className="mt-3 text-xs text-text-muted">Se muestran las 100 sugerencias más recientes con este estado.</p>}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DiscardedRecordsPanel — view and restore soft-deleted records
// ─────────────────────────────────────────────────────────────────────────────
type DiscardedRecordRow = {
  id: string;
  original_id: string;
  original_table: string;
  deleted_at: string | null;
  data: Record<string, unknown> | null;
};
type TrashUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  discarded_at: string | null;
  self_deleted: boolean | null;
  role: string | null;
};
type TrashItem = {
  id: string;          // unique key (record.id or user.id)
  label: string;       // display name
  badge: string;       // badge text (e.g. "alojamientos" or "Usuario")
  deletedAt: string | null;
  selfDeleted?: boolean;
} & ({ kind: "record"; raw: DiscardedRecordRow } | { kind: "user"; raw: TrashUserRow });

const textOr = (...values: unknown[]): string => {
  for (const v of values) if (typeof v === "string" && v) return v;
  return "";
};

// Formatea cualquier valor del perfil para el desglose de la papelera.
function fmtTrashVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "Sin dato";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : "Sin dato";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function DiscardedRecordsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const confirmDialog = useConfirm();
  const { run, isCurrent } = useAdminRequest();
  const { act, saving, error: actionError } = useAdminAction(readOnly);
  // Desglose completo del perfil/registro al pulsar "Info".
  const [detail, setDetail] = useState<{ item: TrashItem; data: Record<string, unknown> | null } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRevision = useRef(0);
  const closeDetail = () => { detailRevision.current++; setDetail(null); setDetailLoading(false); };
  const detailAvatar = typeof detail?.data?.avatar_url === "string" && detail.data.avatar_url ? detail.data.avatar_url : null;
  const detailPhotos = Array.isArray(detail?.data?.photos) ? (detail.data.photos as unknown[]).filter((p): p is string => typeof p === "string") : [];

  const { data: items, loading, error, reload: load } = useAdminData<TrashItem[]>(async request => {
    const supabase = createClient();

    const [recordResult, userResult] = await Promise.all([
      request.query(supabase
        .from("discarded_records")
        .select("*")
        .is("restored_at", null)
        .order("deleted_at", { ascending: false })
        .limit(50)),
      request.query(supabase
        .from("profiles")
        .select("id, full_name, email, discarded_at, self_deleted, role")
        .eq("is_discarded", true)
        .order("discarded_at", { ascending: false })
        .limit(50)),
    ]);
    if (recordResult.error || userResult.error) throw new Error('No se pudo cargar toda la papelera. Vuelve a intentarlo.');
    const records = recordResult.data, users = userResult.data;

    const recordItems: TrashItem[] = ((records ?? []) as DiscardedRecordRow[]).map((r): TrashItem => ({
      kind: "record",
      id: r.id,
      label: textOr(r.data?.name, r.data?.title, r.data?.full_name, r.original_id),
      badge: r.original_table,
      deletedAt: r.deleted_at,
      raw: r,
    }));

    const userItems: TrashItem[] = ((users ?? []) as TrashUserRow[]).map((u): TrashItem => ({
      kind: "user",
      id: u.id,
      label: u.full_name || u.email || u.id,
      badge: "Usuario",
      deletedAt: u.discarded_at,
      selfDeleted: !!u.self_deleted,
      raw: u,
    }));

    const merged = [...recordItems, ...userItems].sort((a, b) =>
      (b.deletedAt || "").localeCompare(a.deletedAt || "")
    );
    return merged;
  });

  const restoreRecord = async (item: TrashItem) => {
    const ok = await confirmDialog({ title: `¿Restaurar ${item.label}?`, description: 'Se recuperará esta ficha. Las relaciones u otros contenidos eliminados junto a ella no se recuperan con esta operación.', confirmText: 'Restaurar ficha' });
    if (!ok || !isCurrent()) return;
    await act(async request => {
      const { data, error } = await request.query(createClient().rpc('restore_discarded_record', { p_record_id: item.id }));
      if (error) throw new Error(adminOperationError(error));
      if (!isRestorationResult(data)) throw new Error('No se pudo confirmar la restauración. Actualiza la papelera antes de repetirla.');
    }, load);
  };

  const restoreUser = (item: TrashItem) => act(async request => {
    if (item.selfDeleted) throw new Error('Esta cuenta fue eliminada por su titular.');
    const { data, error } = await request.query(createClient().from('profiles').update({ is_discarded: false }).eq('id', item.id).eq('is_discarded', true).not('self_deleted', 'is', true).select('id'));
    if (error || data?.length !== 1) throw new Error('No se pudo restaurar esta cuenta. Actualiza la lista.');
    await logManagementAction(request, 'restore_user', 'user', item.id);
  }, load);

  const hardDeleteUser = async (item: TrashItem) => {
    const ok = await confirmDialog({
      title: `¿Eliminar permanentemente a ${item.label}?`,
      description: "Esta acción es irreversible. El usuario y todos sus datos se borrarán para siempre.",
      confirmText: "Eliminar para siempre",
      variant: "danger",
    });
    if (!ok || !isCurrent()) return;
    await act(async request => {
      const res = await fetch(`/api/admin/users/${item.id}/hard-delete`, { method: 'POST', headers: { Authorization: request.authorization }, signal: request.signal });
      request.check();
      if (!res.ok) throw new Error('No se pudo eliminar la cuenta. Actualiza antes de repetirlo.');
    }, load);
  };

  // Abre el desglose completo. Para un usuario, trae TODO el perfil de profiles
  // (el borrado/auto-borrado solo marca is_discarded, no elimina los datos).
  // Para un registro genérico, usa el backup JSONB guardado en discarded_records.
  const openDetail = async (item: TrashItem) => {
    const version = ++detailRevision.current;
    if (item.kind === "record") {
      setDetail({ item, data: item.raw.data ?? item.raw });
      return;
    }
    setDetail({ item, data: null });
    setDetailLoading(true);
    try {
      const profile = await run(async request => {
        const { data, error } = await request.query(createClient().from('profiles').select('*').eq('id', item.id)).single();
        if (error || !data) throw new Error('No se pudo cargar el detalle de esta cuenta.');
        return data;
      });
      if (isCurrent() && version === detailRevision.current) setDetail({ item, data: profile });
    } catch (cause) {
      if (isCurrent() && version === detailRevision.current) setDetail({ item, data: { error: cause instanceof Error ? cause.message : 'No se pudo cargar el detalle.' } });
    } finally {
      if (isCurrent() && version === detailRevision.current) setDetailLoading(false);
    }
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-text-muted" />
          Papelera: registros eliminados
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-muted mb-4">Las restauraciones recuperan la ficha guardada. Algunos registros necesitan revisar sus relaciones, publicaciones o pagos.</p>
        {actionError && <Notice tone="error" className="mb-4">{actionError}</Notice>}
        {error ? <Notice tone="error" role="alert"><span className="mr-3">{error}</span><Button variant="outline" size="sm" onClick={load}>Reintentar</Button></Notice>
        : loading ? (
          <Quiet role="status">Cargando…</Quiet>
        ) : !items?.length ? (
          <Quiet>La papelera está vacía</Quiet>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={`${item.kind}-${item.id}`} className="flex flex-col sm:flex-row items-start gap-4 p-4 border border-border rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant={item.kind === "user" ? "default" : "outline"}>
                      {item.kind === "user" ? "Usuario" : item.badge}
                    </Badge>
                    <span className="text-sm font-medium text-foreground break-words">{item.label}</span>
                    {item.kind === "user" && item.selfDeleted && (
                      <Badge variant="secondary" className="text-[10px]">Auto-eliminada</Badge>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">
                    Eliminado el {item.deletedAt ? new Date(item.deletedAt).toLocaleDateString("es-ES") : "Sin dato"}
                  </p>
                  {item.kind === 'record' && restorationHint(item.raw.original_table, item.raw.data) && <p className="text-xs text-text-muted mt-2">{restorationHint(item.raw.original_table, item.raw.data)}</p>}
                </div>
                {item.kind === "record" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openDetail(item)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Info
                    </Button>
                    {!readOnly && !restorationHint(item.raw.original_table, item.raw.data) && (
                      <Button disabled={saving} size="sm" variant="outline" onClick={() => restoreRecord(item)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
                      </Button>
                    )}
                  </div>
                )}
                {item.kind === "user" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openDetail(item)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Info
                    </Button>
                    {!readOnly && (
                      <>
                        {!item.selfDeleted && <Button disabled={saving} size="sm" variant="outline" onClick={() => restoreUser(item)}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
                        </Button>}
                        <Button disabled={saving} size="sm" variant="outline" className="text-error hover:text-error" onClick={() => hardDeleteUser(item)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Borrar
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    {detail && (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" onClick={closeDetail}>
        <div role="dialog" aria-modal="true" aria-label="Detalle del registro eliminado" className="animate-dropdown max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-bg-primary p-6 text-text-primary shadow-float" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate">{detail.item.label}</h2>
              <p className="text-sm text-text-muted">
                {detail.item.kind === "user"
                  ? `Perfil completo del usuario ${detail.item.selfDeleted ? "auto-eliminado" : "eliminado"}`
                  : `Registro eliminado · ${detail.item.badge}`}
              </p>
            </div>
            <button aria-label="Cerrar detalle" onClick={closeDetail} className="p-3 rounded hover:bg-bg-secondary shrink-0"><X className="h-5 w-5" /></button>
          </div>
          {detailLoading || detail.data === null ? (
            <p className="text-sm text-text-muted py-8 text-center">Cargando…</p>
          ) : detail.data?.error ? (
            <p className="py-8 text-center text-sm text-error">{String(detail.data.error)}</p>
          ) : (
            <>
              {(detailAvatar || detailPhotos.length > 0) && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {detailAvatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detailAvatar} alt="avatar" className="h-16 w-16 rounded-full object-cover border border-border-light" />
                  )}
                  {detailPhotos.map((p, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={p} alt={`foto ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-border-light" />
                  ))}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-x-6">
                {Object.entries(detail.data).map(([k, v]) => (
                  <div key={k} className="flex flex-col border-b border-border-light/50 py-1.5 min-w-0">
                    <span className="text-[10px] uppercase tracking-wide text-text-muted">{k}</span>
                    <span className="text-sm break-words">{fmtTrashVal(v)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}


function AdminDashboardInner({
  stats,
  recentUsers,
  readOnly = false,
}: {
  stats: Stats;
  viewerId: string;
  recentUsers: User[];
  /** true cuando entra un analista: todo visible, nada editable */
  readOnly?: boolean;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [liveStats, setLiveStats] = useState(stats);
  const [statsError, setStatsError] = useState('');
  const { run, isCurrent } = useAdminRequest();

  // La sección viaja en la URL (?tab=usuarios) para que se pueda enlazar y
  // sobreviva a un refresco. Se escribe con history.replaceState en vez de
  // router.replace a propósito: la página es force-dynamic y router.replace
  // dispararía una recarga del servidor entera en cada clic de pestaña.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl && ['overview', 'users', 'inbox', 'reports', 'audit', 'propietario', 'careers', 'universities', 'scholarships', 'news', 'events', 'accommodations', 'leisure', 'suggestions', 'discarded'].includes(fromUrl)) setActiveTab(fromUrl);
  }, []);

  const selectTab = useCallback((value: string) => {
    setActiveTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url.toString());
  }, []);

  // Supabase Realtime for stats updates
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let revision = 0;
    let controller: AbortController | undefined;
    const refresh = () => {
      clearTimeout(timer);
      const version = ++revision;
      controller?.abort();
      timer = setTimeout(async () => {
        controller = new AbortController();
        try {
          const next = await run(request => readManagementCounts(supabase, request), { signal: controller.signal });
          if (isCurrent() && version === revision) { setLiveStats(next); setStatsError(''); }
        } catch {
          if (isCurrent() && version === revision) setStatsError('No se ha podido actualizar el inventario. Se conservan las últimas cifras comprobadas.');
        }
      }, 500);
    };
    let channel = supabase.channel('admin-realtime');
    for (const table of ['profiles', 'user_reports', 'careers', 'universities', 'scholarships', 'news', 'events', 'accommodations']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    }
    channel.subscribe();
    return () => { revision++; clearTimeout(timer); controller?.abort(); void supabase.removeChannel(channel); };
  }, [run, isCurrent]);

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <PanelHeader
          eyebrow={readOnly ? "Panel · analista, solo lectura" : "Panel de administración"}
          title="Comunidad, catálogo y decisiones."
          description={readOnly ? "Consulta de comunidad, catálogo y análisis. Todo visible, nada editable." : "Lo que pasa en Franky hoy, dónde actuar y qué está pendiente."}
          actions={
            <>
              <Button asChild variant="outline" size="sm"><Link href="/admin/fomo"><Shield className="h-4 w-4" strokeWidth={1.75} /> Moderación FOMO</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/admin/crush"><Heart className="h-4 w-4" strokeWidth={1.75} /> Moderación Crush</Link></Button>
              <Button asChild variant="dark" size="sm"><Link href="/admin/analytics"><BarChart3 className="h-4 w-4" strokeWidth={1.75} /> Analytics</Link></Button>
              {!readOnly && <Button asChild variant="outline" size="sm"><Link href="/admin/espacios">Organizaciones</Link></Button>}
              {!readOnly && <Button asChild variant="outline" size="sm"><Link href="/admin/crecimiento">Crecimiento</Link></Button>}
              {!readOnly && <Button asChild variant="outline" size="sm"><Link href="/admin/card">Franky Card</Link></Button>}
              {!readOnly && <Button asChild variant="outline" size="sm"><Link href="/admin/demos">Cuentas de demostración</Link></Button>}
              {!readOnly && <Button asChild variant="outline" size="sm"><Link href="/admin/devoluciones">Revisión de devoluciones</Link></Button>}
              {!readOnly && <Button asChild variant="outline" size="sm"><Link href="/admin/contenido-ciudad">Contenido y campañas</Link></Button>}
            </>
          }
        />

        {/* Inventario: cifras grandes en tabular, sin tarjetas de colores. */}
        <section aria-label="Inventario" className="grid grid-cols-2 gap-x-4 gap-y-8 py-8 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map(({ key, label }, i) => (
            <Metric
              key={key}
              index={i}
              label={label}
              value={liveStats[key as keyof Stats] ?? 0}
              tone={key === "pendingReports" && (liveStats.pendingReports ?? 0) > 0 ? "warning" : "neutral"}
            />
          ))}
        </section>

        {statsError && (
          <Notice tone="warning" className="mb-6">
            {statsError} <a href="/admin" className="link-underline font-semibold text-text-primary">Volver a cargar</a>
          </Notice>
        )}

        <Tabs value={activeTab} onValueChange={selectTab}>
          <div className="grid gap-8 border-t border-border-light pt-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
            {/* Lateral en escritorio, desplegable en móvil. */}
            <AdminNav
              active={activeTab}
              onSelect={selectTab}
              readOnly={readOnly}
              pendingReports={liveStats.pendingReports}
              discarded={liveStats.discarded}
            />

            <div className="min-w-0">
          <TabsContent value="overview" className="mt-0 space-y-8">
            <DecisionCenter />
            <PaymentReview />
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <SectionTitle as="h3" eyebrow="Comunidad" title="Últimos usuarios" />
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border-light">
                    {recentUsers.slice(0, 8).map((u, i) => (
                      <li key={u.id} style={{ "--i": i } as CSSProperties} className="animate-list-in flex items-center gap-3 py-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{u.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.full_name || "Sin nombre"}</p>
                          <p className="text-xs text-text-muted">{new Date(u.created_at).toLocaleDateString("es-ES")}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(u.strikes_count || 0) > 0 && <Badge variant="destructive">{u.strikes_count}s</Badge>}
                          <Badge variant={u.role === "admin" ? "default" : "outline"}>{u.role || "user"}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <SectionTitle as="h3" eyebrow="Atajos" title="Gestión rápida" />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Usuarios", tab: "users", icon: Users },
                      { label: "Reportes", tab: "reports", icon: AlertTriangle },
                      { label: "Auditoría", tab: "audit", icon: FileText },
                      ...(readOnly ? [] : [{ label: "Equipo", tab: "propietario", icon: UserPlus }]),
                      { label: "Carreras", tab: "careers", icon: BookOpen },
                      { label: "Universidades", tab: "universities", icon: Building2 },
                      { label: "Becas", tab: "scholarships", icon: Trophy },
                      { label: "Noticias", tab: "news", icon: Newspaper },
                      { label: "Eventos", tab: "events", icon: CalendarDays },
                      { label: "Alojamiento", tab: "accommodations", icon: Home },
                    ].map(({ label, tab, icon: Icon }, i) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => selectTab(tab)}
                        style={{ "--i": i } as CSSProperties}
                        className="group animate-list-in flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-left text-sm font-medium text-text-secondary transition-[border-color,background-color,color] duration-200 hover:border-text-primary/30 hover:bg-bg-secondary hover:text-text-primary"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-violet" strokeWidth={1.75} />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users"><UserManagementPanel readOnly={readOnly} /></TabsContent>
          <TabsContent value="inbox"><InboxPanel readOnly={readOnly} /></TabsContent>
          <TabsContent value="reports"><ReportsPanel readOnly={readOnly} /></TabsContent>
          <TabsContent value="audit"><AuditLogPanel /></TabsContent>
          {!readOnly && <TabsContent value="propietario"><CreateTeamAccountPanel /></TabsContent>}
          {!readOnly && <TabsContent value="party"><CrushPartyPanel /></TabsContent>}

          <TabsContent value="careers">
            <CrudTable readOnly={readOnly} table="careers" label="Carreras" columns={[
              { key: "name", label: "Nombre" }, { key: "branch", label: "Rama" },
              { key: "cut_off_score", label: "Nota corte", type: "number", step: 0.001 }, { key: "duration_years", label: "Años", type: "number", step: 0.1 },
              { key: "modality", label: "Modalidad" },
            ]} />
          </TabsContent>

          <TabsContent value="universities">
            <CrudTable readOnly={readOnly} table="universities" label="Universidades" columns={[
              { key: "name", label: "Nombre" }, { key: "city", label: "Ciudad" },
              { key: "comunidad_autonoma", label: "Comunidad" }, { key: "type", label: "Tipo" }, { key: "website", label: "Web" },
            ]} />
          </TabsContent>

          <TabsContent value="scholarships">
            <CrudTable readOnly={readOnly} table="scholarships" label="Becas" columns={[
              { key: "name", label: "Nombre" }, { key: "provider", label: "Proveedor" }, { key: "type", label: "Tipo" },
              { key: "amount_min", label: "Mín €", type: "number" }, { key: "amount_max", label: "Máx €", type: "number" },
              { key: "comunidad_autonoma", label: "Comunidad" },
            ]} />
          </TabsContent>

          <TabsContent value="news">
            <CrudTable readOnly={readOnly} table="news" label="Noticias" columns={[
              { key: "title", label: "Título" },
              { key: "slug", label: "Slug", autoSlugFrom: "title" },
              { key: "category", label: "Categoría", type: "select", options: ["general", "becas", "universidades", "empleo", "eventos", "tecnologia", "alojamiento"] },
              { key: "excerpt", label: "Extracto" },
              { key: "content", label: "Contenido", type: "textarea" },
              { key: "image_url", label: "Imagen", type: "image" },
              { key: "is_published", label: "Publicada", type: "boolean" },
              { key: "is_featured", label: "Destacada", type: "boolean" },
            ]} />
          </TabsContent>

          <TabsContent value="events">
            <CrudTable readOnly={readOnly} table="events" label="Eventos" columns={[
              { key: "title", label: "Título" }, { key: "city", label: "Ciudad" }, { key: "category", label: "Categoría" },
              { key: "start_date", label: "Fecha inicio" }, { key: "max_capacity", label: "Plazas", type: "number" },
              { key: "image_url", label: "Imagen", type: "image" },
            ]} />
          </TabsContent>

          <TabsContent value="accommodations">
            <CrudTable readOnly={readOnly} table="accommodations" label="Alojamientos" columns={[
              { key: "title", label: "Título" }, { key: "city", label: "Ciudad" }, { key: "type", label: "Tipo" },
              { key: "price", label: "Precio €", type: "number" }, { key: "rooms", label: "Hab.", type: "number" }, { key: "status", label: "Estado" },
            ]} />
          </TabsContent>

          <TabsContent value="leisure">
            {!readOnly && <AutofillLeisureImagesPanel />}
            <CrudTable readOnly={readOnly} table="leisure_spots" label="Zonas de ocio" columns={[
              { key: "name", label: "Nombre" }, { key: "city", label: "Ciudad" }, { key: "category", label: "Categoría" },
              { key: "rating", label: "Rating", type: "number" }, { key: "price_range", label: "Precio" },
              { key: "image_url", label: "Imagen (URL)", type: "image" },
              { key: "is_verified", label: "Verificado", type: "boolean", editable: true },
            ]} />
          </TabsContent>

          {/* Sugerencias de zonas de ocio */}
          <TabsContent value="suggestions">
            {readOnly ? <Quiet>Las sugerencias de ocio requieren una cuenta administradora.</Quiet> : <LeisureSuggestionsPanel />}
          </TabsContent>

          {/* Papelera (borrado lógico) */}
          <TabsContent value="discarded">
            {readOnly ? <Quiet>La papelera requiere una cuenta administradora.</Quiet> : <DiscardedRecordsPanel />}
          </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// El panel ya no usa framer-motion: las entradas se hacen con las utilidades
// CSS del sistema (animate-list-in, Reveal), que respetan reduced-motion.
export default function AdminDashboard(
  props: Parameters<typeof AdminDashboardInner>[0]
) {
  const { user, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user?.id !== props.viewerId) router.refresh();
  }, [loading, user?.id, props.viewerId, router]);
  if (loading || user?.id !== props.viewerId) return <Quiet role="status">Comprobando acceso al panel…</Quiet>;
  return (
    <AdminSessionScope viewerId={props.viewerId}><AdminDashboardInner {...props} /></AdminSessionScope>
  );
}
