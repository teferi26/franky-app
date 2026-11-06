"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { housingOfferTerms, type HousingBilling } from "@/lib/housing-offer";

export function HousingOfferConsent({ billing, accepted, onChange }: {
  billing: HousingBilling; accepted: boolean; onChange: (value: boolean) => void;
}) {
  return <div className="rounded-2xl border border-border bg-bg-secondary p-5 text-sm text-text-secondary">
    <p className="font-semibold text-text-primary">Publica gratis hasta tu primer interesado</p>
    <p className="mt-2 leading-relaxed">{housingOfferTerms(billing)}</p>
    <label className="mt-4 flex cursor-pointer items-start gap-3 font-semibold text-text-primary">
      <input type="checkbox" checked={accepted} onChange={e => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-violet" />
      Acepto esta tarifa y autorizo el cobro automático al recibir el primer interesado.
    </label>
  </div>;
}
type Offer = { id: string; listing_id: string | null; billing: HousingBilling; state: string;
  terms_text: string; first_interest_at: string | null; payment_url: string | null };
export function HousingOfferStatus() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = async () => {
    try {
      const res = await fetch("/api/negocio/housing-offer"); const json = await res.json();
      if (!res.ok) throw new Error();
      setOffers(json.offers ?? []); setError("");
    } catch { setError("No se pudo consultar el estado de publicación gratis. Vuelve a intentarlo."); }
  };
  useEffect(() => { void load(); }, []);
  const cancel = async (id: string) => {
    setBusy(id); setError("");
    try {
      const res = await fetch("/api/negocio/housing-offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const json = await res.json(); if (!res.ok) throw new Error(json.error);
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cancelar."); }
    finally { setBusy(null); }
  };
  return <div className="space-y-4">
    {error && <div role="alert" className="text-sm text-error">{error} <button className="underline" onClick={load}>Reintentar</button></div>}
    {offers.filter(o => o.state !== "active").map(o => <section key={o.id} className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-6">
      <p className="eyebrow">{o.billing === "listing" ? "Anuncio individual" : "Plan Inmobiliarias"}</p>
      <h2 className="mt-2 text-xl font-bold text-text-primary">{o.state === "setup" ? "Falta guardar tu tarjeta" : o.state === "waiting" && !o.first_interest_at
        ? "Publicado gratis · esperando al primer interesado" : o.state === "payment_required" ? "Tu banco necesita completar el pago"
        : o.state === "review" ? "Estamos comprobando la activación" : "Tu primer interesado ha llegado"}</h2>
      <p className="mt-2 text-sm text-text-secondary">{o.state === "waiting" && !o.first_interest_at
        ? "No hay fecha de cobro: la suscripción empieza con el primer mensaje o solicitud de visita en Franky."
        : o.state === "setup" ? "Puedes retomar el alta desde el plan o anuncio. Hoy no se cobra nada."
        : o.state === "payment_required" ? "Completa la confirmación del banco para activar la suscripción y volver a mostrar los anuncios cubiertos."
        : "La tarifa comienza con este contacto y se renueva hasta que canceles. Puedes gestionarla desde Facturación."}</p>
      {o.listing_id && <a className="mt-3 inline-block text-sm underline" href={`/alojamiento/${o.listing_id}`}>Ver anuncio</a>}
      <details className="mt-3 text-sm text-text-muted"><summary className="cursor-pointer">Condiciones aceptadas</summary><p className="mt-2 leading-relaxed">{o.terms_text}</p></details>
      {o.payment_url && <a href={o.payment_url} className="mt-4 inline-block font-semibold underline">Completar pago en Stripe</a>}
      {["waiting","setup"].includes(o.state) && !o.first_interest_at && <div className="mt-4">
        <Button variant="outline" onClick={() => cancel(o.id)} loading={busy === o.id}>Cancelar publicación gratis</Button>
        <p className="mt-2 text-xs text-text-muted">Sin cargos. Los anuncios cubiertos dejarán de mostrarse.</p>
      </div>}
    </section>)}
  </div>;
}
