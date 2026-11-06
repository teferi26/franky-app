"use client";
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminRequest } from './AdminSessionScope';
import { Notice } from './panel-ui';

type LookupResult = { email: string; status: string; authUser: { id: string; [key: string]: unknown } | null; profile: Record<string, unknown> | null };
export default function UserLookupTool({ onReconciled }: { onReconciled?: () => void }) {
  const { run, isCurrent } = useAdminRequest();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const cancel = () => { generation.current++; pending.current?.abort(); pending.current = null; setLoading(false); setResult(null); setReconcileMessage(null); };
  useEffect(() => () => { generation.current++; pending.current?.abort(); }, []);
  const close = () => { cancel(); setOpen(false); setEmail(''); };

  const lookup = async () => {
    if (!email.trim() || writing.current || !isCurrent()) return;
    cancel();
    const version = generation.current;
    const controller = new AbortController(); pending.current = controller;
    const requestedEmail = email.trim().toLowerCase();
    setLoading(true);
    try {
      const data = await run(async request => {
        const response = await fetch(`/api/admin/users/lookup?email=${encodeURIComponent(requestedEmail)}`, { signal: request.signal, headers: { Authorization: request.authorization } });
        const body = await response.json(); request.check();
        if (!response.ok) throw new Error(body.error || 'No se pudo buscar la cuenta.');
        return body as LookupResult;
      }, { signal: controller.signal });
      if (isCurrent() && generation.current === version) setResult({ ...data, email: requestedEmail });
    } catch (error) {
      if (isCurrent() && generation.current === version && !controller.signal.aborted) setReconcileMessage(error instanceof Error ? error.message : 'No se pudo buscar la cuenta.');
    } finally { if (isCurrent() && generation.current === version) setLoading(false); }
  };

  const reconcile = async () => {
    const snapshot = result;
    if (!snapshot?.authUser || snapshot.status !== 'missing_profile' || writing.current || !isCurrent()) return;
    writing.current = true; setReconciling(true); setReconcileMessage(null);
    const version = generation.current;
    const controller = new AbortController(); pending.current = controller;
    try {
      const data = await run(async request => {
        const response = await fetch(`/api/admin/users/lookup?email=${encodeURIComponent(snapshot.email)}`, { method: 'POST', signal: request.signal,
          headers: { Authorization: request.authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: snapshot.authUser!.id }) });
        const body = await response.json(); request.check();
        if (!response.ok) throw new Error(body.error || 'No se pudo crear el perfil.');
        return body;
      }, { write: true, signal: controller.signal });
      if (!isCurrent() || generation.current !== version) return;
      setResult({ ...snapshot, status: 'ok', profile: data.profile });
      setReconcileMessage(data.audit_pending ? data.message : '✅ Perfil creado correctamente');
      onReconciled?.();
    } catch (error) {
      if (isCurrent() && generation.current === version && !controller.signal.aborted) setReconcileMessage(error instanceof Error ? error.message : 'No se pudo completar la operación. Consulta la cuenta antes de reintentar.');
    } finally { writing.current = false; if (isCurrent()) setReconciling(false); }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { if (open) close(); else setOpen(true); }}>
        <Search className="mr-2 h-4 w-4" strokeWidth={1.75} /> Buscar / Reconciliar
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 px-4">
          <div className="animate-dropdown max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-bg-primary p-6 shadow-float">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Cuentas</p>
                <h2 className="mt-2 font-heading text-lg font-bold text-text-primary">Buscar usuario por email</h2>
                <p className="mt-1.5 text-sm text-text-muted">
                  Busca en <code className="rounded bg-bg-secondary px-1 text-xs">auth.users</code> y <code className="rounded bg-bg-secondary px-1 text-xs">profiles</code>. Si existe en auth pero no en profiles, podrás reconciliar.
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Cerrar búsqueda" onClick={close}>
                <X className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </div>

            <div className="flex gap-2 mb-4">
              <Input
                type="email" aria-label="Email del usuario" disabled={reconciling}
                placeholder="email@dominio.com"
                value={email}
                onChange={(e) => { cancel(); setEmail(e.target.value); }}
                onKeyDown={(e) => e.key === "Enter" && lookup()}
                className="flex-1"
              />
              <Button onClick={lookup} disabled={loading || reconciling || !email.trim()}>
                {loading ? "Buscando…" : "Buscar"}
              </Button>
            </div>

            {/* El handler marca el éxito con un prefijo; aquí solo se lee para elegir el tono */}
            {reconcileMessage && (
              <Notice tone={reconcileMessage.startsWith("✅") ? "success" : "error"} className="mb-3">
                {reconcileMessage.replace(/^✅\s*/, "")}
              </Notice>
            )}

            {result && (
              <div className="space-y-3">
                <Notice tone={result.status === "ok" ? "success" : result.status === "missing_profile" ? "warning" : "error"}>
                  {result.status === "ok" && "Usuario completo (auth + profile)"}
                  {result.status === "missing_profile" && "Existe en auth pero NO en profiles (usuario huérfano)"}
                  {result.status === "missing_auth" && "No existe en auth.users"}
                  {result.status === "missing_both" && "No existe ni en auth ni en profiles"}
                </Notice>

                {result.authUser && (
                  <div className="rounded-xl border border-border p-3">
                    <p className="eyebrow mb-2">auth.users</p>
                    <pre className="whitespace-pre-wrap break-all text-xs text-text-secondary">{JSON.stringify(result.authUser, null, 2)}</pre>
                  </div>
                )}

                {result.profile && (
                  <div className="rounded-xl border border-border p-3">
                    <p className="eyebrow mb-2">profiles</p>
                    <pre className="whitespace-pre-wrap break-all text-xs text-text-secondary">{JSON.stringify(result.profile, null, 2)}</pre>
                  </div>
                )}

                {result.status === "missing_profile" && (
                  <Button onClick={reconcile} disabled={reconciling} className="w-full">
                    {reconciling ? "Creando perfil…" : "Crear perfil para este usuario"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
