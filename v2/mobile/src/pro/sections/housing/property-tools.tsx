import React from "react";
import { Text, View } from "react-native";
import { BadgeCheck, KeyRound } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProProperty } from "../../../../../shared/pro/types";
import type { ProEnergyLetter, ProPropertyCompliance } from "../../../../../shared/pro/housing-types";
import { localDate } from "../../../../../shared/pro/format";
import { shortDate } from "../../../../../shared/pro/housing";
import { ENERGY_LETTERS, complianceGaps, housingOpsOf, keysFor, patchProperty } from "../../../../../shared/pro/housing-ops";
import { usePro } from "../../store";
import { Field, Input, PButton, PText, Pill } from "../../kit";
import { Box, DateField, SelectField } from "./ui";

/**
 * Datos del piso en el móvil, los mismos que la web: lo obligatorio para
 * anunciarlo (NRUA y letra energética), plazos del certificado, seguro e IBI,
 * quién tiene cada juego de llaves y, en una gestora, de quién es el piso.
 */

/** Colores de la etiqueta energética, de verde (A) a rojo (G). */
const LETTER_HEX: Record<ProEnergyLetter, string> = {
  A: "#059669",
  B: "#10B981",
  C: "#84CC16",
  D: "#FBBF24",
  E: "#F59E0B",
  F: "#F97316",
  G: "#E11D48",
};

export function EnergyBadge({ letter }: { letter?: ProEnergyLetter }) {
  if (!letter) return null;
  return (
    <View accessibilityLabel={`Certificado energético ${letter}`} style={{ minWidth: 24, height: 24, borderRadius: 6, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: LETTER_HEX[letter] }}>
      <Text style={{ fontFamily: FONT.heading, fontSize: 12.5, color: letter === "D" ? "#121019" : "#FFFFFF" }} maxFontSizeMultiplier={1.2}>{letter}</Text>
    </View>
  );
}

/** NRUA, letra, catastro y fechas. Sin NRUA ni letra no se publica. */
export function ComplianceBox({ property }: { property: ProProperty }) {
  const { now, update, pending } = usePro();
  const today = localDate(now);
  const c = property.compliance ?? {};
  const [draft, setDraft] = React.useState<ProPropertyCompliance>(c);
  const gaps = complianceGaps({ ...property, compliance: draft });
  const dirty = JSON.stringify(draft) !== JSON.stringify(c);
  const set = (fields: Partial<ProPropertyCompliance>) => setDraft((d) => ({ ...d, ...fields }));

  const save = async () => {
    if (!(await update("property.compliance", (d) => patchProperty(d, property.id, (p) => ({ ...p, compliance: draft }))))) return;
    toast("Datos guardados", {
      kind: "success",
      body: gaps.length ? `Para publicarlo aún falta ${gaps.join(" y ")}.` : "Te avisamos antes de que caduque el certificado o renueve el seguro.",
    });
  };

  return (
    <Box>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
        <PText v="h3" style={{ flex: 1 }}>Datos del piso para anunciarlo</PText>
        {gaps.length ? <Pill tone="warning" label={`Falta ${gaps.join(" y ")}`} /> : <Pill tone="success" icon={BadgeCheck} label="Completo" />}
      </View>
      <Field label="NRUA" hint="Registro único para alquilar por temporada o por habitaciones.">
        <Input value={draft.nrua ?? ""} onChangeText={(v) => set({ nrua: v.toUpperCase() || undefined })} placeholder="ESFCTU..." autoCapitalize="characters" />
      </Field>
      <Field label="Referencia catastral">
        <Input value={draft.cadastralRef ?? ""} onChangeText={(v) => set({ cadastralRef: v.toUpperCase() || undefined })} placeholder="20 caracteres" maxLength={20} autoCapitalize="characters" />
      </Field>
      <Field label="Letra energética">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {ENERGY_LETTERS.map((l) => {
            const on = draft.energyLetter === l;
            return (
              <Tap
                key={l}
                onPress={() => set({ energyLetter: l })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Letra ${l}`}
                style={{ width: 42, height: 42, borderRadius: R.md, borderWidth: 1, borderColor: on ? "transparent" : C.border, backgroundColor: on ? LETTER_HEX[l] : C.surface, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: on ? (l === "D" ? "#121019" : "#FFFFFF") : C.text }} maxFontSizeMultiplier={1.2}>{l}</Text>
              </Tap>
            );
          })}
        </View>
      </Field>
      <DateField label="Certificado válido hasta" value={draft.energyExpiresAt ?? today} onChange={(v) => set({ energyExpiresAt: v })} />
      <DateField label="Renueva el seguro" value={draft.insuranceRenewsAt ?? today} onChange={(v) => set({ insuranceRenewsAt: v })} />
      <DateField label="Se paga el IBI" value={draft.ibiDueAt ?? today} onChange={(v) => set({ ibiDueAt: v })} />
      {dirty ? <PButton small variant="secondary" label="Guardar datos" onPress={() => void save()} disabled={pending} /> : null}
    </Box>
  );
}

/** Quién tiene cada juego de llaves y desde cuándo. */
export function KeysBox({ property }: { property: ProProperty }) {
  const { data } = usePro();
  const keys = keysFor(data, property.id);
  return (
    <Box>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <KeyRound size={15} color={C.muted} strokeWidth={1.9} />
        <PText v="h3">Llaves</PText>
      </View>
      {keys.length ? (
        keys.map((k) => (
          <View key={k.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
            <PText v="small" color={C.text} style={{ flex: 1 }}>{k.label}</PText>
            <PText v="tiny">{`${k.holder}, desde el ${shortDate(k.since)}`}</PText>
          </View>
        ))
      ) : (
        <PText v="small">Aún no has apuntado ningún juego.</PText>
      )}
    </Box>
  );
}

/** De quién es el piso cuando lo gestiona una inmobiliaria: decide su liquidación. */
export function OwnerField({ property }: { property: ProProperty }) {
  const { data, update } = usePro();
  const owners = housingOpsOf(data).owners;
  if (!owners.length) return null;
  return (
    <SelectField
      label="Propietario"
      value={property.ownerId ?? ""}
      onChange={async (v) => {
        const ok = await update("property.owner", (d) => patchProperty(d, property.id, (p) => ({ ...p, ownerId: v || undefined })));
        if (!ok) return;
        toast("Propietario asignado", { kind: "success", body: "Sus rentas y gastos entran en su liquidación del mes." });
      }}
      options={[{ value: "", label: "Sin propietario" }, ...owners.map((o) => ({ value: o.id, label: o.name, hint: `Honorarios del ${Math.round(o.feePct * 100)} %` }))]}
    />
  );
}
