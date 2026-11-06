import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Switch, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Camera, CreditCard, Gift, ShieldCheck, UserRound } from 'lucide-react-native';
import { CardScreen as Screen } from './CardUi';
import { Btn, Pill } from '@/components/ui';
import { CardSurface as Card, CardChip as Chip } from './CardUi';
import { CardAccount, CardField, CardFigure, CardLoading, CardNotice } from './CardUi';
import { useCardState } from './useCardState';
import { cardRpc, cardCampaignConditions, cardMoney, cardDate, CARD_MEMBERSHIP_LABELS, CARD_REQUEST_LABELS, type CardProfile, type CardPersonal, type CardOffer, type CardConsumption, type CardCheckout } from '@/lib/franky-card';
import { WEB_URL } from '@/lib/supabase';
import { cardApi, getCardPhoto, uploadCardPhoto, checkoutCard, cardWalletUrl, type CardProviderConfig } from '@/lib/franky-card-api';
import type { SessionIdentity } from '@/lib/session';
import { useOwnerGuard } from '@/lib/useSessionOwner';
import { newTapKey } from '@/lib/tap';
import { C, F, FONT } from '@/theme';
import { CardPitch } from './CardPitch';

export function useCardPhoto(owner: SessionIdentity, path: string | null | undefined) {
  const current = useOwnerGuard(owner); const [uri, setUri] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let controller = new AbortController(); setUri(null);
    const load = async () => { controller.abort(); controller = new AbortController(); const signal = controller.signal; if (!path || AppState.currentState !== 'active') return; try { const result = await getCardPhoto(owner, path, signal); if (current() && !signal.aborted && AppState.currentState === 'active') setUri(result); } catch { if (current() && !signal.aborted) setUri(null); } };
    void load(); const interval = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 90_000);
    const app = AppState.addEventListener('change', state => { if (state !== 'active') { controller.abort(); setUri(null); } else void load(); });
    return () => { controller.abort(); clearInterval(interval); app.remove(); setUri(null); };
  }, [owner, path, current]));
  return uri;
}

