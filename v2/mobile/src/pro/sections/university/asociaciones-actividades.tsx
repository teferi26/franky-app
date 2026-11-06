import React from "react";
import { View } from "react-native";
import { CalendarDays, MapPin } from "lucide-react-native";
import { C, S } from "@/theme";
import { capitalize, dayLabel, localDate, time } from "../../../../../shared/pro/format";
import { activityClashes, uniExtrasOf } from "../../../../../shared/pro/university";
import type { UniAssociation } from "../../../../../shared/pro/university-types";
import { usePro } from "../../store";
import { Empty, PText, Panel } from "../../kit";
import { EmptyBox, Notice } from "./ui";

/**
 * Actividades de las asociaciones por día, con aviso cuando dos coinciden en
 * el mismo espacio y a la misma hora. Misma lógica que la web
 * (`ActivitiesView` de asociaciones-parts.tsx).
 */
export function ActivitiesView() {
  const { data, now } = usePro();
  const extras = uniExtrasOf(data);
  const associations = data.uniAssociations as UniAssociation[];
  const today = localDate(now);
  const upcoming = extras.assocActivities
    .filter((a) => localDate(a.end) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const clashes = activityClashes(upcoming);
  const clashCount = [...clashes.values()].reduce((a, list) => a + list.length, 0) / 2;
  const byId = new Map(upcoming.map((a) => [a.id, a]));
  const days = [...new Set(upcoming.map((a) => localDate(a.start)))];
  const nameOf = (id: string) => associations.find((a) => a.id === id)?.name ?? "Asociación";

  if (!upcoming.length) {
    return (
      <EmptyBox>
        <Empty
          icon={CalendarDays}
          title="Sin actividades programadas"
          body="Cuando las asociaciones programen actividades en Franky, las verás aquí juntas y te avisaremos si dos coinciden en el mismo espacio y a la misma hora."
        />
      </EmptyBox>
    );
  }

  return (
    <View>
      {clashCount ? (
        <View style={{ marginBottom: S.lg }}>
          <Notice tone="warning" title={clashCount === 1 ? "Hay 1 choque de espacio" : `Hay ${clashCount} choques de espacio`}>
            Dos actividades coinciden en el mismo sitio a la misma hora: avisa a una de las asociaciones antes de que llegue el día.
          </Notice>
        </View>
      ) : null}

      {days.map((day) => {
        const list = upcoming.filter((a) => localDate(a.start) === day);
        return (
          <Panel key={day} title={capitalize(dayLabel(`${day}T12:00:00Z`))} flush>
            {list.map((a, i) => {
              const clash = clashes.get(a.id) ?? [];
              return (
                <View
                  key={a.id}
                  style={{
                    flexDirection: "row",
                    gap: S.md,
                    paddingHorizontal: S.lg,
                    paddingVertical: S.md,
                    borderBottomWidth: i === list.length - 1 ? 0 : 1,
                    borderBottomColor: C.borderLight,
                    backgroundColor: clash.length ? `${C.warning}14` : undefined,
                  }}
                >
                  <View style={{ width: 64 }}>
                    <PText v="h3">{time(a.start)}</PText>
                    <PText v="tiny">{`hasta ${time(a.end)}`}</PText>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3">{a.title}</PText>
                    <PText v="tiny" numberOfLines={1}>{nameOf(a.associationId)}</PText>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <MapPin size={12} color={C.muted} />
                      <PText v="tiny" numberOfLines={1} style={{ flex: 1 }}>{a.place}</PText>
                    </View>
                    {clash.length ? (
                      <PText v="tiny" color={C.warning} style={{ marginTop: 4, fontWeight: "600" }}>
                        {`Coincide con ${clash.map((id) => byId.get(id)?.title ?? "otra actividad").join(", ")}`}
                      </PText>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Panel>
        );
      })}
    </View>
  );
}
