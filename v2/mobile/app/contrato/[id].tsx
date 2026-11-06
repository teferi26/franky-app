import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Switch, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Btn, Card, Pill } from '@/components/ui';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { contractRequest, shareContractPdf } from '@/lib/workspace-contracts';
import { getContractPayments, payContractRent, type RentPayment, type RentPaymentResult } from '@/lib/rent-payments';
import { CONTRACT_STEPS, LEGAL_DISCLAIMER, SIGNATURE_CONSENT, type ContractAnswers } from '../../../shared/contracts';
import { CONTRACT_STATUS } from '../../../shared/housing-operations';
import { C, F } from '@/theme';

type Signer = { id: string; user_id: string; role: string; status: string; full_name: string | null; signed_at: string | null };
type Detail = { contract: { id: string; title: string | null; accommodation_title: string; answers: ContractAnswers; status: string; rent_cents: number | null; deposit_cents: number | null; content_sha256: string | null }; signers: Signer[]; my_signer: Signer | null; is_owner: boolean };
const euros = (value: number | null) => `${((value ?? 0) / 100).toFixed(2).replace('.', ',')} €`;
const paymentLabels: Record<string, string> = { pending: 'Confirmación pendiente', succeeded: 'Pagado', partially_refunded: 'Devolución parcial', refunded: 'Devuelto', failed: 'No completado', cancelled: 'Cancelado', canceled: 'Cancelado' };
export default function ContractPage() {
  const owner = useSessionOwner(), router = useRouter(), { id } = useLocalSearchParams<{ id?: string }>();
  if (!owner) return <Screen title="Contrato" back pad><Text style={F.body}>Inicia sesión con la cuenta designada como firmante.</Text><Btn label="Iniciar sesión" onPress={() => router.push('/welcome')} /></Screen>;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return <Screen title="Contrato" back pad><Text style={F.body}>Este enlace no corresponde a un contrato.</Text></Screen>;
  return <ContractDocument key={`${owner.userId}:${owner.generation}:${id}`} id={id} owner={owner} />;
}
function ContractDocument({ id, owner }: { id: string; owner: SessionIdentity }) {
  const current = useOwnerGuard(owner), router = useRouter(), lock = useRef(false), sequence = useRef(0), reviewedHash = useRef<string | null | undefined>(undefined);
  const [data, setData] = useState<Detail | null>(null), [history, setHistory] = useState<RentPayment[]>([]), [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [accepted, setAccepted] = useState(false), [reviewedPdf, setReviewedPdf] = useState(false), [payment, setPayment] = useState<RentPaymentResult | null>(null);
  const load = useCallback(async () => {
    const version = ++sequence.current; setLoading(true); setError('');
    try {
      const result = await contractRequest<Detail>(id, '', undefined, owner);
      if (!current() || version !== sequence.current) return;
      if (reviewedHash.current !== result.contract.content_sha256) { setAccepted(false); setReviewedPdf(false); }
      reviewedHash.current = result.contract.content_sha256; setData(result);
      try { const rows = await getContractPayments(id, owner); if (current() && version === sequence.current) { setHistory(rows); setHistoryUnavailable(false); } }
      catch { if (current() && version === sequence.current) { setHistory([]); setHistoryUnavailable(true); } }
    } catch { if (current() && version === sequence.current) { setData(null); setAccepted(false); setReviewedPdf(false); setError('No pudimos abrir el contrato. Comprueba tu conexión y que sigues designado como firmante.'); } }
    finally { if (current() && version === sequence.current) setLoading(false); }
  }, [id, owner, current]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  const run = async (work: () => Promise<void>) => {
    if (lock.current || !current()) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (err) { if (current()) { const message = err instanceof Error ? err.message : ''; setError(/session_changed|session_required|request_cancelled/.test(message) ? 'La sesión ha cambiado. Abre el documento de nuevo.' : message || 'No se pudo completar la operación. Revisa la conexión.'); } }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  const sign = () => run(async () => {
    if (!data || !accepted || !reviewedPdf || !current()) return;
    await contractRequest(id, 'sign', { accept: true }, owner);
    if (current()) { setAccepted(false); setNotice('Tu firma ha quedado registrada.'); await load(); }
  });
  const pay = (kind: 'rent' | 'deposit' | 'both') => run(async () => {
    const result = await payContractRent(id, kind, owner);
    if (current()) { setPayment(result); await load(); }
  });
  const contract = data?.contract, signer = data?.my_signer;
  const canSign = !!contract && signer?.status === 'pending' && ['sent', 'partially_signed'].includes(contract.status);
  const canPay = contract?.status === 'fully_signed' && signer?.role === 'tenant' && signer.status === 'signed';
  const alreadyPaid = (kind: 'rent' | 'deposit') => history.some(row => ['succeeded', 'partially_refunded'].includes(row.status) && [kind, 'both'].includes(row.metadata?.kind ?? ''));
  return <Screen title="Contrato de alquiler" back pad refreshing={loading} onRefresh={() => void load()}>
    {!!error && <Card style={{ gap: 12, marginBottom: 18 }}><Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text><Btn label="Actualizar contrato" variant="secondary" onPress={() => void load()} /></Card>}{!!notice && <Text accessibilityRole="alert" style={{ color: C.green, marginBottom: 18 }}>{notice}</Text>}
    {loading && !data ? <ActivityIndicator color={C.blue} /> : contract && <>
      <Text style={[F.h2, { marginBottom: 12 }]}>{contract.title || contract.accommodation_title || 'Tu contrato'}</Text><Pill label={CONTRACT_STATUS[contract.status] ?? 'Contrato'} />
      <Card style={{ gap: 14, marginVertical: 20 }}><Text style={F.h3}>Documento completo</Text><Text style={F.small}>Revisa el PDF completo antes de firmar. El resumen de datos que aparece debajo sirve para localizar las condiciones principales.</Text><Btn label="Revisar o guardar PDF" variant="secondary" busy={busy} onPress={() => void run(async () => { await shareContractPdf(id, owner); if (current()) setReviewedPdf(true); })} /><Text style={F.small}>{LEGAL_DISCLAIMER}</Text></Card>
      <Card style={{ gap: 14, marginBottom: 20 }}><Text style={F.h3}>Firmantes</Text>{data?.signers.map(person => <View key={person.id} style={{ gap: 5 }}><Text style={F.body}>{person.full_name || 'Firmante'}{person.user_id === owner.userId ? ' (tú)' : ''} · {person.role === 'owner' ? 'Arrendador' : 'Inquilino'}</Text><Text style={F.small}>{person.status === 'signed' ? 'Firma registrada' : 'Firma pendiente'}{person.signed_at ? ` · ${new Date(person.signed_at).toLocaleDateString('es-ES')}` : ''}</Text></View>)}
        {canSign && <><Text style={F.small}>{reviewedPdf ? 'Confirma que has revisado el documento completo.' : 'Primero abre el PDF completo para revisar las condiciones.'}</Text><View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}><Switch accessibilityLabel="He leído el contrato y acepto firmarlo" value={accepted} onValueChange={setAccepted} disabled={busy || !reviewedPdf} /><Text style={[F.small, { flex: 1 }]}>{SIGNATURE_CONSENT}</Text></View><Btn label="Firmar este documento" busy={busy} disabled={!accepted || !reviewedPdf} onPress={() => Alert.alert('Confirmar firma', 'Tu firma quedará vinculada al documento revisado y a tu cuenta.', [{ text: 'Volver', style: 'cancel' }, { text: 'Firmar', onPress: () => void sign() }])} /></>}
      </Card>
      {canPay && <Card style={{ gap: 12, marginBottom: 20 }}><Text style={F.h3}>Pago del contrato</Text><Text style={F.body}>Renta: {euros(contract.rent_cents)} · Fianza: {euros(contract.deposit_cents)}</Text><Text style={F.small}>Elige el importe acordado que vas a pagar. Este pago no activa una domiciliación periódica.</Text>{historyUnavailable ? <Text style={{ color: C.errorText }}>No se pudo comprobar tu historial de pagos. Actualiza antes de iniciar otro.</Text> : <>{(contract.rent_cents ?? 0) > 0 && !alreadyPaid('rent') && <Btn label={`Pagar renta · ${euros(contract.rent_cents)}`} variant="secondary" busy={busy} onPress={() => void pay('rent')} />}{(contract.deposit_cents ?? 0) > 0 && !alreadyPaid('deposit') && <Btn label={`Pagar fianza · ${euros(contract.deposit_cents)}`} variant="secondary" busy={busy} onPress={() => void pay('deposit')} />}{(contract.rent_cents ?? 0) > 0 && (contract.deposit_cents ?? 0) > 0 && !alreadyPaid('rent') && !alreadyPaid('deposit') && <Btn label={`Pagar ambos · ${euros((contract.rent_cents ?? 0) + (contract.deposit_cents ?? 0))}`} busy={busy} onPress={() => void pay('both')} />}{alreadyPaid('rent') && <Text style={F.small}>Renta del contrato registrada como pagada.</Text>}{alreadyPaid('deposit') && <Text style={F.small}>Fianza registrada como pagada.</Text>}</>}
        {payment && <><Text accessibilityRole="alert" style={F.body}>{payment.status === 'paid' ? 'El servidor ha confirmado el pago.' : payment.status === 'pending' ? 'Confirmación pendiente. Revisa el estado antes de iniciar otro pago.' : payment.message || 'Este pago no se ha completado. Consulta su estado antes de reintentarlo.'}</Text>{payment.orderId && <Btn label="Comprobar estado del pago" variant="secondary" onPress={() => router.push({ pathname: '/pago-retorno', params: { order_id: payment.orderId } })} />}</>}
      </Card>}
      {!!history.length && <Card style={{ gap: 14, marginBottom: 20 }}><Text style={F.h3}>Tus últimos 30 pagos del contrato</Text>{history.map(row => <View key={row.id} style={{ gap: 5 }}><Text style={F.body}>{row.metadata?.kind === 'both' ? 'Renta y fianza' : row.metadata?.kind === 'deposit' ? 'Fianza' : 'Renta'} · {euros(row.amount_cents)}</Text><Text style={F.small}>{paymentLabels[row.status] ?? 'En comprobación'} · {new Date(row.created_at).toLocaleDateString('es-ES')}{row.refunded_cents > 0 ? ` · Devuelto: ${euros(row.refunded_cents)}` : ''}</Text><Btn label="Ver estado" small variant="secondary" onPress={() => router.push({ pathname: '/pago-retorno', params: { order_id: row.id } })} /></View>)}</Card>}
      {CONTRACT_STEPS.map(step => { const fields = step.fields.filter(field => (!field.showIf || contract.answers[field.showIf.key] === field.showIf.equals) && contract.answers[field.key] != null && contract.answers[field.key] !== ''); if (!fields.length) return null; return <Card key={step.id} style={{ gap: 12, marginBottom: 16 }}><Text style={F.h3}>{step.title}</Text>{fields.map(field => { const value = contract.answers[field.key]; const label = field.type === 'boolean' ? value ? 'Sí' : 'No' : field.options?.find(option => option.value === value)?.label ?? String(value); return <View key={field.key} style={{ gap: 4 }}><Text style={F.small}>{field.label}</Text><Text selectable style={F.body}>{label}{field.suffix ? ` ${field.suffix}` : ''}</Text></View>; })}</Card>; })}
    </>}
  </Screen>;
}