export function PrivateCardFace({ profile, membership, photo, minimal = false }: { profile: CardProfile | null; membership: CardPersonal['membership']; photo: string | null; minimal?: boolean }) {
  const name = profile?.full_name?.trim() || 'Completa tu identidad Card';
  const minimumName = name.split(/\s+/).slice(0, 2).join(' ');
  return <View style={{ backgroundColor: C.blue, borderRadius: 25, padding: 23, gap: 23 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><Text style={{ color: C.onAccent, fontFamily: FONT.display, fontSize: 29 }}>franky</Text><Text style={{ color: C.onAccent, fontFamily: FONT.medium, fontSize: 12 }}>FRANKY CARD</Text></View>
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>{photo ? <Image source={{ uri: photo }} cachePolicy="none" style={{ width: 65, height: 80, borderRadius: 15 }} accessibilityLabel="Tu fotografía privada de Card" /> : <View style={{ width: 65, height: 80, borderRadius: 15, backgroundColor: C.accentSoft, justifyContent: 'center', alignItems: 'center' }}><UserRound size={31} color={C.blue} /></View>}<View style={{ flex: 1, gap: 5 }}><Text style={{ color: C.onAccent, fontFamily: FONT.semibold, fontSize: 19 }}>{minimal ? minimumName : name}</Text>{!minimal && profile?.university ? <Text style={{ color: C.onAccent, fontSize: 12 }}>{profile.university}</Text> : null}{!minimal && profile?.studies ? <Text style={{ color: C.onAccent, fontSize: 12 }}>{profile.studies}</Text> : null}{!minimal && profile?.cohort_year ? <Text style={{ color: C.onAccent, fontSize: 12 }}>Promoción de entrada {profile.cohort_year}</Text> : null}</View></View>
    <View style={{ gap: 5 }}><Text style={{ color: C.onAccent, fontFamily: FONT.semibold, fontSize: 14 }}>{CARD_MEMBERSHIP_LABELS[membership.status]}</Text>{membership.ends_at ? <Text style={{ color: C.onAccent, fontSize: 12 }}>Vigencia hasta {cardDate(membership.ends_at)}</Text> : null}</View>
  </View>;
}

export function FrankyCardScreen() { return <CardAccount title="Franky Card">{owner => <CardHome owner={owner} />}</CardAccount>; }
function CardOrderStatus({ owner, order }: { owner: SessionIdentity; order: string }) {
  const loader = useCallback((signal: AbortSignal) => cardApi<CardCheckout>('checkout', owner, undefined, signal, `order=${encodeURIComponent(order)}`), [owner, order]); const state = useCardState(owner, loader, true);
  const labels: Record<CardCheckout['status'], string> = { failed: 'El proveedor no ha confirmado el pago. Comprueba el pedido antes de repetirlo.', expired: 'El plazo para completar esta compra ha terminado.', cancelled: 'El proveedor ha confirmado la cancelación de esta compra.', review: 'El pago requiere revisión. No inicies otra compra mientras comprobamos este pedido.', created: 'La compra está preparada, pendiente de confirmación.', checkout: 'La compra sigue en el proveedor. No se considera pagada todavía.', pending: 'Esperamos la confirmación del proveedor.', paid: 'Compra confirmada por el proveedor. La membresía se actualiza desde el servidor.', refunded: 'La anualidad ha sido reembolsada. Tu historial y recompensas permanecen disponibles.', disputed: 'El pago está en revisión. Consulta el estado de tu membresía.' };
  return <Card style={{ gap: 10 }}><Text style={F.h3}>Estado de tu compra</Text><CardNotice text={state.data ? labels[state.data.status] : 'Comprobando el pedido; un fallo de red no indica una cancelación.'} /><CardNotice error text={state.error} onRetry={() => void state.load()} /><Btn label="Comprobar de nuevo" small variant="secondary" busy={state.loading} onPress={() => void state.load()} /></Card>;
}
function CardHome({ owner }: { owner: SessionIdentity }) {
  const { order } = useLocalSearchParams<{ order?: string }>();
  const router = useRouter(); const loader = useCallback((signal: AbortSignal) => cardRpc('get_franky_card', {}, owner, signal), [owner]); const state = useCardState(owner, loader, true);
  const data = state.data; const photo = useCardPhoto(owner, data?.profile?.photo_path);
  return <Screen title="Mi Franky Card" back refreshing={state.loading && !!data} onRefresh={() => void state.load()}><View style={{ gap: 18 }}>
    {order && /^[0-9a-f-]{36}$/i.test(order) ? <CardOrderStatus owner={owner} order={order} /> : null}
    {state.loading && !data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} />
    {data && !data.enabled ? <Card><Text style={F.h3}>Estamos preparando la red</Text><Text style={[F.small, { marginTop: 8 }]}>Todavía no puedes activar Card en tu cuenta. Tu experiencia habitual de Franky sigue disponible.</Text></Card> : data ? <>
      {data.demo ? <Pill label="Demostración · sin compras ni consumos reales" tone="orange" /> : null}
      {data.membership.status !== 'active' ? <CardPitch owner={owner} pricing={data.pricing} /> : null}
      <PrivateCardFace profile={data.profile} membership={data.membership} photo={photo} />
      {data.profile?.student_verified_until && Date.parse(data.profile.student_verified_until) > Date.now() ? <Pill label={`Estudiante verificado hasta ${cardDate(data.profile.student_verified_until)}`} icon={ShieldCheck} tone="green" /> : data.profile?.university ? <Text style={F.small}>Tus estudios son datos declarados. No acreditan matrícula vigente.</Text> : null}
      <Btn label="Presentar en el comercio" icon={CreditCard} onPress={() => router.push('/card-presentar')} disabled={!data.profile} />
      <CardNotice text="El código también sirve para sellos y premios del comercio con tu cuenta gratuita. Una Card caducada no elimina lo que ya has ganado." />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><CardFigure label="Ahorro registrado" value={cardMoney(data.savings.recorded_cents)} note="Consumos declarados por los comercios, con sus ajustes." /><CardFigure label="Balance del periodo" value={cardMoney(data.savings.balance_cents)} note={`Cuota pagada: ${cardMoney(data.savings.membership_cost_cents)}.`} /></View>
      <Btn label="Descubrir ventajas" variant="secondary" onPress={() => router.push('/card-ventajas')} /><Btn label="Reservar citas y servicios" variant="secondary" onPress={() => router.push('/card-negocios')} /><Btn label="Mis citas y reservas" variant="ghost" onPress={() => router.push('/card-mis-reservas')} />
      {data.pending_requests.length ? <View style={{ gap: 10 }}><Text style={F.h2}>Por confirmar</Text>{data.pending_requests.map(request => <Card key={request.id} onPress={() => router.push({ pathname: '/card-operacion', params: { id: request.id } })} style={{ gap: 8 }}><Text style={F.h3}>{request.venue_name}</Text><Text style={F.small}>{CARD_REQUEST_LABELS[request.status]} · {cardMoney(request.money.final_cents)}</Text><Text style={F.small}>Revisa comercio, conceptos e importe antes de aceptar.</Text></Card>)}</View> : null}
      <View style={{ gap: 12 }}><Text style={F.h2}>Tus sellos y recompensas</Text>{data.loyalty.length ? data.loyalty.map(balance => <Card key={balance.program.id} style={{ gap: 9 }}><Text style={F.h3}>{balance.program.title}</Text><Text style={F.body}>{balance.progress} de {balance.program.required_stamps} sellos · {balance.available_rewards} premios disponibles</Text><Text style={F.small}>Premio: {balance.program.reward_label}</Text><Text style={F.small}>{balance.program.terms}</Text><Text style={F.small}>Un servicio gratuito no genera otro sello.</Text>{balance.available_rewards > 0 ? <Btn icon={Gift} label="Presentar mi recompensa" variant="secondary" onPress={() => router.push('/card-presentar')} /> : null}</Card>) : <Text style={F.small}>Los sellos aparecerán cuando confirmes un consumo elegible en un negocio con programa activo. No necesitas pagar Card.</Text>}</View>
      <Btn label="Historial y comprobantes" variant="secondary" onPress={() => router.push('/card-historial')} /><Btn label="Datos privados de mi tarjeta" variant="ghost" onPress={() => router.push('/card-perfil')} /><Btn label="Plan anual y Wallet" variant="ghost" onPress={() => router.push('/card-planes')} />
    </> : null}
  </View></Screen>;
}

export function CardProfileScreen() { return <CardAccount title="Identidad Card">{owner => <CardProfileEditor owner={owner} />}</CardAccount>; }
function CardProfileEditor({ owner }: { owner: SessionIdentity }) {
  const loader = useCallback((signal: AbortSignal) => cardRpc('get_franky_card', {}, owner, signal), [owner]); const state = useCardState(owner, loader);
  const [draft, setDraft] = useState<Omit<CardProfile, 'student_verified_until'>>({ full_name: '', photo_path: null, university: null, studies: null, cohort_year: null, academic_visibility: false }); const [cohort, setCohort] = useState('');
  const loaded = useRef(false); const photo = useCardPhoto(owner, draft.photo_path);
  useEffect(() => { if (state.data?.profile && !loaded.current) { loaded.current = true; setDraft(state.data.profile); setCohort(state.data.profile.cohort_year?.toString() ?? ''); } }, [state.data]);
  const choosePhoto = () => state.act(async signal => {
    const access = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!state.current() || signal.aborted) return;
    if (!access.granted) throw new Error('card_photo_permission');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.85, exif: false }); if (!state.current() || signal.aborted || result.canceled) return;
    const upload = await uploadCardPhoto(owner, result.assets[0], signal); if (state.current() && !signal.aborted) setDraft(previous => ({ ...previous, photo_path: upload.path }));
  }, 'Foto preparada. Guarda tus datos para aplicarla a la tarjeta.');
  const validCohort = !cohort || /^\d{4}$/.test(cohort) && Number(cohort) >= 1950 && Number(cohort) <= new Date().getFullYear() + 1;
  return <Screen title="Datos privados de Card" back><View style={{ gap: 17 }}>{state.loading && !state.data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} /><CardNotice text={state.notice} />
    <Text style={F.small}>Esta identidad es independiente de tu alias social y FOMO. El comercio sólo ve los datos mínimos tras tu confirmación; nunca tu carrera o promoción.</Text>
    {photo ? <Image source={{ uri: photo }} cachePolicy="none" style={{ width: 100, height: 125, borderRadius: 20 }} accessibilityLabel="Foto privada seleccionada" /> : null}<Btn icon={Camera} label="Elegir foto privada" variant="secondary" busy={state.busy} onPress={() => void choosePhoto()} />
    <CardField label="Nombre completo" value={draft.full_name} maxLength={120} autoComplete="name" onChangeText={full_name => setDraft(d => ({ ...d, full_name }))} />
    <CardField label="Universidad (opcional)" value={draft.university ?? ''} maxLength={180} onChangeText={university => setDraft(d => ({ ...d, university: university || null }))} />
    <CardField label="Estudios (opcional)" value={draft.studies ?? ''} maxLength={180} onChangeText={studies => setDraft(d => ({ ...d, studies: studies || null }))} />
    <CardField label="Año de entrada (opcional)" value={cohort} maxLength={4} keyboardType="number-pad" onChangeText={setCohort} />
    {!validCohort ? <CardNotice error text="Escribe un año de entrada válido." /> : null}
    <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}><Text style={[F.body, { flex: 1 }]}>Mostrar mis datos académicos en Wallet, cuando esté disponible</Text><Switch accessibilityLabel="Mostrar datos académicos en Wallet" value={draft.academic_visibility} onValueChange={academic_visibility => setDraft(d => ({ ...d, academic_visibility }))} /></View>
    <Btn label="Guardar identidad Card" busy={state.busy} disabled={!state.data?.enabled || draft.full_name.trim().length < 3 || !validCohort} onPress={() => void state.act(signal => cardRpc('save_franky_card_profile', { p_profile: { full_name: draft.full_name.trim(), photo_path: draft.photo_path, university: draft.university, studies: draft.studies, cohort_year: cohort ? Number(cohort) : null, academic_visibility: draft.academic_visibility } }, owner, signal), 'Identidad privada guardada.')} />
    <Text style={F.small}>La verificación universitaria se concede mediante una comprobación independiente. Añadir estos datos no la concede.</Text>
  </View></Screen>;
}

