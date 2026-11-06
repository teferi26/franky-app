"use client";

import { usePro } from "@/lib/pro/store";
import { localDate, money, plural } from "@/lib/pro/format";
import { PageHeader, Tip } from "../../kit";
import { CashOfDay } from "./room";

/**
 * Caja del día del escape room y los talleres: lo cobrado en recepción por
 * sala, por forma de pago y lo que ha llegado por Franky, para cuadrar el
 * mostrador al cerrar sin abrir un Excel.
 */
export default function ClassesCaja() {
  const { data, now } = usePro();
  const today = localDate(now);
  const payments = data.payments.filter((p) => localDate(p.at) === today);
  const total = payments.reduce((a, p) => a + p.amountCents, 0);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Caja"
        title="La caja del día"
        description={
          payments.length
            ? `Hoy llevas ${money(total, { round: true })} en ${plural(payments.length, "cobro", "cobros")}.`
            : "Cobra cada grupo desde su reserva al llegar: aquí se suma solo, por sala y por forma de pago."
        }
      />
      <CashOfDay />
      <Tip title="Al cerrar">
        Cuenta el efectivo del cajón y compáralo con la cifra de efectivo de hoy. Si no cuadra,
        revisa los cobros de la última partida.
      </Tip>
    </div>
  );
}
