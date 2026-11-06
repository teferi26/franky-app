// ─── Franky Tap: estado de la pantalla "acercar los móviles" ────────────────
// Una sesión = un testigo del servidor (tap_start) anunciado por radio (banda
// ultraancha o Bluetooth) y como código escaneable. En cuanto CUALQUIERA de
// los dos móviles detecta el testigo del otro llama a tap_connect y el
// servidor crea el match; la otra pantalla se entera sondeando tap_poll.
//
// Qué se arregló respecto a la versión anterior (que "no funcionaba"):
//   · Android nunca encendía la radio porque se exigía medición precisa; ahora
//     basta con que el módulo esté disponible.
//   · Los permisos se piden SIEMPRE antes de arrancar (Bluetooth en Android y
//     en iPhone sin banda ultraancha).
//   · Salir a segundo plano solo para la radio; la sesión sigue viva y la
//     radio se reanuda al volver, sin obligar a los dos a empezar de cero.
//   · Un móvil visto sin medida de distancia (iPhone sin U1, Bluetooth lejos)
//     ofrece una tarjeta "Hacer match con este móvil": un toque y listo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Radio from '../../modules/franky-tap';
import { useSessionGuard } from './useSessionGuard';
import { isUuid, newTapKey, tapConnect, tapErrorMessage, tapPoll, tapStart, tapStop, type TapResult, type TapSession } from './tap';

export type TapPhase = 'idle' | 'searching' | 'connecting' | 'matched';
export type TapCandidate = { token: string; reference: string; precise: boolean; distanceCm: number | null };

const POLL_MS = 1500;
const RENEW_BEFORE_MS = 60_000;
/** Un mismo testigo no se vuelve a intentar por radio hasta pasados unos segundos. */
const RADIO_SILENCE_MS = 6000;