export function CardOffersScreen() { return <CardAccount title="Ventajas Card">{owner => <CardOffers owner={owner} />}</CardAccount>; }
function CardOffers({ owner }: { owner: SessionIdentity }) {
  const [city, setCity] = useState(''); const [filter, setFilter] = useState(''); const [extra, setExtra] = useState<CardOffer[]>([]); const [next, setNext] = useState<string | null>(null);
  const loader = useCallback((signal: AbortSignal) => cardRpc('list_franky_card_offers', { p_city: filter || null, p_limit: 25 }, owner, signal), [owner, filter]); const state = useCardState(owner, loader);
  useEffect(() => { setExtra([]); setNext(state.data?.next_cursor ?? null); }, [state.data]);
  const items = [...(state.data?.items ?? []), ...extra];
  return <Screen title="Ventajas disponibles" back><View style={{ gap: 16 }}><CardField label="Ciudad" value={city} maxLength={100} onChangeText={setCity} placeholder="Todas las ciudades disponibles" /><Btn label="Buscar ventajas" variant="secondary" onPress={() => setFilter(city.trim())} />{state.loading && !state.data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} />
    <Text style={F.small}>Desde un 5 % en establecimientos adheridos, según las condiciones de cada ventaja. Los sellos propios del comercio son un programa independiente.</Text>
    {!state.loading && !items.length ? <Card><Text style={F.h3}>Todavía no hay ventajas disponibles aquí</Text><Text style={[F.small, { marginTop: 8 }]}>Sólo mostramos ofertas activas para tu cuenta. No compres Card contando con establecimientos pendientes.</Text></Card> : items.map(offer => <Card key={offer.id} style={{ gap: 10 }}><Text style={F.h3}>{offer.venue_name ?? offer.organization_name ?? 'Establecimiento adherido'}</Text><Text style={F.body}>{offer.title} · {offer.percent} %</Text>{offer.city ? <Text style={F.small}>{offer.city}</Text> : null}<Text style={F.small}>{[offer.terms, ...cardCampaignConditions(offer)].join(' · ')}</Text><Text style={F.small}>Importe mínimo: {cardMoney(offer.minimum_cents)}{offer.ends_at ? ` · Hasta ${cardDate(offer.ends_at)}` : ''}</Text><Text style={F.small}>Consulta en las condiciones los servicios incluidos antes de reservar.</Text>{offer.student_only ? <Pill label="Requiere estudiante verificado" tone="blue" /> : null}{offer.minimum_age ? <Text style={F.small}>Edad mínima: {offer.minimum_age} años. La Card no acredita edad.</Text> : null}</Card>)}
    {next ? <Btn label="Ver más ventajas" variant="secondary" busy={state.busy} onPress={() => void state.act(async signal => { const page = await cardRpc('list_franky_card_offers', { p_city: filter || null, p_cursor: next, p_limit: 25 }, owner, signal); if (state.current()) { setExtra(previous => [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))]); setNext(page.next_cursor); } }, undefined, false)} /> : null}
  </View></Screen>;
}

