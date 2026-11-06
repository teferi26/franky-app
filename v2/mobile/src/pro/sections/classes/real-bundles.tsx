import React from "react";
import { View } from "react-native";
import { Ticket } from "lucide-react-native";
import { C } from "@/theme";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Empty, ListRow, PAvatar, PageHeader, Panel, Pill, PText, SearchInput } from "../../kit";
import { MoreButton } from "./ui";

const PAGE = 40;

/** Bonos personales de un negocio real: sesiones concedidas y saldo. */
export function RealBundles() {
  const { data } = usePro();
  const [query, setQuery] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE);
  const bundles = data.classOperations?.bundles ?? [];
  const list = bundles.filter((bundle) => {
    const customer = data.clients.find((client) => client.id === bundle.customerId);
    const service = data.calendar?.services.find((item) => item.id === bundle.serviceId);
    return `${customer?.name ?? ""} ${service?.name ?? ""} ${bundle.label}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"));
  });
  return (
    <ProPage>
      <PageHeader eyebrow="Clientes" title="Bonos de sesiones" description="Sesiones concedidas y saldo disponible de cada persona." />
      <SearchInput
        value={query}
        onChange={(v) => {
          setQuery(v);
          setLimit(PAGE);
        }}
        placeholder="Buscar persona, servicio o bono"
      />
      {list.length ? (
        <Panel flush>
          {list.slice(0, limit).map((bundle, i, shown) => {
            const customer = data.clients.find((client) => client.id === bundle.customerId);
            const service = data.calendar?.services.find((item) => item.id === bundle.serviceId);
            return (
              <ListRow key={bundle.id} last={i === shown.length - 1 && limit >= list.length}>
                {customer ? (
                  <PAvatar name={customer.name} size={32} />
                ) : (
                  <View style={{ width: 32, alignItems: "center" }}>
                    <Ticket size={22} color={C.blue} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>{customer?.name ?? "Persona no visible"}</PText>
                  <PText v="small" numberOfLines={1}>{`${bundle.label}${service ? ` · ${service.name}` : ""}`}</PText>
                </View>
                <Pill label={`${bundle.remaining} de ${bundle.granted} sesiones`} tone={bundle.remaining > 0 ? "success" : "neutral"} />
              </ListRow>
            );
          })}
          <MoreButton shown={limit} total={list.length} onPress={() => setLimit((n) => n + PAGE)} />
        </Panel>
      ) : (
        <Panel>
          <Empty
            icon={Ticket}
            title={query ? "No hay coincidencias" : "Sin bonos registrados"}
            body="Los bonos personales del espacio aparecerán aquí con su saldo real."
          />
        </Panel>
      )}
    </ProPage>
  );
}
