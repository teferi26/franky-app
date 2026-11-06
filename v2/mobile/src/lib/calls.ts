// ─── Señalización de llamadas de voz/vídeo 1:1 (mejora 100, migración 139) ──
// La tabla `calls` guarda el estado (ringing/accepted/rejected/ended/missed)
// y `call_signals` lleva la oferta, la respuesta y los candidatos ICE de
// WebRTC por Supabase Realtime. Esto es solo el "apretón de manos": el audio
// y el vídeo van peer to peer aparte, sin pasar por Supabase.
//
// OJO MUY IMPORTANTE: react-native-webrtc es un módulo NATIVO que NO viene
// incluido en Expo Go. Aquí NUNCA se importa de forma estática (un import
// normal rompería toda la app en cuanto Metro intentase resolverlo): el
// require es perezoso y va siempre dentro de un try/catch. En Expo Go el
// require falla y isWebRtcAvailable() devuelve false; en un build EAS que sí
// incluya el módulo, funciona solo, sin tocar nada de este fichero.
//
// Todo aquí es fail-soft: la migración 139 (tablas + RPC) puede tardar en
// aplicarse en producción, así que ninguna función lanza si algo falla.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ensureSocialDemoFeature } from './social-demo';

export type CallKind = 'audio' | 'video';
export type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';
export type CallSignalKind = 'offer' | 'answer' | 'ice';

// Fila de la tabla `calls` (migración 139).
export interface CallRow {
  id: string;
  caller_id: string;
  callee_id: string;
  kind: CallKind;
  status: CallStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

// Fila de `call_signals`: el payload es el objeto que serializa
// react-native-webrtc para RTCSessionDescription/RTCIceCandidate.
export interface CallSignal {
  id: number;
  call_id: string;
  sender_id: string;
  kind: CallSignalKind;
  payload: Record<string, unknown>;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebRtcModule = any;

/**
 * Carga perezosa de react-native-webrtc. Devuelve el módulo si el binario
 * actual lo trae compilado (build EAS), o null si no está (Expo Go). Nunca
 * lanza: el require perezoso está siempre envuelto en try/catch.
 */
export function loadWebRtc(): WebRtcModule | null {
  try {
    // El nombre del paquete NO se referencia de ninguna otra forma en el
    // código: así Metro no intenta resolverlo al empaquetar para Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('react-native-webrtc');
    return mod ?? null;
  } catch {
    return null;
  }
}

/**
 * true si el motor de media (WebRTC nativo) está disponible en este binario.
 * En Expo Go siempre es false; en un build EAS con react-native-webrtc
 * instalado, true. La pantalla de llamada usa esto para decidir si puede
 * llamar de verdad o si debe explicar honestamente que no puede.
 */
export function isWebRtcAvailable(): boolean {
  const mod = loadWebRtc();
  return !!mod?.RTCPeerConnection;
}

/**
 * Inicia una llamada con otra persona (RPC start_call, migración 139). El
 * servidor ya comprueba bloqueos y privacidad de mensajes (can_message_user):
 * si no puedes escribirle, tampoco puedes llamarle. Devuelve el id de la
 * llamada nueva, o null si falla (bloqueo, sin red, migración pendiente).
 */
export async function startCall(calleeId: string, kind: CallKind): Promise<string | null> {
  try {
    if (!await ensureSocialDemoFeature('calls')) return null;
    const { data, error } = await supabase.rpc('start_call', {
      p_callee: calleeId,
      p_kind: kind,
    });
    if (error || !data) return null;
    return data as string;
  } catch {
    return null;
  }
}

/**
 * Cambia el estado de una llamada (aceptar, rechazar, colgar, marcar como
 * perdida). RPC set_call_status (139): solo el llamante o el llamado pueden
 * tocar su propia llamada.
 */
export async function setCallStatus(callId: string, status: CallStatus): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.rpc('set_call_status', {
      p_call: callId,
      p_status: status,
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * Envía una señal WebRTC (oferta, respuesta o candidato ICE) insertando en
 * call_signals. La RLS exige ser participante de la llamada y que siga
 * "viva" (ringing o accepted).
 */
export async function sendSignal(
  callId: string,
  kind: CallSignalKind,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false };
    const { error } = await supabase.from('call_signals').insert({
      call_id: callId,
      sender_id: user.id,
      kind,
      payload,
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

// Contador para nombres de canal ÚNICOS por suscripción (mismo patrón que
// subscribeToChatList en chat.ts). Sin esto, dos suscripciones a la misma
// llamada (p. ej. un remount de la pantalla) compartirían el canal cacheado
// por nombre y el segundo .on() tras .subscribe() petaría con "cannot add
// postgres_changes callbacks after subscribe".
let callChannelSeq = 0;

/**
 * Escucha en tiempo real las señales nuevas (offer/answer/ice) de esta
 * llamada y los cambios de estado de su fila en `calls`. Devuelve el canal;
 * el llamador debe hacer supabase.removeChannel(canal) al salir de la
 * pantalla de llamada.
 */
export function subscribeToCall(
  callId: string,
  handlers: {
    onSignal?: (signal: CallSignal) => void;
    onStatusChange?: (call: CallRow) => void;
  },
): RealtimeChannel {
  const channel = supabase.channel(`call:${callId}:${++callChannelSeq}`);
  if (handlers.onSignal) {
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `call_id=eq.${callId}` },
      (payload) => handlers.onSignal!(payload.new as CallSignal),
    );
  }
  if (handlers.onStatusChange) {
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
      (payload) => handlers.onStatusChange!(payload.new as CallRow),
    );
  }
  channel.subscribe();
  return channel;
}
