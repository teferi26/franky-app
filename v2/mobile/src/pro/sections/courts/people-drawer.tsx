import React from "react";
import { View } from "react-native";
import { Check, type LucideIcon } from "lucide-react-native";
import { C, R, S } from "@/theme";
import { Empty, PAvatar, PText, Sheet } from "../../kit";
import { WhatsAppButton } from "./booking-ops";
import { MoreButton, useMore } from "./ui";

/**
 * Personas a las que escribir hoy, cada una con su mensaje ya escrito
 * (versión nativa de web courts/people-drawer.tsx): jugadores que han dejado
 * de venir, socios que no aparecen o el resumen de horas del mes.
 */

export type PersonToWrite = {
  id: string;
  name: string;
  detail: string;
  phone?: string;
  message: string;
  extra?: React.ReactNode;
};

export function PeopleDrawer({ open, onClose, title, description, people, emptyIcon, emptyTitle, emptyBody, cta = "Escribir" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  people: PersonToWrite[];
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyBody: string;
  cta?: string;
}) {
  const [written, setWritten] = React.useState<Set<string>>(new Set());
  const list = useMore(people);
  React.useEffect(() => {
    if (open) setWritten(new Set());
  }, [open]);
  const done = people.filter((p) => written.has(p.id)).length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={done ? `${description ? `${description} ` : ""}Llevas ${done} de ${people.length}.` : description}
    >
      {people.length ? (
        <>
          {list.visible.map((p) => {
            const sent = written.has(p.id);
            return (
              <View key={p.id} style={{ gap: S.sm, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <PAvatar name={p.name} size={34} toneKey={sent ? "emerald" : "slate"} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</PText>
                      {sent ? <Check size={14} color={C.success} accessibilityLabel="Escrito" /> : null}
                    </View>
                    <PText v="tiny" numberOfLines={1}>{p.detail}</PText>
                  </View>
                </View>
                <View style={{ borderRadius: R.md, backgroundColor: C.input, padding: S.sm }}>
                  <PText v="small">{p.message}</PText>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
                  {p.phone ? (
                    <WhatsAppButton
                      phone={p.phone}
                      message={p.message}
                      label={sent ? "Escribir otra vez" : cta}
                      onSent={() => setWritten((s) => new Set(s).add(p.id))}
                    />
                  ) : (
                    <PText v="tiny">Sin móvil en su ficha</PText>
                  )}
                  {p.extra}
                </View>
              </View>
            );
          })}
          <MoreButton onPress={list.more} />
        </>
      ) : (
        <Empty icon={emptyIcon} title={emptyTitle} body={emptyBody} />
      )}
    </Sheet>
  );
}