export function useTap(owner: string, eventId: string | null) {
  const current = useSessionGuard(owner);
  const generation = useRef(0);
  const focused = useRef(true);
  const sessionRef = useRef<TapSession | null>(null);
  const expires = useRef(0);
  const connecting = useRef(false);
  const matched = useRef(false);
  const arming = useRef(false);
  const keys = useRef(new Map<string, { key: string; at: number }>());
  const attempts = useRef(new Map<string, number>());
  const capabilityRef = useRef<Radio.TapCapability | null>(null);

  const [capability, setCapability] = useState<Radio.TapCapability | null>(null);
  const [session, setSession] = useState<TapSession | null>(null);
  const [phase, setPhase] = useState<TapPhase>('idle');
  const [sighting, setSighting] = useState<Radio.TapSighting | null>(null);
  const [candidate, setCandidate] = useState<TapCandidate | null>(null);
  const [result, setResult] = useState<TapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radioError, setRadioError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const valid = useCallback((g: number) => current() && focused.current && g === generation.current, [current]);

  // Pantalla encendida mientras dura la sesión: el gesto es presencial.
  useEffect(() => {
    if (!session) return;
    const tag = 'franky-tap-' + session.token;
    let active = true;
    void activateKeepAwakeAsync(tag).then(() => { if (!active) void deactivateKeepAwake(tag); }).catch(() => {});
    return () => { active = false; void deactivateKeepAwake(tag).catch(() => {}); };
  }, [session?.token]);

  const disarm = useCallback((render = true) => {
    generation.current++;
    const old = sessionRef.current; sessionRef.current = null;
    connecting.current = false; matched.current = false; keys.current.clear(); attempts.current.clear();
    void Radio.stop();
    if (old && current()) void tapStop(old.token).catch(() => {});
    if (render && current()) {
      setSession(null); setPhase('idle'); setSighting(null); setCandidate(null); setResult(null); setElapsed(0);
    }
  }, [current]);

  const celebrate = useCallback((value: TapResult, g: number) => {
    if (!valid(g) || matched.current) return;
    matched.current = true; connecting.current = false;
    setResult(value); setPhase('matched'); setCandidate(null); setSighting(null); setError(null);
    void Radio.stop();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [valid]);

  const startRadio = useCallback(async (token: string, g: number) => {
    const c = capabilityRef.current;
    if (!c?.available) return;
    const ok = await Radio.start(token);
    if (valid(g) && !ok) setRadioError('No se pudo encender la detección. Podéis usar el código de la pantalla.');
  }, [valid]);

  const arm = useCallback(async () => {
    if (!current() || !focused.current || arming.current) return;
    arming.current = true;
    disarm(false);
    const g = generation.current;
    if (current()) { setError(null); setRadioError(null); setResult(null); setCandidate(null); setSighting(null); setElapsed(0); setPhase('searching'); }
    try {
      let c = await Radio.isAvailable();
      // Bluetooth (Android y iPhone sin banda ultraancha) necesita permiso: se
      // pide siempre, no solo cuando hay medición precisa.
      if (c.available || c.reason === 'no_permission') c = await Radio.requestPermissions();
      if (!valid(g)) return;
      capabilityRef.current = c; setCapability(c);
      const issued = await tapStart(eventId);
      if (!valid(g) || !issued || !isUuid(issued.token)) {
        if (issued && current()) void tapStop(issued.token).catch(() => {});
        if (valid(g)) setError('No se pudo preparar Franky Tap. Comprueba tu conexión.');
        return;
      }
      expires.current = Date.parse(issued.expires_at);
      sessionRef.current = issued; setSession(issued);
      await startRadio(issued.token, g);
    } catch (e) {
      if (valid(g)) { setError(tapErrorMessage(e)); setPhase('idle'); }
    } finally { arming.current = false; }
  }, [current, valid, disarm, eventId, startRadio]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void arm();
    return () => { focused.current = false; disarm(); };
  }, [arm, disarm]));

  // Segundo plano: se apaga la radio (batería y privacidad) pero la sesión
  // sigue; al volver se reanuda con el mismo testigo.
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      const s = sessionRef.current;
      if (!s || !current()) return;
      if (state === 'background') void Radio.stop();
      else if (state === 'active' && !matched.current && expires.current > Date.now()) void startRadio(s.token, generation.current);
    });
    return () => listener.remove();
  }, [current, startRadio]);

  const connect = useCallback(async (token: string, source: 'radio' | 'manual') => {
    const mine = sessionRef.current; const g = generation.current;
    if (!valid(g) || !mine || matched.current || connecting.current || !isUuid(token)) return;
    if (token.toLowerCase() === mine.token.toLowerCase()) { if (source === 'manual') setError('Ese es tu propio código.'); return; }
    const now = Date.now();
    if (source === 'radio' && now - (attempts.current.get(token) ?? 0) < RADIO_SILENCE_MS) return;
    attempts.current.set(token, now);
    // La misma detección (mismo testigo en pocos segundos) reutiliza la clave:
    // el servidor devuelve el mismo match en vez de crear otro.
    const known = keys.current.get(token);
    const key = known && now - known.at < 30_000 ? known.key : newTapKey();
    keys.current.set(token, { key, at: now });
    connecting.current = true; setPhase('connecting'); setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const value = await tapConnect(token, key, eventId);
      if (!valid(g)) return;
      if (value?.match) celebrate(value, g);
      else { setPhase('searching'); setError('No se pudo completar el match. Inténtalo de nuevo.'); }
    } catch (e) {
      if (!valid(g)) return;
      setPhase('searching'); setError(tapErrorMessage(e));
    } finally { if (valid(g)) connecting.current = false; }
  }, [valid, eventId, celebrate]);

  // Radio: avistamientos alimentan la tarjeta de confirmación; un acercamiento
  // confirmado por el módulo (banda ultraancha a ≤ 30 cm o Bluetooth pegado)
  // hace match sin tocar nada.
  const listening = !!session && !!capability?.available && phase !== 'matched';
  useEffect(() => {
    if (!listening || !session) return;
    const g = generation.current;
    const seen = Radio.addSightingListener(value => {
      if (!valid(g) || matched.current || !isUuid(value.token) || value.token.toLowerCase() === session.token.toLowerCase()) return;
      setSighting(value);
      setCandidate(prev => prev && prev.token !== value.token && prev.precise && !value.precise ? prev
        : { token: value.token, reference: value.token.slice(-6).toUpperCase(), precise: value.precise, distanceCm: value.distanceCm });
    });
    const tap = Radio.addTapListener(value => {
      if (!valid(g) || matched.current) return;
      if (value.precise && (value.distanceCm == null || value.distanceCm < 0 || value.distanceCm > 30)) return;
      void connect(value.token, 'radio');
    });
    const failed = Radio.addErrorListener(value => {
      if (!valid(g)) return;
      setRadioError(value.code === 'peer_version' ? 'El otro móvil necesita la misma versión de Franky.'
        : value.code === 'local_network_failed' ? 'No se puede buscar en la red local. Revisa el permiso de Red local de Franky en Ajustes.'
        : value.code === 'nearby_unavailable' ? 'No se puede medir la distancia. Revisa Interacción cercana y Bluetooth en Ajustes.'
        : value.code === 'no_permission' ? 'Falta el permiso de Bluetooth. Actívalo en Ajustes para detectar el otro móvil.'
        : value.code === 'radio_off' ? 'Enciende el Bluetooth para detectar el otro móvil.'
        : 'La detección por proximidad ha fallado. Podéis usar el código de la pantalla.');
    });
    return () => { seen.remove(); tap.remove(); failed.remove(); };
  }, [listening, session?.token, valid, connect]);

  // Sondeo: la otra pantalla puede haber hecho el match. También renueva el
  // testigo antes de que caduque y lleva el contador de segundos.
  useEffect(() => {
    if (!session || phase === 'matched') return;
    const g = generation.current; const started = Date.now();
    let timer: ReturnType<typeof setTimeout>; let failures = 0;
    const tick = async () => {
      if (!valid(g) || matched.current) return;
      setElapsed(Math.floor((Date.now() - started) / 1000));
      try {
        if (expires.current - Date.now() < RENEW_BEFORE_MS) {
          const renewed = await tapStart(eventId);
          if (!valid(g)) return;
          if (renewed && isUuid(renewed.token)) {
            expires.current = Date.parse(renewed.expires_at);
            if (renewed.token !== sessionRef.current?.token) {
              sessionRef.current = renewed; setSession(renewed);
              await startRadio(renewed.token, g);
              if (!valid(g)) return;
            }
          }
        }
        const value = await tapPoll(session.token);
        if (!valid(g)) return;
        if (value && 'match' in value && value.match && 'peer' in value) celebrate(value, g);
        if (failures > 0) setError(null);
        failures = 0;
      } catch (e) {
        if (!valid(g)) return;
        failures++;
        if (failures >= 3) setError(tapErrorMessage(e));
      }
      if (valid(g) && !matched.current) timer = setTimeout(() => void tick(), POLL_MS);
    };
    timer = setTimeout(() => void tick(), 600);
    return () => clearTimeout(timer);
  }, [session?.token, phase === 'matched', valid, celebrate, eventId, startRadio]);

  /** "Hacer match con este móvil" o código escaneado. */
  const confirm = useCallback((token: string) => { void connect(token, 'manual'); }, [connect]);
  const dismissCandidate = useCallback(() => setCandidate(null), []);
  /** Tras un match, volver a buscar con el mismo testigo. */
  const again = useCallback(() => {
    if (!current()) return;
    matched.current = false; keys.current.clear(); attempts.current.clear();
    setResult(null); setCandidate(null); setSighting(null); setError(null); setPhase('searching');
    const s = sessionRef.current;
    if (s && expires.current > Date.now()) void startRadio(s.token, generation.current);
    else void arm();
  }, [current, startRadio, arm]);

  return { capability, session, phase, sighting, candidate, result, error, radioError, elapsed,
    retry: arm, confirm, dismissCandidate, again,
    isActive: (token: string) => current() && focused.current && sessionRef.current?.token === token };
}
