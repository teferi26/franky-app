import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';
import { resolveIncomingLink } from '../../../mobile/src/lib/native-links';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const model = nativeLoader({})('../mobile/src/lib/franky-card-model.ts');
const ORG = '11111111-1111-4111-8111-111111111111', REQUEST = '22222222-2222-4222-8222-222222222222';
const wrapper = ({ children }: any) => <div>{children}</div>;

function fixture() {
  let owner: any = { userId: 'holder-a', generation: 1 }; let workspace: any = { ready: true, active: { id: ORG }, revision: 1, isCurrent: (id: string) => workspace.active?.id === id };
  const appListeners = new Set<(state: string) => void>();
  const app = { currentState: 'active', addEventListener: (_: string, handler: (value: string) => void) => { appListeners.add(handler); return { remove: () => appListeners.delete(handler) }; } };
  let operation: any = { id: REQUEST, kind: 'discount', status: 'pending', venue_name: 'Comercio autorizado', organization_id: ORG, expires_at: new Date(Date.now() + 120000).toISOString(), lines: [{ id: 'line', label: 'Corte', gross_cents: 2000, public_price_cents: 2000, final_cents: 1800 }], money: { discount_cents: 200, final_cents: 1800, incremental_savings_cents: 200 }, customer_confirmed: false, actor: 'merchant', identity: null, demo: false };
  const personal: any = { enabled: true, demo: false, profile: { full_name: 'Ana García López', photo_path: null, university: 'Universidad privada', studies: 'Psicología privada', cohort_year: 2026 }, membership: { status: 'active', ends_at: '2027-09-23T00:00:00Z' }, pricing: { annual_cents: 1990, purchases_available: true, checkout_quote: { amount_cents: 1990, price_version: 'renewal-v1' } }, pending_requests: [], loyalty: [], savings: { recorded_cents: 0, membership_cost_cents: 1990, balance_cents: -1990 } };
  const credential = { token: 'a'.repeat(64), expires_at: new Date(Date.now() + 30000).toISOString(), kind: 'temporary', card_active: true, loyalty_available: true };
  const rpc = vi.fn(async (name: string) => name === 'get_franky_card_request' || name === 'respond_franky_card_request' ? operation : name === 'issue_franky_card_credential' ? credential : personal);
  const checkout = vi.fn(async () => ({ status: 'pending', order_id: REQUEST }));
  const providers = { checkoutEnabled: true, appleWallet: false, googleWallet: false, reason: null };
  const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
  const bindings: Record<string, any> = {
    react: { ...React, default: React }, 'react/jsx-runtime': jsx,
    'react-native': { AppState: app, View: wrapper, KeyboardAvoidingView: wrapper, Pressable: ({ children, onPress, accessibilityLabel, disabled }: any) => <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>{children}</button>, Text: ({ children, accessibilityRole }: any) => <span role={accessibilityRole}>{children}</span>, TextInput: ({ accessibilityLabel, value, onChangeText }: any) => <input aria-label={accessibilityLabel} value={value} onChange={event => onChangeText(event.target.value)} />, Switch: ({ accessibilityLabel, value, onValueChange, disabled }: any) => <input type="checkbox" aria-label={accessibilityLabel} checked={value} disabled={disabled} onChange={event => onValueChange(event.target.checked)} />, ActivityIndicator: () => <span>Loading</span>, useWindowDimensions: () => ({ width: 320 }), Linking: { openURL: vi.fn() }, Platform: { OS: 'ios' } },
    'expo-router': { useFocusEffect: (callback: any) => React.useEffect(callback, [callback]), useLocalSearchParams: () => ({ id: REQUEST }), useRouter: () => router },
    'expo-image': { Image: () => <span>Private image</span> }, 'expo-image-picker': {}, 'expo-web-browser': { openBrowserAsync: vi.fn() },
    'react-native-qrcode-svg': { default: ({ value }: any) => <span data-testid="qr">{value}</span> },
    '@/components/Screen': { Screen: wrapper }, '@/components/ui': { Card: ({ children, onPress }: any) => <div onClick={onPress}>{children}</div>, Btn: ({ label, disabled, busy, onPress }: any) => <button disabled={disabled || busy} onClick={onPress}>{label}</button>, Pill: ({ label }: any) => <span>{label}</span>, Chip: ({ label, onPress }: any) => <button onClick={onPress}>{label}</button> },
    '@/components/WorkspaceProvider': { useWorkspace: () => workspace }, '@/theme': { C: {}, F: {}, FONT: {} },
    '@/lib/useSessionOwner': { useSessionOwner: () => owner, useOwnerGuard: (expected: any) => React.useCallback(() => owner === expected, [expected]) },
    '@/lib/franky-card': { ...nativeLoader({})('../shared/franky-card.ts'), ...model, cardRpc: rpc, CARD_MEMBERSHIP_LABELS: { active: 'Card activa' }, CARD_REQUEST_LABELS: { pending: 'Pendiente', customer_confirmed: 'Pendiente del comercio', completed: 'Completado' } },
    '@/lib/franky-card-api': { cardApi: vi.fn(async () => providers), getCardPhoto: vi.fn(async () => null), uploadCardPhoto: vi.fn(), checkoutCard: checkout, cardWalletUrl: () => null, privateCardPhotoUrl: () => null },
    '@/lib/supabase': { WEB_URL: 'https://franky.es' }, '@/lib/tap': { newTapKey: () => crypto.randomUUID() },
    'lucide-react-native': Object.fromEntries(['Camera', 'CreditCard', 'Gift', 'ShieldCheck', 'UserRound'].map(key => [key, () => <span />])), './useCardPrivacy': { useCardPrivacy() {} }, './CardPitch': { CardPitch: () => null },
  };
  const load = nativeLoader(bindings, { setInterval, clearInterval });
  bindings['./CardUi'] = load('../mobile/src/components/card/CardUi.tsx');
  bindings['./useCardState'] = load('../mobile/src/components/card/useCardState.ts');
  bindings['./CardPersonalScreens'] = load('../mobile/src/components/card/CardPersonalScreens.tsx');
  bindings['./ProfessionalCustomerPicker'] = { ProfessionalCustomerPicker: (props: any) => { const Picker = load('../mobile/src/components/card/ProfessionalCustomerPicker.tsx').ProfessionalCustomerPicker; return <Picker {...props} />; } };
  bindings['./ProfessionalWaitlist'] = load('../mobile/src/components/card/ProfessionalWaitlist.tsx');
  bindings['./ProfessionalBundlePicker'] = { ProfessionalBundlePicker: () => null };
  bindings['./ProfessionalPlanState'] = { ProfessionalPlanState: (props: any) => { const Plan = load('../mobile/src/components/card/ProfessionalPlanState.tsx').ProfessionalPlanState; return <Plan {...props} />; } };
  const validation = load('../mobile/src/components/card/CardValidationScreens.tsx');
  return { ...validation, ...bindings['./CardPersonalScreens'], rpc, checkout, personal, credential, providers, router, load, bindings, owner,
    updateOperation(value: any) { operation = { ...operation, ...value }; },
    switchAccount() { owner = { userId: 'holder-b', generation: 2 }; },
    switchWorkspace() { workspace = { ...workspace, active: { id: 'other' }, revision: 2 }; },
    background() { app.currentState = 'background'; appListeners.forEach(listener => listener('background')); },
    foreground() { app.currentState = 'active'; appListeners.forEach(listener => listener('active')); },
  };
}