export function CardHistoryScreen() { return <CardAccount title="Historial Card">{owner => <CardHistory owner={owner} />}</CardAccount>; }
function CardHistory({ owner }: { owner: SessionIdentity }) {
  const router = useRouter(); const [extra, setExtra] = useState<CardConsumption[]>([]); const [next, setNext] = useState<string | null>(null);
  const loader = useCallback((signal: AbortSignal) => cardRpc('get_franky_card_history', { p_limit: 30 }, owner, signal), [owner]); const state = useCardState(owner, loader);
  useEffect(() => { setExtra([]); setNext(state.data?.next_cursor ?? null); }, [state.data]);
  return <Screen title="Ahorro y comprobantes" back><View style={{ gap: 14 }}><Text style={F.small}>Consumos registrados por el comercio. Aplicar una ventaja no acredita que se haya cobrado una tarjeta bancaria. Las reversiones conservan el historial.</Text>{state.loading && !state.data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} />
    {[...(state.data?.items ?? []), ...extra].map(item => <Card key={item.id} onPress={() => router.push({ pathname: '/card-operacion', params: { id: item.request_id } })} style={{ gap: 8 }}><Text style={F.h3}>{item.venue_name}</Text><Text style={F.small}>{cardDate(item.created_at)} · {item.kind === 'reward' ? 'Recompensa' : item.kind === 'loyalty' ? 'Fidelización' : 'Ventaja Card'}</Text><Text style={F.body}>Importe final registrado: {cardMoney(item.money.final_cents)}</Text><Text style={F.small}>Ahorro Card: {cardMoney(item.money.incremental_savings_cents - item.reversed_savings_cents)}</Text>{item.reversed_savings_cents > 0 ? <Text style={F.small}>Ajuste registrado: −{cardMoney(item.reversed_savings_cents)}</Text> : null}</Card>)}
    {!state.loading && !state.error && !state.data?.items.length ? <Card><Text style={F.small}>Todavía no hay consumos confirmados. Mostrar el código o guardar una oferta no genera ahorro ni sellos.</Text></Card> : null}
    {next ? <Btn label="Cargar más" variant="secondary" busy={state.busy} onPress={() => void state.act(async signal => { const page = await cardRpc('get_franky_card_history', { p_cursor: next, p_limit: 30 }, owner, signal); if (state.current()) { setExtra(previous => [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))]); setNext(page.next_cursor); } }, undefined, false)} /> : null}
  </View></Screen>;
}

