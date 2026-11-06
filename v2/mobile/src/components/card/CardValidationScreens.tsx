import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Image } from 'expo-image';
import { CardScreen as Screen } from './CardUi';
import { Btn, Pill } from '@/components/ui';
import { CardSurface as Card } from './CardUi';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { CardAccount, CardField, CardLoading, CardNotice } from './CardUi';
import { PrivateCardFace, useCardPhoto } from './CardPersonalScreens';
import { useCardState } from './useCardState';
import { useCardPrivacy } from './useCardPrivacy';
import { cardRpc, cardCampaignConditions, cardCode, cardMoney, cardSecondsRemaining, CARD_REQUEST_LABELS, type CardCredential } from '@/lib/franky-card';
import { cardApi, privateCardPhotoUrl } from '@/lib/franky-card-api';
import type { SessionIdentity } from '@/lib/session';
import { C, F, FONT } from '@/theme';

export function CardPresentScreen() { return <CardAccount title="Presentar Card">{owner => <Present owner={owner} />}</CardAccount>; }
function Present({ owner }: { owner: SessionIdentity }) {
  useCardPrivacy(); const router = useRouter(); const { width } = useWindowDimensions();
  const loader = useCallback((signal: AbortSignal) => cardRpc('get_franky_card', {}, owner, signal), [owner]); const state = useCardState(owner, loader, true);
  const [credential, setCredential] = useState<CardCredential | null>(null); const [now, setNow] = useState(Date.now()); const focused = useRef(false);
  const photo = useCardPhoto(owner, state.data?.profile?.photo_path);
  useFocusEffect(useCallback(() => { focused.current = true; const tick = setInterval(() => setNow(Date.now()), 500); const app = AppState.addEventListener('change', value => { if (value !== 'active') setCredential(null); }); return () => { focused.current = false; setCredential(null); clearInterval(tick); app.remove(); }; }, []));
  const remaining = credential ? cardSecondsRemaining(credential.expires_at, now) : 0;
  const generate = () => state.act(async signal => { setCredential(null); const result = await cardRpc('issue_franky_card_credential', { p_kind: 'temporary' }, owner, signal); cardCode(result.token); if (state.current() && focused.current && !signal.aborted && AppState.currentState === 'active') { setNow(Date.now()); setCredential(result); } }, undefined, false);
  return <Screen title="Presentar en comercio" back><View style={{ gap: 18 }}><CardNotice error text={state.error} onRetry={() => void state.load()} />{state.loading && !state.data ? <CardLoading /> : null}{state.data ? <>
    {state.data.demo ? <Pill label="Demo aislada · sin consumo real" tone="orange" /> : null}
    <PrivateCardFace profile={state.data.profile} membership={state.data.membership} photo={photo} minimal />
    <Card style={{ gap: 16, alignItems: 'center' }}>{credential && remaining > 0 ? <><View style={{ padding: 15, borderRadius: 18, backgroundColor: '#FFFFFF' }}><QRCode value={cardCode(credential.token)} size={Math.max(140, Math.min(240, width - 110))} color="#121019" backgroundColor="#FFFFFF" /></View><Text accessibilityLiveRegion="polite" style={F.body}>Código válido durante {remaining} segundos</Text></> : <Text style={F.body}>{credential ? 'El código ha caducado.' : 'Genera un código sólo cuando estés en el comercio.'}</Text>}<Btn label={credential ? 'Generar otro código' : 'Mostrar código temporal'} busy={state.busy} disabled={!state.data.enabled || !state.data.profile} onPress={() => void generate()} /></Card>
    <Text style={F.small}>Este código no cobra, no registra ahorro y no añade sellos. Revisa y confirma después el comercio, los conceptos y el importe. Tus estudios permanecen privados.</Text>
    {state.data.pending_requests.map(request => <Card key={request.id} style={{ gap: 10 }}><Text style={F.h3}>{request.venue_name}</Text><Text style={F.small}>{CARD_REQUEST_LABELS[request.status]}</Text><Btn label="Revisar solicitud" onPress={() => { setCredential(null); router.push({ pathname: '/card-operacion', params: { id: request.id } }); }} /></Card>)}
    {!state.data.profile ? <Btn label="Completar identidad privada" variant="secondary" onPress={() => router.push('/card-perfil')} /> : null}
  </> : null}</View></Screen>;
}

