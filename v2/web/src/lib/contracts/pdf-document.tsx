/**
 * Documento React-PDF compartido del contrato de alquiler. Lo renderizan tanto
 * la preview (borrador) como la descarga (firmado), de modo que lo que se ve en
 * la preview es exactamente el documento que se firma.
 *
 * Solo se importa desde rutas server (runtime nodejs), nunca desde un componente
 * cliente: el cliente embebe el PDF vía <iframe> apuntando a la ruta.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  CONTRACT_STEPS,
  LEGAL_DISCLAIMER,
  type ContractAnswers,
  type ContractField,
} from "./questions";

const COLOR = {
  ink: "#0F172A",
  body: "#1E293B",
  muted: "#64748B",
  border: "#CBD5E1",
  soft: "#F1F5F9",
  violet: "#7C3AED",
  white: "#FFFFFF",
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLOR.white,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    color: COLOR.body,
    fontSize: 10,
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 18,
    paddingBottom: 12,
    borderBottom: `1pt solid ${COLOR.border}`,
  },
  brand: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLOR.violet,
    letterSpacing: 2,
    marginBottom: 6,
  },
  docTitle: {
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
  },
  docMeta: { fontSize: 8, color: COLOR.muted, marginTop: 4 },
  draftBanner: {
    marginTop: 8,
    padding: 6,
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    borderRadius: 4,
  },
  clause: { marginBottom: 12 },
  clauseTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
    marginBottom: 5,
  },
  row: { flexDirection: "row", marginBottom: 2 },
  rowLabel: { width: "45%", color: COLOR.muted, fontSize: 9 },
  rowValue: { width: "55%", color: COLOR.body, fontSize: 9, fontFamily: "Helvetica-Bold" },
  paragraph: { fontSize: 9.5, color: COLOR.body, marginBottom: 4 },
  disclaimerBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: COLOR.soft,
    borderLeft: `3pt solid ${COLOR.violet}`,
    borderRadius: 4,
  },
  disclaimerTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  disclaimerText: { fontSize: 8.5, color: COLOR.muted, lineHeight: 1.5 },
  // Signatures page
  sigTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: COLOR.ink,
    marginBottom: 12,
  },
  sigCard: {
    marginBottom: 12,
    padding: 12,
    border: `1pt solid ${COLOR.border}`,
    borderRadius: 6,
  },
  sigName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: COLOR.ink },
  sigRole: { fontSize: 8, color: COLOR.violet, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  sigLine: { fontSize: 8.5, color: COLOR.muted, marginTop: 2 },
  sigPending: { fontSize: 9, color: "#B45309", fontFamily: "Helvetica-Bold", marginTop: 4 },
  hashLine: { fontSize: 7.5, color: COLOR.muted, marginTop: 14, fontFamily: "Courier" },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLOR.muted,
    paddingTop: 6,
    borderTop: `0.5pt solid ${COLOR.border}`,
  },
});

export type ContractSignerView = {
  full_name: string | null;
  role: "owner" | "tenant";
  status: "pending" | "signed";
  signed_at: string | null;
  ip: string | null;
};

export type ContractPdfProps = {
  contract: {
    id: string;
    title: string | null;
    status: string;
    created_at: string;
    locked_at: string | null;
    content_sha256: string | null;
  };
  answers: ContractAnswers;
  accommodationTitle: string;
  signers: ContractSignerView[];
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return "Sin fecha";
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function displayValue(field: ContractField, raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  switch (field.type) {
    case "boolean":
      return raw ? "Sí" : "No";
    case "select": {
      const opt = field.options?.find((o) => o.value === String(raw));
      return opt ? opt.label : String(raw);
    }
    case "number":
      return field.suffix ? `${raw} ${field.suffix}` : String(raw);
    case "date":
      return fmtDate(String(raw));
    default:
      return String(raw);
  }
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>FRANKY · franky.es · Contrato de arrendamiento</Text>
      <Text render={({ pageNumber, totalPages }) => `Pág. ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function ContractPdf({ contract, answers, accommodationTitle, signers }: ContractPdfProps) {
  const isDraft = contract.status === "draft";
  const title = contract.title?.trim() || `Contrato de arrendamiento: ${accommodationTitle}`;

  return (
    <Document title={title} author="Franky" creator="franky.es" producer="franky.es">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>FRANKY</Text>
          <Text style={styles.docTitle}>Contrato de arrendamiento de vivienda</Text>
          <Text style={styles.docMeta}>
            {accommodationTitle} · Ref. {contract.id.slice(0, 8)} · {fmtDate(contract.created_at)}
          </Text>
          {isDraft && (
            <Text style={styles.draftBanner}>
              BORRADOR: pendiente de envío y firma. Sin validez hasta su firma por todas las partes.
            </Text>
          )}
        </View>

        {CONTRACT_STEPS.map((step) => {
          const rows = step.fields
            .map((f) => ({ field: f, value: displayValue(f, answers[f.key]) }))
            .filter((r) => r.value !== null);
          if (rows.length === 0) return null;
          return (
            <View key={step.id} style={styles.clause} wrap={false}>
              <Text style={styles.clauseTitle}>{step.title}</Text>
              {rows.map(({ field, value }) =>
                field.type === "textarea" ? (
                  <Text key={field.key} style={styles.paragraph}>
                    {value}
                  </Text>
                ) : (
                  <View key={field.key} style={styles.row}>
                    <Text style={styles.rowLabel}>{field.label}</Text>
                    <Text style={styles.rowValue}>{value}</Text>
                  </View>
                )
              )}
            </View>
          );
        })}

        <View style={styles.disclaimerBox} wrap={false}>
          <Text style={styles.disclaimerTitle}>Aviso legal</Text>
          <Text style={styles.disclaimerText}>{LEGAL_DISCLAIMER}</Text>
        </View>

        <Footer />
      </Page>

      {/* Página de firmas y auditoría */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sigTitle}>Firmas y registro de auditoría</Text>
        {signers.map((s, i) => (
          <View key={i} style={styles.sigCard} wrap={false}>
            <Text style={styles.sigRole}>
              {s.role === "owner" ? "Arrendador" : "Arrendatario"}
            </Text>
            <Text style={styles.sigName}>{s.full_name || "Sin nombre"}</Text>
            {s.status === "signed" ? (
              <>
                <Text style={styles.sigLine}>Firmado electrónicamente el {fmtDate(s.signed_at)}</Text>
                {s.ip && <Text style={styles.sigLine}>IP registrada: {s.ip}</Text>}
                <Text style={styles.sigLine}>Firma electrónica simple (eIDAS)</Text>
              </>
            ) : (
              <Text style={styles.sigPending}>Pendiente de firma</Text>
            )}
          </View>
        ))}

        {contract.content_sha256 && (
          <Text style={styles.hashLine}>
            Huella de integridad (SHA-256): {contract.content_sha256}
          </Text>
        )}
        {contract.locked_at && (
          <Text style={styles.sigLine}>Contenido congelado el {fmtDate(contract.locked_at)}.</Text>
        )}

        <View style={styles.disclaimerBox} wrap={false}>
          <Text style={styles.disclaimerTitle}>Validez de la firma</Text>
          <Text style={styles.disclaimerText}>{LEGAL_DISCLAIMER}</Text>
        </View>

        <Footer />
      </Page>
    </Document>
  );
}
