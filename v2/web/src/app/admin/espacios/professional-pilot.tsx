"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-client";
export default function ProfessionalPilot({
  organizationId,
  name,
}: {
  organizationId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    epoch = useRef(0),
    client = useRef(createClient()).current;
  useEffect(() => {
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_OUT" || e === "SIGNED_IN") {
        epoch.current++;
        setOpen(false);
        setNotice("");
      }
    });
    return () => {
      epoch.current++;
      subscription.unsubscribe();
    };
  }, [client]);
  async function update(
    enabled: boolean | null,
    limits: Record<string, number> = {},
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const revision = epoch.current;
    try {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session || revision !== epoch.current) throw Error();
      const { data, error } = await client.rpc("admin_professional_settings", {
        p_organization_id: organizationId,
        p_enabled: enabled,
        p_limits: limits,
      });
      if (revision !== epoch.current) return;
      if (error) throw Error();
      setNotice(
        `Piloto ${data.enabled ? "activado" : "desactivado"} · ${data.staff_limit} profesionales · ${data.resource_limit} recursos · ${data.service_limit} servicios. Las ventas de software siguen desactivadas.`,
      );
    } catch {
      if (revision === epoch.current)
        setNotice(
          "No se pudo cambiar el piloto. Requiere administración con verificación en dos pasos y que el negocio haya elegido su categoría.",
        );
    } finally {
      lock.current = false;
      if (revision === epoch.current) setBusy(false);
    }
  }
  return (
    <div className="w-full">
      <button
        className="text-sm font-semibold text-violet"
        onClick={() => setOpen((v) => !v)}
      >
        Software y acceso al piloto
      </button>
      {open && (
        <section className="mt-3 rounded-xl bg-bg-secondary p-4">
          <p className="text-sm">
            Habilita las herramientas de {name} para pruebas privadas. No crea
            una suscripción ni realiza cobros.
          </p>
          <div className="my-3 flex flex-wrap gap-3">
            <button
              disabled={busy}
              className="rounded-lg bg-violet px-3 py-2 text-sm text-white"
              onClick={() => void update(true)}
            >
              Activar piloto
            </button>
            <button
              disabled={busy}
              className="rounded-lg border border-border px-3 py-2 text-sm"
              onClick={() => void update(false)}
            >
              Pausar nuevas reservas
            </button>
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                limits: Record<string, number> = {};
              for (const key of [
                "staff_limit",
                "resource_limit",
                "service_limit",
              ])
                if (f.get(key)) limits[key] = Number(f.get(key));
              void update(null, limits);
            }}
          >
            {[
              ["staff_limit", "Profesionales"],
              ["resource_limit", "Recursos"],
              ["service_limit", "Servicios"],
            ].map(([key, label]) => (
              <label key={key} className="block text-xs">
                {label}
                <input
                  name={key}
                  type="number"
                  min={1}
                  max={1000}
                  placeholder="Conservar"
                  className="mt-1 block w-28 rounded-lg border border-border bg-bg-primary p-2"
                />
              </label>
            ))}
            <button
              disabled={busy}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              Guardar límites
            </button>
          </form>
          {notice && (
            <p role="status" className="mt-3 text-sm">
              {notice}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