export function CardOperationScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CardAccount title="Confirmar operación">{owner => id && /^[0-9a-f-]{36}$/i.test(id) ? <Operation key={id} owner={owner} id={id} /> : <Screen title="Operación no disponible" back><Text style={F.small}>Abre el comprobante desde tu tarjeta o la recepción del comercio.</Text></Screen>}</CardAccount>;
}
function Operation({ owner, id }: { owner: SessionIdentity; id: string }) {
  useCardPrivacy(); const workspace = useWorkspace(); const router = useRouter();
  const loader = useCallback((signal: AbortSignal) => cardRpc('get_franky_card_request', { p_request_id: id }, owner, signal), [owner, id]); const state = useCardState(owner, loader, true);
  const [receipt, setReceipt] = useState(''); const [now, setNow] = useState(Date.now()); const [photo, setPhoto] = useState<string | null>(null);
  const operation = state.data;
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  useFocusEffect(useCallback(() => {
    let controller = new AbortController();
    const loadPhoto = () => { controller.abort(); controller = new AbortController(); const signal = controller.signal; setPhoto(null); if (AppState.currentState !== 'active' || operation?.actor !== 'merchant' || !operation.identity?.photo_path || operation.organization_id !== workspace.active?.id) return; void cardApi<{ url: string }>('media', owner, undefined, signal, 'operation=' + encodeURIComponent(id)).then(result => { if (state.current() && !signal.aborted) setPhoto(privateCardPhotoUrl(result.url)); }).catch(() => {}); };
    loadPhoto(); const app = AppState.addEventListener('change', status => { if (status === 'active') loadPhoto(); else { controller.abort(); setPhoto(null); } }); const interval = setInterval(loadPhoto, 90000);
    return () => { controller.abort(); app.remove(); clearInterval(interval); setPhoto(null); };
  }, [owner, id, operation?.actor, operation?.identity?.photo_path, operation?.organization_id, workspace.active?.id, state.current]));
  const merchant = operation?.actor === 'merchant'; const protectedBooking = operation?.kind === 'protected'; const effectiveReference = protectedBooking ? operation?.expected_external_reference ?? '' : receipt.trim();
  const inScope = !merchant || !!workspace.active && operation?.organization_id === workspace.active.id && workspace.isCurrent(workspace.active.id);
  const remaining = operation ? cardSecondsRemaining(operation.expires_at, now) : 0;
  const pending = operation && ['pending', 'customer_confirmed'].includes(operation.status) && remaining > 0;
  const confirm = () => state.act(signal => cardRpc('respond_franky_card_request', { p_request_id: id, p_action: 'confirm', p_external_reference: merchant ? effectiveReference : null }, owner, signal), merchant ? 'Comprobamos el resultado del consumo. El comprobante determina si ya quedó registrado.' : 'Confirmación enviada. Falta que el comercio confirme el consumo.');
  return <Screen title={merchant ? 'Confirmar en recepción' : 'Revisar operación'} back><View style={{ gap: 17 }}>{state.loading && !operation ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} /><CardNotice text={state.notice} />{operation && inScope ? <>
    {operation.demo ? <Pill label="Operación demo · no es un consumo real" tone="orange" /> : null}<Text style={F.h1}>{operation.venue_name}</Text><Pill label={CARD_REQUEST_LABELS[operation.status]} tone={operation.status === 'completed' ? 'green' : 'blue'} />
    <Text style={F.small}>{operation.kind === 'protected' ? 'Precio protegido de tu reserva' : operation.kind === 'discount' ? 'Descuento de Franky Card' : operation.kind === 'loyalty' ? 'Consumo para sellos del comercio' : 'Uso de una recompensa del comercio'}</Text>
    {operation.identity ? <Card style={{ gap: 10, flexDirection: 'row', alignItems: 'center' }}>{photo ? <Image source={{ uri: photo }} cachePolicy="none" style={{ width: 57, height: 70, borderRadius: 14 }} accessibilityLabel="Foto privada para comprobación presencial" /> : null}<View style={{ flex: 1 }}><Text style={F.h3}>{operation.identity.full_name.split(/\s+/).slice(0, 2).join(' ')}</Text><Text style={F.small}>Identidad autorizada para esta operación</Text></View></Card> : merchant ? <CardNotice text="Los datos mínimos del titular se muestran después de que confirme esta operación." /> : null}
    <Card style={{ gap: 13 }}>{operation.lines.map(line => <View key={line.id} style={{ gap: 5 }}><Text style={F.h3}>{line.label}{line.reversed ? ' · revertido' : ''}</Text><Text style={F.small}>Ordinario: {cardMoney(line.gross_cents)} · Precio público comparable: {cardMoney(line.public_price_cents)}</Text><Text style={F.body}>Final: {cardMoney(line.final_cents)}</Text></View>)}<View style={{ borderTopWidth: 1, borderColor: C.border, paddingTop: 14, gap: 8 }}><Text style={F.body}>Ventaja aplicada: {cardMoney(operation.money.discount_cents)}</Text><Text style={F.h2}>A pagar al comercio: {cardMoney(operation.money.final_cents)}</Text><Text style={F.small}>Ahorro adicional de Card: {cardMoney(operation.money.incremental_savings_cents)}</Text></View></Card>
    {operation.offer ? <Text style={F.small}>{operation.offer.title}: {[operation.offer.terms, ...cardCampaignConditions(operation.offer)].join(' · ')}</Text> : null}{operation.program ? <Text style={F.small}>{operation.program.title}: {operation.program.terms}</Text> : null}
    <Text style={F.small}>El comercio cobra por su método habitual. Confirmar esta operación no realiza un pago bancario. Un servicio gratuito no añade nuevos sellos.</Text>
    {pending ? <><Text style={F.small}>La solicitud caduca en {remaining} segundos.</Text>{merchant ? <>{protectedBooking ? <CardNotice text="La referencia de esta reserva se incorpora automáticamente. Su precio procede de la reserva aceptada y no se puede editar aquí." /> : <CardField label="Referencia del recibo o reserva" value={receipt} maxLength={100} onChangeText={setReceipt} autoCapitalize="none" placeholder="Referencia única, sin nombre ni teléfono" />}<Text style={F.small}>No uses datos personales. La misma referencia no puede generar otro consumo.</Text><Btn label="Confirmar consumo y ventaja" busy={state.busy} disabled={!operation.customer_confirmed || effectiveReference.length < 3} onPress={() => void confirm()} /></> : <Btn label="Acepto el comercio y el importe" busy={state.busy} disabled={operation.customer_confirmed} onPress={() => void confirm()} />}<Btn label="Rechazar esta solicitud" variant="ghost" busy={state.busy} onPress={() => void state.act(signal => cardRpc('respond_franky_card_request', { p_request_id: id, p_action: 'reject' }, owner, signal), 'Solicitud rechazada.')} /></> : operation.status !== 'completed' ? <CardNotice text="Esta solicitud ya no puede confirmarse. Inicia una nueva si necesitas atender el consumo." /> : <CardNotice text="Consumo confirmado una sola vez. Sus ajustes y devoluciones se conservan en el historial." />}
    {!merchant ? <Btn label="Ver mi tarjeta y sellos" variant="secondary" onPress={() => router.replace('/franky-card')} /> : null}
  </> : operation ? <CardNotice error text="Esta operación pertenece a otro espacio. Ábrela desde su recepción autorizada." /> : null}</View></Screen>;
}