export function CardPlanScreen() { return <CardAccount title="Plan Card">{owner => <CardPlan owner={owner} />}</CardAccount>; }
function CardPlan({ owner }: { owner: SessionIdentity }) {
  const router = useRouter(); const requestId = useRef(newTapKey());
  const [accepted, setAccepted] = useState(false);
  const loader = useCallback(async (signal: AbortSignal) => { const [personal, providers] = await Promise.all([cardRpc('get_franky_card', {}, owner, signal), cardApi<CardProviderConfig>('config', owner, undefined, signal)]); return { personal, providers }; }, [owner]); const state = useCardState(owner, loader);
  const data = state.data; const quote = data?.personal.pricing.checkout_quote; const ready = !!data?.personal.enabled && data.personal.pricing.purchases_available && data.providers.checkoutEnabled && !data.personal.demo && !!quote;
  useEffect(() => { setAccepted(false); requestId.current = newTapKey(); }, [quote?.amount_cents, quote?.price_version]);
  const buy = () => state.act(async signal => { if (!accepted || !quote || !ready) return; const result = await checkoutCard(owner, requestId.current, quote, signal).catch(async error => { if (String(error?.message).includes('card_price_changed') && state.current() && !signal.aborted) { setAccepted(false); await state.load(); } throw error; }); if (!state.current() || signal.aborted) return; if (result.status === 'checkout' && result.url && !result.invalid_url) { await WebBrowser.openBrowserAsync(result.url); if (state.current()) { state.setNotice('Comprobamos la confirmación del proveedor. Cerrar el navegador no cancela ni confirma una compra.'); if (result.order_id) router.push({ pathname: '/franky-card', params: { order: result.order_id } }); } } else if (result.status === 'paid') state.setNotice('Compra confirmada por el servidor.'); else if (result.status === 'failed' || result.invalid_url) throw new Error('card_checkout_unavailable'); else state.setNotice('Tu compra sigue pendiente de confirmación. No inicies otra compra.'); });
  const wallet = (platform: 'apple' | 'google') => state.act(async signal => { const response = await cardApi<{ url: string }>('wallet', owner, { platform }, signal); const url = cardWalletUrl(response.url, platform); if (!url) throw new Error('card_wallet_unavailable'); if (state.current() && !signal.aborted) await Linking.openURL(url); });
  return <Screen title="Card anual y Wallet" back><View style={{ gap: 17 }}>{state.loading && !data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} /><CardNotice text={state.notice} />{data ? <>
    <Card style={{ gap: 12 }}><Text style={F.h2}>Ventajas presenciales durante 12 meses</Text><Text style={{ color: C.text, fontSize: 32, fontFamily: FONT.heading }}>{cardMoney(quote?.amount_cents ?? data.personal.pricing.annual_cents)} / 12 meses</Text><Text style={F.body}>Renovación: {cardMoney(data.personal.pricing.annual_cents)} al año, impuestos incluidos.</Text><Text style={F.small}>Renovación manual. No cobramos una mensualidad ni activamos renovación automática. Consulta la red y las condiciones antes de comprar.</Text><Btn label="Ver la red disponible" variant="secondary" onPress={() => router.push('/card-ventajas')} /><Btn label="Leer condiciones de Card" variant="ghost" onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/franky-card/condiciones`)} /><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Text style={[F.body, { flex: 1 }]}>He leído las condiciones y acepto el importe mostrado para 12 meses, con renovación manual</Text><Switch accessibilityLabel="Aceptar precio y condiciones Card" value={accepted} disabled={!ready} onValueChange={setAccepted} /></View><Btn label={ready ? 'Comprar anualidad Card' : 'Compras todavía no disponibles'} busy={state.busy} disabled={!ready || !accepted} onPress={() => void buy()} /></Card>
    {!ready ? <CardNotice text={data.providers.reason || 'Las compras están cerradas hasta verificar el proveedor, la red y las condiciones del servicio.'} /> : null}
    <Card style={{ gap: 12 }}><Text style={F.h2}>Tu tarjeta en Wallet</Text><Text style={F.small}>Wallet no sustituye tu confirmación de cada operación ni acredita matrícula. Necesita una identidad privada y un proveedor configurado. Tus sellos siguen disponibles con cuenta gratuita; los descuentos requieren Card vigente.</Text><Btn label={Platform.OS === 'ios' ? 'Añadir a Apple Wallet' : 'Añadir a Google Wallet'} disabled={data.personal.demo || !data.personal.enabled || !data.personal.profile || !(Platform.OS === 'ios' ? data.providers.appleWallet : data.providers.googleWallet)} variant="secondary" busy={state.busy} onPress={() => void wallet(Platform.OS === 'ios' ? 'apple' : 'google')} /></Card>
    <Btn label="Seguir con Franky gratis" variant="ghost" onPress={() => router.back()} />
  </> : null}</View></Screen>;
}