describe('native Card presentation boundaries', () => {
  it('updates an existing verified profile without resubmitting server-owned fields', async () => {
    const f = fixture(); Object.assign(f.personal.profile, { student_verified_until: '2027-01-01T00:00:00Z', verified_age: 21, academic_visibility: false }); render(<f.CardProfileScreen />);
    await waitFor(() => expect((screen.getByLabelText('Nombre completo') as HTMLInputElement).value).toBe('Ana García López'));
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Ana García López editada' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar identidad Card' }));
    await waitFor(() => expect(f.rpc.mock.calls.some((call: any[]) => call[0] === 'save_franky_card_profile')).toBe(true));
    const payload = f.rpc.mock.calls.find((call: any[]) => call[0] === 'save_franky_card_profile')?.[1].p_profile;
    expect(Object.keys(payload).sort()).toEqual(['full_name', 'photo_path', 'university', 'studies', 'cohort_year', 'academic_visibility'].sort());
    expect(payload.full_name).toBe('Ana García López editada'); expect(payload).not.toHaveProperty('student_verified_until'); expect(payload).not.toHaveProperty('verified_age');
  });
  it('parses decimal amounts without rounding and rejects exponent/signs', () => {
    expect(model.cardAmountCents('19,90')).toBe(1990); expect(model.cardAmountCents('0.01')).toBe(1);
    for (const input of ['1.005', '-1', '+2', '1e2', '10,00,1', '']) expect(model.cardAmountCents(input)).toBeNull();
  });
  it('only accepts opaque credentials, never identity URLs or arbitrary QR payloads', () => {
    const token = 'a'.repeat(64); expect(model.parseCardCode(model.cardCode(token))).toBe(token);
    expect(model.parseCardCode(`https://franky.es/card/${token}`)).toBeNull(); expect(model.parseCardCode('A'.repeat(64))).toBeNull();
    expect(model.cardSecondsRemaining('invalid', Date.now())).toBe(0); expect(model.cardSecondsRemaining(new Date(1000).toISOString(), 1000)).toBe(0);
  });
  it('normalizes free-form services and never renders catalog UUIDs as names', () => {
    expect(model.cardServiceKey('  Corte + Peinado  ')).toBe('corte-peinado'); expect(model.cardServiceLabel(ORG, [{ id: ORG, name: 'Clase de yoga' }])).toBe('Clase de yoga'); expect(model.cardServiceLabel(ORG, [])).not.toContain(ORG);
  });
  it('hides academic details during presentation and clears the QR on background', async () => {
    const f = fixture(); render(<f.CardPresentScreen />); await screen.findByText('Ana García'); expect(screen.queryByText('Universidad privada')).toBeNull(); expect(screen.queryByText('Psicología privada')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar código temporal' })); await screen.findByTestId('qr'); act(() => f.background()); expect(screen.queryByTestId('qr')).toBeNull();
  });
  it.each(['switchAccount', 'switchWorkspace'] as const)('discards a live credential after %s', async change => {
    const f = fixture(), page = render(<f.CardPresentScreen />); await screen.findByText('Ana García'); fireEvent.click(screen.getByRole('button', { name: 'Mostrar código temporal' })); await screen.findByTestId('qr'); f[change](); page.rerender(<f.CardPresentScreen />); expect(screen.queryByTestId('qr')).toBeNull();
  });
  it('does not display a QR already expired when the server reply arrives', async () => {
    const f = fixture(); f.credential.expires_at = new Date(Date.now() - 1).toISOString(); render(<f.CardPresentScreen />); await screen.findByText('Ana García'); fireEvent.click(screen.getByRole('button', { name: 'Mostrar código temporal' })); await screen.findByText('El código ha caducado.'); expect(screen.queryByTestId('qr')).toBeNull();
  });
});

describe('native private providers', () => {
  it('maps Card return links to an owned order lookup without trusting paid flags', async () => {
    expect(await resolveIncomingLink(`https://franky.es/franky-card/retorno?order=${REQUEST}&status=paid&activated=true`, vi.fn())).toBe(`/franky-card?order=${REQUEST}`);
    expect(await resolveIncomingLink('https://franky.es/franky-card/retorno?order=invalid', vi.fn())).toBe('/franky-card');
    expect(await resolveIncomingLink('https://franky.es/franky-card/condiciones', vi.fn())).toBe('https://franky.es/franky-card/condiciones');
  });
  function apiFixture() {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ status: 'pending', order_id: REQUEST }) }));
    const load = nativeLoader({ 'expo-file-system': { File: class {} }, './media': {}, './owned-request': { withOwnedRequest: (_owner: unknown, work: any) => work({ authorization: 'Bearer owned-session', signal: new AbortController().signal, check() {} }) }, './supabase': { WEB_URL: 'https://franky.es', SUPABASE_URL: 'https://project.supabase.co', fetchConTimeout: fetch } });
    return { ...load('../mobile/src/lib/franky-card-api.ts'), fetch };
  }
  it('accepts only the private Wallet bucket and exact official Google save endpoint', () => {
    const api = apiFixture(); expect(api.cardWalletUrl('https://project.supabase.co/storage/v1/object/sign/card-wallet/holder/card.pkpass?token=short', 'apple')).toBeTruthy();
    for (const url of ['https://evil.example/storage/v1/object/sign/card-wallet/a', 'https://project.supabase.co/storage/v1/object/public/card-wallet/a', 'https://project.supabase.co/storage/v1/object/sign/card-media/a', 'https://project.supabase.co@evil.example/storage/v1/object/sign/card-wallet/a']) expect(api.cardWalletUrl(url, 'apple')).toBeNull();
    expect(api.cardWalletUrl('https://pay.google.com/gp/v/save/token', 'google')).toBeTruthy(); expect(api.cardWalletUrl('https://pay.google.com.evil.example/gp/v/save/token', 'google')).toBeNull();
  });
  it('does not display photos outside the signed private identity bucket', () => {
    const api = apiFixture(); expect(api.privateCardPhotoUrl('https://project.supabase.co/storage/v1/object/sign/card-media/user/a.jpg?token=short')).toBeTruthy(); expect(api.privateCardPhotoUrl('https://project.supabase.co/storage/v1/object/public/card-media/user/a.jpg')).toBeNull();
  });
  it('sends the exact price and policy version accepted by the account', async () => {
    const api = apiFixture(); await api.checkoutCard({ userId: 'a', generation: 1 }, REQUEST, { amount_cents: 1990, price_version: 'annual-v2' });
    const [, request] = api.fetch.mock.calls[0] as any; expect(JSON.parse(request.body)).toEqual({ requestId: REQUEST, acceptedAmountCents: 1990, priceVersion: 'annual-v2', termsVersion: '2026-adhesion-v1' }); expect(request.headers.Authorization).toBe('Bearer owned-session');
  });
});

