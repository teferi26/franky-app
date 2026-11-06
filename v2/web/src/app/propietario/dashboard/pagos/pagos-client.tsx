"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion";
import PayoutsCard from "@/components/PayoutsCard";
import { PanelBody, PanelHeader } from "../panel-ui";

interface ConnectAccount {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  onboarding_status: "pending" | "restricted" | "active" | "disabled";
}

export default function PagosClient({ account }: { account: ConnectAccount | null }) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <PanelHeader
        title="Cobros"
        description="Recibe pagos de visitas, alquiler y reservas desde Franky, con el desglose de cada cobro en tu Cartera."
      />

      <PanelBody className="space-y-10">
        {/* Misma tarjeta (y mismo texto) que /cobros: el alta de Stripe se
            explica en un solo sitio para que nadie lea dos versiones distintas. */}
        <Reveal>
          <PayoutsCard
            account={account ?? null}
            returnTo="/propietario/dashboard/pagos?onboarded=1"
          />
        </Reveal>

        <Reveal delay={80} className="max-w-prose">
          <h2 className="font-heading text-xl font-bold text-text-primary sm:text-2xl">
            Cobra desde Franky
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
            Visitas de pago y alquiler o fianza por Stripe. Cobrar desde la
            plataforma amplía la conversión: el estudiante paga en dos toques sin
            salir de la app, y tú ves el desglose de cada cobro en tu Cartera.
          </p>
          <p className="mt-4 text-sm text-text-muted">
            ¿Quieres cobrar las visitas? Ponles precio desde tu{" "}
            <Link
              href="/propietario/dashboard/horario"
              className="group inline-flex items-center gap-1 font-semibold text-text-primary link-underline"
            >
              horario de visitas
              <ArrowRight className="h-4 w-4 arrow-nudge" strokeWidth={1.75} />
            </Link>{" "}
            y filtra curiosos.
          </p>
        </Reveal>
      </PanelBody>
    </div>
  );
}
