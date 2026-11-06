import React from "react";
import { Text, View } from "react-native";
import { Download, FileText } from "lucide-react-native";
import { C, FONT, S } from "@/theme";
import { dayLabel } from "../../../../../shared/pro/format";
import { PRIVACY_MIN_GROUP, buildSeasonReport, seasonReportCsv, seasonReportHtml } from "../../../../../shared/pro/university";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Meter, PButton, PText, PageHeader, Panel, Tip } from "../../kit";
import { shareDocument, slugFile } from "../housing/output";
import { HiddenGroup } from "./ui";

const long = (day: string) => dayLabel(`${day}T12:00:00Z`, { weekday: false });

/**
 * Informe de temporada. En la web se imprime desde el navegador; aquí se
 * comparte como documento (se abre en el navegador, se imprime o se guarda en
 * PDF) o como CSV para la hoja de cálculo.
 */
export default function UniversityMemoria() {
  const { data, now } = usePro();
  const report = React.useMemo(() => buildSeasonReport(data, now), [data, now]);
  const name = slugFile("informe-temporada", report.to);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Informe"
        title="Informe de temporada"
        description={`Del ${long(report.from)} al ${long(report.to)}. Lo que ha hecho tu servicio este curso, listo para la memoria anual y para pedir el presupuesto del año que viene.`}
        actions={
          <>
            <PButton
              label="Documento para imprimir"
              icon={FileText}
              onPress={() => void shareDocument(seasonReportHtml(report), name, "html", "Informe de temporada")}
            />
            <PButton
              label="CSV"
              icon={Download}
              variant="outline"
              onPress={() => void shareDocument(seasonReportCsv(report), name, "csv", "Informe de temporada")}
            />
          </>
        }
      />

      {report.sections.map((s) => (
        <Panel key={s.title} title={s.title}>
          {s.rows.map(([label, value], i) => (
            <View
              key={label}
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: S.md,
                paddingVertical: 8,
                borderBottomWidth: i === s.rows.length - 1 ? 0 : 1,
                borderBottomColor: C.borderLight,
              }}
            >
              <PText v="small" style={{ flex: 1 }}>{label}</PText>
              <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3}>
                {value}
              </Text>
            </View>
          ))}
        </Panel>
      ))}

      {report.faculties.length ? (
        <Panel
          title="Primero por facultad"
          description="Qué parte de primero ha ido a la bienvenida, se ha apuntado a una asociación y sigue activa a 30 días."
          flush
        >
          {report.faculties.map((f, i) => (
            <View
              key={f.faculty}
              style={{
                paddingHorizontal: S.lg,
                paddingVertical: S.md,
                gap: 6,
                borderBottomWidth: i === report.faculties.length - 1 ? 0 : 1,
                borderBottomColor: C.borderLight,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
                <PText v="h3" style={{ flex: 1 }}>{f.faculty}</PText>
                {f.firstYear !== null ? <PText v="small">{`${f.firstYear.toLocaleString("es-ES")} en primero`}</PText> : null}
              </View>
              {f.firstYear === null ? (
                <HiddenGroup />
              ) : (
                (
                  [
                    ["Bienvenida", f.participated],
                    ["Asociación", f.association],
                    ["Activos 30 días", f.active30],
                  ] as const
                ).map(([label, value]) => (
                  <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                    <PText v="tiny" style={{ width: 96 }}>{label}</PText>
                    <View style={{ flex: 1 }}>
                      <Meter value={value ?? 0} max={100} />
                    </View>
                    <Text style={{ minWidth: 44, textAlign: "right", fontFamily: FONT.semibold, fontSize: 13, color: C.text }} maxFontSizeMultiplier={1.3}>
                      {`${value ?? 0} %`}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ))}
        </Panel>
      ) : null}

      <Tip title="Para la memoria y el presupuesto">
        {`Todas las cifras salen de lo que ha pasado de verdad en Franky y son agregadas: los grupos de menos de ${PRIVACY_MIN_GROUP} personas no aparecen. El documento se abre en el navegador, desde donde se imprime o se guarda en PDF.`}
      </Tip>
    </ProPage>
  );
}