describe('native professional booking', () => {
  it('uses an explicit Card quote and invalidates it after the party changes', async () => {
    const f = fixture(); const slot = '2026-10-01T08:00:00Z'; const serviceId = '33333333-3333-4333-8333-333333333333';
    const catalog = { services: [{ id: serviceId, name: 'Corte de pelo', active: true, mode: 'appointment', duration_minutes: 30, price_cents: 2000, price_basis: 'booking', required_resource_ids: [], version: 7, deposit_cents: 0 }], resources: [], sessions: [], settings: { timezone: 'Europe/Madrid', terms: 'Cancelación con 24 horas.', require_approval: false } };
    const professionalRpc = vi.fn(async (name: string) => name === 'professional_get_slots' ? [slot] : { status: 'confirmed' });
    f.bindings['@/lib/workspaces'] = { workspaceRpc: professionalRpc }; f.bindings['./ProfessionalWorkspace'] = { professionalDate: (value: string) => value };
    f.rpc.mockImplementation(async (name: string) => name === 'list_franky_card_offers' ? { items: [{ id: 'offer', service_keys: [serviceId], title: 'Corte Card', percent: 10, terms: 'Una persona.' }] } : { id: 'quote', final_cents: 1800, expires_at: new Date(Date.now() + 60000).toISOString() });
    const { BookingForm } = f.load('../mobile/src/components/card/ProfessionalBooking.tsx'); const after = vi.fn(async () => {});
    render(<BookingForm owner={f.owner} organizationId={ORG} data={catalog} customer after={after} />);
    fireEvent.click(screen.getByRole('button', { name: 'Corte de pelo' })); fireEvent.change(screen.getByLabelText(/Fecha de la sede/), { target: { value: '2026-10-01' } }); fireEvent.click(screen.getByRole('button', { name: 'Consultar horarios disponibles' })); fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Corte Card · 10 %' })); expect((screen.getByRole('button', { name: 'Aceptar condiciones y reservar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Comprobar mi precio Card' })); await screen.findByText(/Precio comprobado: 18,00/); fireEvent.change(screen.getByLabelText('Número de personas'), { target: { value: '2' } }); expect((screen.getByRole('button', { name: 'Aceptar condiciones y reservar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Número de personas'), { target: { value: '1' } }); fireEvent.click(screen.getByRole('button', { name: 'Consultar horarios disponibles' })); fireEvent.click(await screen.findByRole('button', { name: '10:00' })); fireEvent.click(screen.getByRole('button', { name: 'Comprobar mi precio Card' })); await screen.findByText(/Precio comprobado: 18,00/); fireEvent.click(screen.getByRole('button', { name: 'Aceptar condiciones y reservar' })); await waitFor(() => expect(professionalRpc.mock.calls.some((call: any[]) => call[0] === 'professional_book')).toBe(true));
    const call = professionalRpc.mock.calls.find((call: any[]) => call[0] === 'professional_book') as any; expect(call[1]).toMatchObject({ p_card_quote_id: 'quote', p_expected_total_cents: 1800, p_expected_service_version: 7, p_expected_terms: 'Cancelación con 24 horas.' }); expect(call[1].p_request_key).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('native double confirmation and checkout', () => {
  it('uses the protected booking reference supplied by the server without manual input', async () => {
    const f = fixture(); f.updateOperation({ kind: 'protected', customer_confirmed: true, status: 'customer_confirmed', booking_id: REQUEST, expected_external_reference: `professional-booking:${REQUEST}` }); render(<f.CardOperationScreen />); await screen.findByText(/referencia de esta reserva se incorpora/); expect(screen.queryByLabelText('Referencia del recibo o reserva')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar consumo y ventaja' })); await waitFor(() => expect(f.rpc.mock.calls.some((call: any[]) => call[0] === 'respond_franky_card_request')).toBe(true)); expect(f.rpc.mock.calls.find((call: any[]) => call[0] === 'respond_franky_card_request')?.[1]).toMatchObject({ p_external_reference: `professional-booking:${REQUEST}` });
  });
  it('blocks merchant confirmation before holder agreement even with a receipt', async () => {
    const f = fixture(); render(<f.CardOperationScreen />); await screen.findByText('Comercio autorizado'); fireEvent.change(screen.getByLabelText('Referencia del recibo o reserva'), { target: { value: 'receipt-1' } }); const button = screen.getByRole('button', { name: 'Confirmar consumo y ventaja' }); expect((button as HTMLButtonElement).disabled).toBe(true); fireEvent.click(button); expect(f.rpc.mock.calls.filter((call: any[]) => call[0] === 'respond_franky_card_request')).toHaveLength(0);
  });
  it('requires a reference and suppresses simultaneous confirmation taps', async () => {
    const f = fixture(); f.updateOperation({ customer_confirmed: true, status: 'customer_confirmed', identity: { full_name: 'Ana García López', photo_path: null } }); let finish!: () => void;
    const previous = f.rpc.getMockImplementation()!; f.rpc.mockImplementation((name: string, ...args: any[]) => name === 'respond_franky_card_request' ? new Promise<any>(resolve => { finish = () => resolve({}); }) : previous(name, ...args));
    render(<f.CardOperationScreen />); await screen.findByText('Ana García'); expect((screen.getByRole('button', { name: 'Confirmar consumo y ventaja' }) as HTMLButtonElement).disabled).toBe(true); fireEvent.change(screen.getByLabelText('Referencia del recibo o reserva'), { target: { value: 'receipt-1' } }); const button = screen.getByRole('button', { name: 'Confirmar consumo y ventaja' }); fireEvent.click(button); fireEvent.click(button); expect(f.rpc.mock.calls.filter((call: any[]) => call[0] === 'respond_franky_card_request')).toHaveLength(1); await act(async () => finish());
  });
  it('hides an operation when the selected merchant workspace does not match', async () => {
    const f = fixture(); f.switchWorkspace(); render(<f.CardOperationScreen />); await screen.findByText(/Esta operación pertenece a otro espacio/); expect(screen.queryByText('Comercio autorizado')).toBeNull();
  });
  it('an authoritative renewal quote allows active membership renewal with explicit acceptance', async () => {
    const f = fixture();
    let resolveProviders!: (value: typeof f.providers) => void;
    let resolveCheckout!: (value: { status: string; order_id: string }) => void;
    f.bindings['@/lib/franky-card-api'].cardApi = vi.fn()
      .mockResolvedValue(f.providers)
      .mockImplementationOnce(() => new Promise(resolve => { resolveProviders = resolve; }));
    f.checkout.mockImplementationOnce(() => new Promise(resolve => { resolveCheckout = resolve; }));
    render(<f.CardPlanScreen />);
    expect(screen.queryByRole('button', { name: 'Comprar anualidad Card' })).toBeNull();
    expect(f.checkout).not.toHaveBeenCalled();

    // Settle the quote's acceptance-reset effect before simulating the holder's choice.
    await act(async () => resolveProviders(f.providers));
    expect(screen.getByText(/19,90.*12 meses/)).toBeTruthy();
    const buy = screen.getByRole('button', { name: 'Comprar anualidad Card' });
    const acceptance = screen.getByLabelText('Aceptar precio y condiciones Card');
    expect(acceptance).not.toBeChecked();
    expect(buy).toBeDisabled();
    fireEvent.click(buy);
    expect(f.checkout).not.toHaveBeenCalled();
    fireEvent.click(acceptance);
    expect(acceptance).toBeChecked();
    expect(buy).not.toBeDisabled();
    fireEvent.click(buy);
    expect(buy).toBeDisabled();
    fireEvent.click(buy);
    expect(f.checkout).toHaveBeenCalledTimes(1);
    expect(f.checkout.mock.calls[0][2]).toEqual({ amount_cents: 1990, price_version: 'renewal-v1' });
    await act(async () => resolveCheckout({ status: 'pending', order_id: REQUEST }));
    expect(screen.getByText('Tu compra sigue pendiente de confirmación. No inicies otra compra.')).toBeTruthy();
  });
  it('never attempts checkout while providers are disabled', async () => {
    const f = fixture(); f.providers.checkoutEnabled = false; render(<f.CardPlanScreen />); const buy = await screen.findByRole('button', { name: 'Compras todavía no disponibles' }); expect((buy as HTMLButtonElement).disabled).toBe(true); fireEvent.click(buy); expect(f.checkout).not.toHaveBeenCalled();
  });
});

describe('native merchant reception', () => {
  it('uses named catalog services and scanning alone never records a consumption', async () => {
    const f = fixture(); const serviceId = '33333333-3333-4333-8333-333333333333';
    const merchant: any = { enabled: true, permissions: { redeem: true, manage: false, finance: false, reverse: false }, venues: [{ id: 'venue', name: 'Sede', programs: [], offers: [{ id: 'offer', title: 'Corte Card', status: 'active', terms: 'Un corte.', service_keys: [serviceId] }] }], pending_requests: [] };
    f.rpc.mockImplementation(async (name: string) => name === 'get_franky_card_merchant' ? merchant : { id: REQUEST });
    f.bindings['@/lib/workspaces'] = { workspaceRpc: vi.fn(async () => ({ services: [{ id: serviceId, name: 'Corte de pelo', active: true }] })) };
    f.bindings['expo-camera'] = { useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })], CameraView: ({ onBarcodeScanned }: any) => <button onClick={() => onBarcodeScanned({ data: `franky:card:v1:${'a'.repeat(64)}` })}>Escanear fixture</button> };
    f.bindings['@react-native-community/datetimepicker'] = { default: () => null };
    const { CardMerchantScreen } = f.load('../mobile/src/components/card/CardMerchantScreens.tsx'); const page = render(<CardMerchantScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Corte Card' })); fireEvent.click(await screen.findByRole('button', { name: 'Corte de pelo' })); expect(screen.queryByText(serviceId)).toBeNull();
    fireEvent.change(screen.getByLabelText('Precio ordinario (€)'), { target: { value: '20' } }); fireEvent.change(screen.getByLabelText('Precio público comparable sin Card (€)'), { target: { value: '20' } }); fireEvent.click(screen.getByRole('button', { name: 'Escanear código temporal' })); fireEvent.click(await screen.findByRole('button', { name: 'Escanear fixture' }));
    expect(f.rpc.mock.calls.filter((call: any[]) => call[0] === 'create_franky_card_request')).toHaveLength(0); fireEvent.click(screen.getByRole('button', { name: 'Enviar al titular para confirmar' })); await waitFor(() => expect(f.router.push).toHaveBeenCalled());
    const args = f.rpc.mock.calls.find((call: any[]) => call[0] === 'create_franky_card_request')?.[1]; expect(args.p_lines[0]).toMatchObject({ label: 'Corte de pelo', service_key: serviceId, gross_cents: 2000 });
    fireEvent.click(screen.getByRole('button', { name: 'Escanear código temporal' })); await screen.findByRole('button', { name: 'Escanear fixture' }); f.switchWorkspace(); page.rerender(<CardMerchantScreen />); expect(screen.queryByRole('button', { name: 'Escanear fixture' })).toBeNull();
  });
});


describe('native professional editing and asynchronous selections', () => {
  const serviceId = '33333333-3333-4333-8333-333333333333';
  function editorFixture(editor = 'service', recordId?: string) {
    const f = fixture(); const data: any = { settings: { category: 'hairdresser', timezone: 'Europe/Madrid', terms: '', cancellation_hours: 24, public_booking: true, require_approval: false }, services: [], resources: [], availability: [], exceptions: [], sessions: [], customers: [], bookings: [], bundles: [], permissions: ['settings.manage','content.manage','finance.manage'] };
    const rpc = vi.fn(async (name: string, args?: any): Promise<any> => {
      if (name === 'professional_get_workspace') return data;
      if (name === 'professional_save_record') { const result = { id: args.p_record_id ?? serviceId, ...args.p_data }; if (args.p_entity === 'service') data.services = [result]; if (args.p_entity === 'resource') data.resources = [result]; return result; }
    });
    f.bindings['@/lib/workspaces'] = { workspaceRpc: rpc }; f.bindings['expo-router'].useLocalSearchParams = () => ({ editor, id: recordId }); const { ProfessionalEditorScreen } = f.load('../mobile/src/components/card/ProfessionalEditor.tsx');
    return { ...f, data, professionalRpc: rpc, Editor: ProfessionalEditorScreen };
  }
  it('keeps the active entity pinned while a create response is pending', async () => {
    const f = editorFixture(); let finish!: (value: any) => void;
    const original = f.professionalRpc.getMockImplementation()!;
    f.professionalRpc.mockImplementation((name: string, args?: any) => name === 'professional_save_record' ? new Promise(resolve => { finish = resolve; }) : original(name, args));
    render(<f.Editor />); fireEvent.change(await screen.findByLabelText('Nombre del servicio o menú'), { target: { value: 'Corte' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(screen.getByRole('button', { name: 'Recursos' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'Recursos' })); expect(screen.queryByLabelText('Nombre del profesional o recurso')).toBeNull();
    await act(async () => finish({ id: serviceId })); await waitFor(() => expect(screen.getByRole('button', { name: 'Recursos' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Recursos' })); fireEvent.change(screen.getByLabelText('Nombre del profesional o recurso'), { target: { value: 'Cabina nueva' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    const writes = f.professionalRpc.mock.calls.filter((call: any[]) => call[0] === 'professional_save_record'); expect(writes[1][1]).toMatchObject({ p_entity: 'resource', p_record_id: null }); await act(async () => finish({ id: 'new-resource' }));
  });
  it('edits the newly saved service rather than creating a second service', async () => {
    const f = editorFixture(); render(<f.Editor />); await screen.findByLabelText('Nombre del servicio o menú'); fireEvent.change(screen.getByLabelText('Nombre del servicio o menú'), { target: { value: 'Corte de pelo' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    await screen.findByRole('button', { name: 'Guardar cambios' }); await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('Precio final (€)'), { target: { value: '25' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(f.professionalRpc.mock.calls.filter((call: any[]) => call[0] === 'professional_save_record')).toHaveLength(2)); const writes = f.professionalRpc.mock.calls.filter((call: any[]) => call[0] === 'professional_save_record');
    expect(writes[0][1].p_record_id).toBeNull(); expect(writes[1][1].p_record_id).toBe(serviceId); expect(writes[1][1].p_data.price_cents).toBe(2500); expect(writes[0][1].p_data.client_request_id).not.toBe(writes[1][1].p_data.client_request_id);
  });
  it('renames a booked resource without resending unchanged capacity or kind', async () => {
    const f = editorFixture('resource', serviceId); f.data.resources = [{ id: serviceId, name: 'Cabina 1', kind: 'room', capacity: 1, active: true }]; render(<f.Editor />); await waitFor(() => expect((screen.getByLabelText('Nombre del profesional o recurso') as HTMLInputElement).value).toBe('Cabina 1'));
    fireEvent.change(screen.getByLabelText('Nombre del profesional o recurso'), { target: { value: 'Cabina principal' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); await waitFor(() => expect(f.professionalRpc.mock.calls.some((call: any[]) => call[0] === 'professional_save_record')).toBe(true));
    const input = f.professionalRpc.mock.calls.find((call: any[]) => call[0] === 'professional_save_record')![1].p_data; expect(input.name).toBe('Cabina principal'); expect(input).not.toHaveProperty('capacity'); expect(input).not.toHaveProperty('kind'); expect(input).not.toHaveProperty('active');
  });
  it('updates a selected availability interval ending at midnight', async () => {
    const f = editorFixture('availability'); f.data.availability = [{ id: serviceId, resource_id: null, weekday: 5, start_minute: 1320, end_minute: 1380 }]; render(<f.Editor />); fireEvent.click(await screen.findByRole('button', { name: 'Editar franja' })); fireEvent.change(screen.getByLabelText('Hasta (HH:mm)'), { target: { value: '24:00' } }); fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(f.professionalRpc.mock.calls.some((call: any[]) => call[0] === 'professional_save_record')).toBe(true)); expect(f.professionalRpc.mock.calls.find((call: any[]) => call[0] === 'professional_save_record')![1]).toMatchObject({ p_record_id: serviceId, p_data: { weekday: 5, start_minute: 1320, end_minute: 1440 } });
  });
  it('fails closed when an edit link points to a missing record', async () => {
    const f = editorFixture('service', serviceId); render(<f.Editor />); await screen.findByText(/Este registro ya no está disponible/); expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });
  it('rejects a response for a date that has been replaced while availability loads', async () => {
    const f = fixture(); let resolve!: (value: string[]) => void; const rpc = vi.fn(() => new Promise<string[]>(done => { resolve = done; }));
    f.bindings['@/lib/workspaces'] = { workspaceRpc: rpc }; f.bindings['./ProfessionalWorkspace'] = { professionalDate: (value: string) => value }; f.rpc.mockResolvedValue({ items: [] });
    const catalog = { services: [{ id: serviceId, name: 'Corte', active: true, mode: 'appointment', duration_minutes: 30, price_cents: 2000, price_basis: 'booking', required_resource_ids: [], version: 1 }], resources: [], sessions: [], settings: { timezone: 'Europe/Madrid', terms: '' } }; const { BookingForm } = f.load('../mobile/src/components/card/ProfessionalBooking.tsx'); render(<BookingForm owner={f.owner} organizationId={ORG} data={catalog} customer after={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Corte' })); fireEvent.change(screen.getByLabelText(/Fecha de la sede/), { target: { value: '2026-10-01' } }); fireEvent.click(screen.getByRole('button', { name: 'Consultar horarios disponibles' })); fireEvent.change(screen.getByLabelText(/Fecha de la sede/), { target: { value: '2026-10-02' } }); await act(async () => resolve(['2026-10-01T08:00:00Z'])); expect(screen.queryByRole('button', { name: '10:00' })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Fecha de la sede/), { target: { value: '2026-02-31' } }); expect(screen.getByRole('button', { name: 'Consultar horarios disponibles' })).toBeDisabled();
  });
  it('ignores a late barcode callback after the camera has been closed', async () => {
    const f = fixture(); let scan: (event: { data: string }) => void = () => {}; const merchant: any = { enabled: true, permissions: { redeem: true }, venues: [{ id: 'venue', name: 'Sede', programs: [], offers: [{ id: 'offer', title: 'Corte Card', status: 'active', terms: 'Un corte.', service_keys: [serviceId] }] }], pending_requests: [] };
    f.rpc.mockResolvedValue(merchant); f.bindings['@/lib/workspaces'] = { workspaceRpc: vi.fn(async () => ({ services: [{ id: serviceId, name: 'Corte', active: true }] })) }; f.bindings['expo-camera'] = { useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })], CameraView: ({ onBarcodeScanned }: any) => { scan = onBarcodeScanned; return <span>Cámara abierta</span>; } }; f.bindings['@react-native-community/datetimepicker'] = { default: () => null };
    const { CardMerchantScreen } = f.load('../mobile/src/components/card/CardMerchantScreens.tsx'); render(<CardMerchantScreen />); fireEvent.click(await screen.findByRole('button', { name: 'Corte Card' })); fireEvent.click(screen.getByRole('button', { name: 'Escanear código temporal' })); await screen.findByText('Cámara abierta'); const late = scan; fireEvent.click(screen.getByRole('button', { name: 'Cerrar cámara' })); act(() => late({ data: 'franky:card:v1:' + 'a'.repeat(64) })); expect((screen.getByLabelText('Código temporal (alternativa a la cámara)') as HTMLInputElement).value).toBe('');
  });
});


describe('native lifecycle, free loyalty and navigation', () => {
  it('asks the holder to accept the exact waitlist price and conditions', () => {
    const f = fixture(); const { ProfessionalWaitlist } = f.bindings['./ProfessionalWaitlist']; const onAction = vi.fn();
    const booking = { waitlist_offer_status: 'offered', waitlist_offer_expires_at: new Date(Date.now() + 60000).toISOString(), waitlist_offer_version: 4, total_cents: 2500, price_snapshot: { terms: 'Cancelar con 24 horas.' }, customer_user_id: 'holder-a' };
    render(<ProfessionalWaitlist booking={booking} busy={false} onAction={onAction} />); fireEvent.click(screen.getByRole('button', { name: 'Aceptar plaza, precio y condiciones' })); expect(onAction).toHaveBeenCalledWith('accept_waitlist', { offer_version: 4, expected_total_cents: 2500, expected_terms: 'Cancelar con 24 horas.' });
  });
  it('does not allow reception to accept a registered holder’s waitlist offer', () => {
    const f = fixture(); const { ProfessionalWaitlist } = f.bindings['./ProfessionalWaitlist']; render(<ProfessionalWaitlist operator booking={{ waitlist_offer_status: 'offered', waitlist_offer_expires_at: new Date(Date.now() + 60000).toISOString(), customer_user_id: 'holder-a' }} busy={false} onAction={vi.fn()} />); expect(screen.queryByRole('button', { name: /acepta plaza/i })).toBeNull(); expect(screen.getByText(/Recepción no puede aceptar/)).toBeTruthy();
  });
  it('disables a waitlist offer that has expired on screen', () => {
    const f = fixture(); const { ProfessionalWaitlist } = f.bindings['./ProfessionalWaitlist']; render(<ProfessionalWaitlist booking={{ waitlist_offer_status: 'offered', waitlist_offer_expires_at: new Date(Date.now() - 1000).toISOString(), total_cents: 2000, price_snapshot: { terms: 'Condiciones' } }} busy={false} onAction={vi.fn()} />); expect(screen.getByRole('button', { name: 'Aceptar plaza, precio y condiciones' })).toBeDisabled();
  });
  it('loads older customer bundles using the scoped cursor and supports own free account', async () => {
    const f = fixture(); const rpc = vi.fn(async (_name: string, args: any) => ({ items: [{ id: args.p_cursor ? 'older-bundle' : 'recent-bundle', label: args.p_cursor ? 'Bono antiguo' : 'Bono reciente', remaining: 3 }], next_cursor: args.p_cursor ? null : 'cursor-1' })); f.bindings['@/lib/workspaces'] = { workspaceRpc: rpc }; const { ProfessionalBundlePicker } = f.load('../mobile/src/components/card/ProfessionalBundlePicker.tsx'); const onChange = vi.fn(); render(<ProfessionalBundlePicker owner={f.owner} organizationId={ORG} customerId={null} serviceId="service" value="" onChange={onChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Más bonos de este cliente' })); fireEvent.click(await screen.findByRole('button', { name: 'Bono antiguo · 3 sesiones' })); expect(onChange).toHaveBeenCalledWith('older-bundle'); expect(rpc.mock.calls[1][1]).toMatchObject({ p_customer_id: null, p_service_id: 'service', p_cursor: 'cursor-1' });
  });
  it('keeps an exhausted selection explicit and blocks booking until the customer removes it', async () => {
    const f = fixture(); let reload = false; let finish!: (value: any) => void;
    const rpc = vi.fn(async (name: string) => name === 'professional_get_slots' ? ['2026-10-01T08:00:00Z'] : reload ? new Promise(resolve => { finish = resolve; }) : ({ items: [{ id: 'bundle', label: 'Mi bono', remaining: 1 }], next_cursor: null }));
    f.bindings['@/lib/workspaces'] = { workspaceRpc: rpc }; f.bindings['./ProfessionalBundlePicker'] = f.load('../mobile/src/components/card/ProfessionalBundlePicker.tsx'); f.bindings['./ProfessionalWorkspace'] = { professionalDate: (value: string) => value }; f.rpc.mockResolvedValue({ items: [] });
    const { BookingForm } = f.load('../mobile/src/components/card/ProfessionalBooking.tsx');
    const catalog = { services: [{ id: 'service', name: 'Corte', active: true, mode: 'appointment', duration_minutes: 30, price_cents: 2000, price_basis: 'booking', required_resource_ids: [], version: 1 }], resources: [], sessions: [], settings: { timezone: 'Europe/Madrid', terms: '' } };
    render(<BookingForm owner={f.owner} organizationId={ORG} data={catalog} customer after={async () => {}} />); fireEvent.click(screen.getByRole('button', { name: 'Corte' })); fireEvent.click(await screen.findByRole('button', { name: 'Mi bono · 1 sesiones' })); fireEvent.change(screen.getByLabelText(/Fecha de la sede/), { target: { value: '2026-10-01' } }); fireEvent.click(screen.getByRole('button', { name: 'Consultar horarios disponibles' })); fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aceptar condiciones y reservar' })).not.toBeDisabled()); expect(screen.getByText(/Total: 0,00/)).toBeTruthy(); reload = true; act(() => f.foreground());
    expect(screen.getByRole('button', { name: 'Aceptar condiciones y reservar' })).toBeDisabled(); expect(screen.getByText(/Total: 0,00/)).toBeTruthy();
    await act(async () => finish({ items: [], next_cursor: null })); await screen.findByText(/El bono seleccionado está agotado/); expect(screen.getByRole('button', { name: 'Aceptar condiciones y reservar' })).toBeDisabled(); expect(screen.getByText(/Total: 0,00/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sin bono: precio del servicio' })); expect(screen.getByText(/Total: 20,00/)).toBeTruthy(); expect(screen.getByRole('button', { name: 'Aceptar condiciones y reservar' })).not.toBeDisabled(); expect(rpc.mock.calls.some((call: any[]) => call[0] === 'professional_book')).toBe(false);
  });
  it('returns a professional deep link to its workspace without going through student feed', () => {
    const f = fixture(); f.router.canGoBack = () => false; f.bindings['@/components/Screen'].Screen = ({ onBack }: any) => <button onClick={onBack}>Volver</button>; const { CardScreen } = f.bindings['./CardUi']; render(<CardScreen title="Profesional" back />); fireEvent.click(screen.getByRole('button', { name: 'Volver' })); expect(f.router.replace).toHaveBeenCalledWith('/(workspace)/resumen');
  });
  it('keeps a photo response private when the app has entered the background', async () => {
    const f = fixture();
    f.personal.profile.photo_path = 'holder/private.jpg';
    let finish!: (value: string) => void;
    const photo = vi.fn((_owner: unknown, _path: string, _signal: AbortSignal) =>
      new Promise<string>(resolve => { finish = resolve; }));
    f.bindings['@/lib/franky-card-api'].getCardPhoto = photo;
    render(<f.CardPresentScreen />);
    // The profile text can render before the separate photo effect starts.
    await waitFor(() => expect(photo).toHaveBeenCalledTimes(1));
    expect(photo.mock.calls[0][1]).toBe('holder/private.jpg');
    const signal = photo.mock.calls[0][2];
    expect(signal.aborted).toBe(false);
    act(() => f.background());
    expect(signal.aborted).toBe(true);
    await act(async () => finish('private-signed-url'));
    expect(screen.queryByText('Private image')).toBeNull();
  });
});


describe('native merchant campaign edits and retry contracts', () => {
  function merchantFixture() {
    const f = fixture(); const venue = { id: 'venue-id', name: 'Sede de prueba', city: 'Madrid', address: 'Calle de prueba 1', category: 'hairdresser', timezone: 'Atlantic/Canary', status: 'active', offers: [], programs: [] }; const merchant = { enabled: true, permissions: { manage: true }, venues: [venue], pending_requests: [] };
    f.rpc.mockImplementation(async (name: string) => name === 'get_franky_card_merchant' ? merchant : { id: 'new-id' }); f.bindings['@/lib/workspaces'] = { workspaceRpc: vi.fn(async () => ({ services: [{ id: 'service-id', name: 'Corte de pelo', active: true }] })) }; f.bindings['expo-camera'] = { CameraView: () => null, useCameraPermissions: () => [{ granted: false }, vi.fn()] }; f.bindings['@react-native-community/datetimepicker'] = { default: () => null }; const { CardMerchantScreen } = f.load('../mobile/src/components/card/CardMerchantScreens.tsx'); return { ...f, Merchant: CardMerchantScreen, merchant };
  }
  it('pins the venue being saved and blocks switching to another venue or draft', async () => {
    const f = merchantFixture(); f.merchant.venues.push({ ...f.merchant.venues[0], id: 'other-venue', name: 'Otra sede' }); let finish!: (value: any) => void;
    f.rpc.mockImplementation((name: string) => name === 'get_franky_card_merchant' ? Promise.resolve(f.merchant) : new Promise(resolve => { finish = resolve; }));
    render(<f.Merchant mode="manage" />); fireEvent.click(await screen.findByText('Sede de prueba')); fireEvent.click(screen.getByLabelText('Aceptar condiciones de adhesión')); fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de sede' }));
    expect(screen.getByRole('button', { name: 'Preparar otra sede' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Ventajas' })).toBeDisabled(); fireEvent.click(screen.getByText('Otra sede')); expect((screen.getByLabelText('Nombre de la sede') as HTMLInputElement).value).toBe('Sede de prueba');
    await act(async () => finish({ id: 'venue-id' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Preparar otra sede' })).not.toBeDisabled()); fireEvent.click(screen.getByText('Otra sede')); fireEvent.click(screen.getByLabelText('Aceptar condiciones de adhesión')); fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de sede' }));
    expect(f.rpc.mock.calls.filter((call: any[]) => call[0] === 'save_franky_card_venue')[1][1].p_venue_id).toBe('other-venue'); await act(async () => finish({ id: 'other-venue' }));
  });
  it('edits an existing venue under its id and requires a fresh adhesion acknowledgement', async () => {
    const f = merchantFixture(); render(<f.Merchant mode="manage" />); fireEvent.click(await screen.findByText('Sede de prueba')); expect((screen.getByLabelText('Nombre de la sede') as HTMLInputElement).value).toBe('Sede de prueba'); expect(screen.getByRole('button', { name: 'Guardar cambios de sede' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nombre de la sede'), { target: { value: 'Sede de prueba editada' } }); fireEvent.click(screen.getByLabelText('Aceptar condiciones de adhesión')); fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios de sede' })); await waitFor(() => expect(f.rpc.mock.calls.some((call: any[]) => call[0] === 'save_franky_card_venue')).toBe(true)); expect(f.rpc.mock.calls.find((call: any[]) => call[0] === 'save_franky_card_venue')?.[1]).toMatchObject({ p_venue_id: 'venue-id', p_data: { name: 'Sede de prueba editada', timezone: 'Atlantic/Canary' } });
  });
  it('loads campaign use only on request for finance without exposing management actions', async () => {
    const f = merchantFixture(); (f.merchant.permissions as any).manage = false; (f.merchant.permissions as any).finance = true;
    (f.merchant.venues[0].offers as any[]).push({ id: 'campaign', title: 'Tardes Card', kind: 'campaign', percent: 10, terms: 'Tardes', status: 'active' });
    const usage = { offer_id: 'campaign', committed_uses: 4, completed_uses: 2, committed_cents: 800, completed_cents: 400, remaining_uses: 6, remaining_cents: 1200 };
    f.rpc.mockImplementation(async (name: string) => name === 'get_franky_card_merchant' ? f.merchant : name === 'get_franky_card_history' ? { items: [], next_cursor: null } : usage);
    render(<f.Merchant mode="history" />); const button = await screen.findByRole('button', { name: 'Consultar uso de campaña' }); expect(f.rpc.mock.calls.some((call: any[]) => call[0] === 'get_franky_card_offer_usage')).toBe(false); fireEvent.click(button);
    await screen.findByText('Usos comprometidos: 4 · completados: 2'); expect(screen.getByText(/Presupuesto restante: 12,00/)).toBeTruthy(); expect(screen.queryByRole('button', { name: /Guardar ventaja/ })).toBeNull(); expect(f.rpc.mock.calls.find((call: any[]) => call[0] === 'get_franky_card_offer_usage')?.[1]).toEqual({ p_offer_id: 'campaign' });
  });
  it.each(['switchAccount', 'switchWorkspace'] as const)('discards a late campaign accounting response after %s', async change => {
    const f = merchantFixture(); (f.merchant.venues[0].offers as any[]).push({ id: 'campaign', title: 'Tardes Card', kind: 'campaign', percent: 10, terms: 'Tardes', status: 'active' }); let finish!: (value: any) => void;
    f.rpc.mockImplementation((name: string) => name === 'get_franky_card_offer_usage' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(f.merchant));
    render(<f.Merchant mode="manage" />); fireEvent.click(await screen.findByText('Sede de prueba')); fireEvent.click(screen.getByRole('button', { name: 'Ventajas' })); fireEvent.click(screen.getByRole('button', { name: 'Consultar uso de campaña' })); f[change]();
    await act(async () => finish({ committed_uses: 99, completed_uses: 88, committed_cents: 800, completed_cents: 400, remaining_uses: null, remaining_cents: null })); expect(screen.queryByText(/Usos comprometidos: 99/)).toBeNull();
  });
  it('preserves the write key after a lost response and sends campaign limits in venue time', async () => {
    const f = merchantFixture(); let fail = true; f.rpc.mockImplementation(async (name: string) => { if (name === 'get_franky_card_merchant') return f.merchant; if (name === 'save_franky_card_offer' && fail) { fail = false; throw new Error('network'); } return { id: 'saved-offer' }; }); render(<f.Merchant mode="manage" />);
    fireEvent.click(await screen.findByText('Sede de prueba')); fireEvent.click(screen.getByRole('button', { name: 'Ventajas' })); fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Oferta tarde' } }); fireEvent.change(screen.getByLabelText('Condiciones, exclusiones y compatibilidad'), { target: { value: 'Un corte con las condiciones publicadas.' } }); fireEvent.click(await screen.findByRole('button', { name: 'Corte de pelo' })); fireEvent.click(screen.getByRole('button', { name: 'Refuerzo temporal' }));
    fireEvent.change(screen.getByLabelText('Máximo de usos (opcional)'), { target: { value: '50' } }); fireEvent.change(screen.getByLabelText('Usos por persona (opcional)'), { target: { value: '2' } }); fireEvent.change(screen.getByLabelText('Presupuesto máximo de ahorro (€; opcional)'), { target: { value: '250' } }); fireEvent.click(screen.getByRole('button', { name: 'Vie' })); fireEvent.change(screen.getByLabelText('Campaña desde (HH:mm)'), { target: { value: '23:00' } }); fireEvent.change(screen.getByLabelText('Campaña hasta (HH:mm)'), { target: { value: '02:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ventaja para revisión' })); await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Guardar ventaja para revisión' })); await waitFor(() => expect(f.rpc.mock.calls.filter((call: any[]) => call[0] === 'save_franky_card_offer')).toHaveLength(2));
    const writes = f.rpc.mock.calls.filter((call: any[]) => call[0] === 'save_franky_card_offer'); expect(writes[0][1].p_request_key).toBe(writes[1][1].p_request_key); expect(writes[1][1].p_data).toMatchObject({ max_redemptions: 50, max_per_user: 2, budget_cents: 25000, validity_windows: [{ weekday: 5, start_minute: 1380, end_minute: 120 }], timezone: 'Atlantic/Canary' }); await waitFor(() => expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe(''));
  });
});


describe('native current roles and free identity', () => {
  it('does not expose session creation to a reception-only role', async () => {
    const f = fixture(); f.bindings['expo-router'].useLocalSearchParams = () => ({ create: 'session' }); f.bindings['@/lib/workspaces'] = { workspaceRpc: vi.fn(async () => ({ settings: { timezone: 'Europe/Madrid' }, services: [], sessions: [], resources: [], bookings: [], permissions: ['attendees.manage'] })) }; f.bindings['./ProfessionalWorkspace'] = { professionalDate: (value: string) => value }; const { ProfessionalBookingScreen } = f.load('../mobile/src/components/card/ProfessionalBooking.tsx'); render(<ProfessionalBookingScreen />); await screen.findByText(/Crear sesiones requiere permiso de edición/); expect(screen.queryByRole('button', { name: 'Crear sesión o serie' })).toBeNull();
  });
  it('does not charge a free loyalty user just to expose an eligible Wallet provider', async () => {
    const f = fixture(); f.personal.membership.status = 'expired'; f.personal.pricing.checkout_quote = null; f.providers.appleWallet = true; render(<f.CardPlanScreen />); await screen.findByText(/sellos siguen disponibles con cuenta gratuita/); expect(screen.getByRole('button', { name: 'Añadir a Apple Wallet' })).not.toBeDisabled(); expect(f.checkout).not.toHaveBeenCalled();
  });
});


describe('native professional plan companion', () => {
  function planFixture() {
    const f = fixture(); const billing: any = { organization_id: ORG, environment: 'live', sales_enabled: true, provider_ready: true, can_manage_billing: true, can_read_finance: true, account: { legal_name: 'Entidad confidencial', country: 'ES' }, catalog: [{ monthly_cents: 2900, founder_cents: 19900, annual_cents: 29000, terms: 'Contrata en https://example.com' }], founder: { approved: true, reason: 'Invitación privada' }, subscription: { current_period_end: '2027-12-31T00:00:00Z', cancel_at_period_end: false }, access: { source: 'stripe', active: true, paused: false, until: '2026-10-23T12:00:00Z', existing_obligations_access: true } };
    const rpc = vi.fn(async (_name: string, _args: any) => billing); f.bindings['@/lib/workspaces'] = { workspaceRpc: rpc }; f.bindings['expo-router'].useLocalSearchParams = () => ({ editor: 'plans' }); const { ProfessionalEditorScreen } = f.load('../mobile/src/components/card/ProfessionalEditor.tsx'); return { ...f, billing, professionalRpc: rpc, Plan: ProfessionalEditorScreen };
  }
  it('shows only authoritative access and consolidated period without web prices or purchase prompts', async () => {
    const f = planFixture(); render(<f.Plan />); await screen.findByText('Plan activo'); expect(screen.getByText(/Periodo consolidado hasta el 23 de octubre de 2026/)).toBeTruthy(); expect(screen.queryByText(/2027/)).toBeNull(); expect(screen.getByText('Card básica independiente')).toBeTruthy(); expect(screen.getByText(/obligaciones ya registradas siguen disponibles/)).toBeTruthy();
    expect(f.professionalRpc.mock.calls[0]).toEqual(expect.arrayContaining(['get_organization_billing', { p_organization_id: ORG }])); expect(f.professionalRpc.mock.calls.every((call: any[]) => call[0] === 'get_organization_billing')).toBe(true);
    expect(document.body.textContent).not.toMatch(/€|199|fundador|Contrata|https:|Entidad confidencial|Invitación privada/i); expect(screen.queryAllByRole('link')).toHaveLength(0); expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Actualizar estado']);
  });
  it.each([
    [{ source: 'pilot', active: true, paused: false, until: null }, 'Piloto activo'],
    [{ source: 'stripe', active: false, paused: true, until: null }, 'Acceso profesional pausado'],
    [{ source: 'free', active: false, paused: false, until: null }, 'Sin plan profesional activo'],
  ])('shows a neutral access state while retaining existing obligations', async (access, label) => {
    const f = planFixture(); Object.assign(f.billing.access, access); f.billing.subscription.cancel_at_period_end = true; render(<f.Plan />); await screen.findByText(label as string); expect(screen.queryByText(/El plan finalizará/)).toBeNull(); expect(screen.getByText(/obligaciones ya registradas siguen disponibles/)).toBeTruthy(); expect(screen.queryByText(/Periodo consolidado/)).toBeNull();
  });
  it('removes former access information after permissions are revoked and exposes retry', async () => {
    const f = planFixture(); render(<f.Plan />); await screen.findByText('Plan activo'); f.professionalRpc.mockRejectedValueOnce(new Error('organization_billing_forbidden')); fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' })); await screen.findByText(/Tu acceso al estado de este espacio/); expect(screen.queryByText('Plan activo')).toBeNull(); expect(screen.getByRole('button', { name: 'Reintentar consulta' })).toBeTruthy();
  });
  it.each(['switchAccount', 'switchWorkspace'] as const)('discards a late plan response after %s', async change => {
    const f = planFixture(); let finish!: (value: any) => void; f.professionalRpc.mockImplementation(() => new Promise(resolve => { finish = resolve; })); render(<f.Plan />); await waitFor(() => expect(f.professionalRpc).toHaveBeenCalled()); f[change](); await act(async () => finish(f.billing)); expect(screen.queryByText('Plan activo')).toBeNull(); expect(screen.queryByText(/Periodo consolidado/)).toBeNull();
  });
});
