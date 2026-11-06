"use client";

import * as React from "react";
import { Ticket } from "lucide-react";
import { usePro } from "@/lib/pro/store";
import { Avatar, Empty, PageHeader, Pill, SearchInput } from "../../kit";

export function RealBundles() {
  const { data } = usePro();
  const [query, setQuery] = React.useState("");
  const bundles = data.classOperations?.bundles ?? [];
  const list = bundles.filter((bundle) => {
    const customer = data.clients.find(
      (client) => client.id === bundle.customerId,
    );
    const service = data.calendar?.services.find(
      (item) => item.id === bundle.serviceId,
    );
    return `${customer?.name ?? ""} ${service?.name ?? ""} ${bundle.label}`
      .toLocaleLowerCase("es")
      .includes(query.toLocaleLowerCase("es"));
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Clientes"
        title="Bonos de sesiones"
        description="Sesiones concedidas y saldo disponible de cada persona."
      />
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar persona, servicio o bono"
      />
      {list.length ? (
        <ul className="divide-y divide-border-light rounded-2xl border border-border bg-bg-primary">
          {list.map((bundle) => {
            const customer = data.clients.find(
              (client) => client.id === bundle.customerId,
            );
            const service = data.calendar?.services.find(
              (item) => item.id === bundle.serviceId,
            );
            return (
              <li key={bundle.id} className="flex items-center gap-3 p-4">
                {customer ? (
                  <Avatar name={customer.name} size="sm" />
                ) : (
                  <Ticket className="h-6 w-6 text-violet" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {customer?.name ?? "Persona no visible"}
                  </p>
                  <p className="truncate text-sm text-text-muted">
                    {bundle.label}
                    {service ? ` · ${service.name}` : ""}
                  </p>
                </div>
                <Pill tone={bundle.remaining > 0 ? "success" : "neutral"}>
                  {bundle.remaining} de {bundle.granted} sesiones
                </Pill>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          icon={Ticket}
          title={query ? "No hay coincidencias" : "Sin bonos registrados"}
          body="Los bonos personales del espacio aparecerán aquí con su saldo real."
        />
      )}
    </div>
  );
}
