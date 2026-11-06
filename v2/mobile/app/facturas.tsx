// ─── Mis facturas ────────────────────────────────────────────────────────
// Facturas emitidas por Stripe para el usuario: suscripciones (plan de
// negocio, Plan Propietario, Pro/Premium) y compras con factura (entradas).
// Cada una se abre en su página segura de Stripe (ver online + descargar PDF).
// A los titulares de un plan les llega además un resumen mensual por email
// (cron /api/cron/monthly-invoices de la web).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ReceiptText, Settings2 } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, EmptyState, Pill, SkeletonList, Tap } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getMyInvoices, openBillingPortal } from '@/lib/payments';
import { invoiceDocumentUrl } from '@/lib/payment-contract';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { toastError, toastInfo } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';
import type { StripeInvoice } from '@/lib/types';

const money = (cents: number) => `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const invoiceDate = (epoch: number) =>
  new Date(epoch * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS: Record<string, { label: string; tone: 'green' | 'blue' | 'red' | 'gray' }> = {
  paid: { label: 'Pagada', tone: 'green' },
  open: { label: 'Pendiente', tone: 'blue' },
  void: { label: 'Anulada', tone: 'gray' },
  uncollectible: { label: 'Impagada', tone: 'red' },
};

export default function Facturas() {
  const owner = useSessionOwner();
  return owner ? <OwnedFacturas key={owner.userId + ':' + owner.generation} owner={owner} /> : null;
}
function OwnedFacturas({ owner }: { owner: SessionIdentity }) {
  const current = useOwnerGuard(owner);
  const [invoices, setInvoices] = useState<StripeInvoice[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { rows, error } = await getMyInvoices().catch(() => ({ rows: [], error: 'No se pudieron cargar las facturas.' }));
    if (!current()) return;
    setInvoices(rows);
    if (error && rows.length === 0) {
      // Solo avisa si de verdad no hay nada que mostrar, y en un toast: es
      // información, no una decisión que el usuario tenga que tomar.
      toastError('Facturas', error);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const open = async (inv: StripeInvoice) => {
    if (!current()) return;
    const url = invoiceDocumentUrl(inv, Platform.OS !== 'web');
    if (!url) { toastInfo('Factura', 'Esta factura aún no tiene documento disponible.'); return; }
    try { await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }); }
    catch { if (current()) toastError('Factura', 'No se pudo abrir el documento.'); }
  };

  const portal = async () => {
    setBusy(true);
    const r = await openBillingPortal();
    setBusy(false);
    if (!r.ok) toastError('Portal de pagos', r.error ?? 'Inténtalo de nuevo en unos minutos.');
  };

  return (
    <Screen title="Mis facturas" back refreshing={refreshing} onRefresh={refresh}>
      {invoices === null ? (
        <View style={{ marginTop: S.lg }}>
          <SkeletonList count={4} height={84} radius={R.lg} />
        </View>
      ) : invoices.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Sin facturas todavía"
          subtitle="Cuando pagues un plan o compres una entrada, tus facturas aparecerán aquí con su PDF descargable. Si tienes un plan activo, también te llegará un resumen mensual por email." />
      ) : (
        <View style={{ marginTop: S.lg }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { paddingHorizontal: S.lg, paddingBottom: S.lg, lineHeight: 16 }]}>
            Toca una factura para verla y descargar el PDF. En cada una aparece el desglose de
            a dónde va tu dinero (organizador, comisión de servicio Franky y, en pagos desde el
            móvil, la tasa de App Store / Google Play: 0 € en entradas de eventos).
          </Text>
          {invoices.map((inv, i) => {
            const s = STATUS[inv.status ?? ''] ?? { label: inv.status ?? '—', tone: 'gray' as const };
            return (
              <FadeIn key={inv.id} index={i}>
                <Tap onPress={() => open(inv)} accessibilityLabel={`${inv.number ? `Factura ${inv.number}` : 'Factura'}, ${money(inv.total_cents)}`}
                  accessibilityHint="Abre la factura para verla y descargar el PDF">
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    paddingHorizontal: S.lg, paddingVertical: 14,
                    borderTopWidth: 0.5, borderTopColor: C.borderLight,
                  }}>
                    <ReceiptText size={20} color={C.muted} strokeWidth={1.75} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>
                        {inv.number ? `Factura ${inv.number}` : 'Factura'}
                      </Text>
                      {inv.description ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={2}>{inv.description}</Text> : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{invoiceDate(inv.created)}</Text>
                        <Pill label={s.label} tone={s.tone} />
                      </View>
                    </View>
                    {/* El importe manda en la fila: tipografía de marca y cifras tabulares. */}
                    <Text maxFontSizeMultiplier={1.4} style={{ fontSize: 18, fontFamily: FONT.heading, color: C.text, fontVariant: ['tabular-nums'] }}>{money(inv.total_cents)}</Text>
                  </View>
                </Tap>
              </FadeIn>
            );
          })}
          {/* El portal de Stripe NO se enseña en iOS. La guía 3.1.1 de la App
              Store prohíbe enlazar a mecanismos de pago externos para contenido
              digital, y "gestiona tu plan" es justo eso: es un motivo de rechazo
              clásico. Las entradas de eventos sí se pueden cobrar por fuera (son
              un servicio del mundo real, 3.1.3(e)), así que esa parte se queda.
              En iOS los planes se gestionan desde franky.es. */}
          {Platform.OS === 'web' ? (
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.xxl, gap: 12, borderTopWidth: 0.5, borderTopColor: C.borderLight, marginTop: S.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Settings2 size={19} color={C.muted} strokeWidth={1.75} style={{ marginTop: 2 }} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, lineHeight: 19 }]}>
                  Cambia la tarjeta, descarga facturas antiguas o cancela tu plan desde el portal
                  seguro de Stripe.
                </Text>
              </View>
              <Btn full small variant="ghost" busy={busy} label="Gestionar mi plan y pagos" onPress={portal} />
            </View>
          ) : (
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.xxl, gap: 6, borderTopWidth: 0.5, borderTopColor: C.borderLight, marginTop: S.lg }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Tus facturas, aquí</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { lineHeight: 16 }]}>
                Toca cualquier factura para verla y descargar su PDF.
              </Text>
            </View>
          )}
          <View style={{ height: S.xl }} />
        </View>
      )}
    </Screen>
  );
}
