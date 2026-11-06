import { openSocialInstagram } from '@/lib/social-demo';
// ─── Piezas compartidas por las pestañas de Crush ───────────────────────────
// Todo lo que se repite entre Peticiones, Matches e Invitar vive aquí para
// que las cinco pestañas se lean como una sola pantalla: la nota de cabecera,
// el nombre de la persona y el botón del @.
import React from 'react';
import { View, Text } from 'react-native';
import { AtSign, Lock, WifiOff, type LucideIcon } from 'lucide-react-native';
import { EmptyState, Tap } from '@/components/ui';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F, FONT } from '@/theme';

/** Lo que ve quien aún no ha activado Crush en las pestañas que lo exigen
 *  (request_ig, nominate_friend y compañía fallan sin opt-in). */
export function CrushLocked({ onActivate, what }: { onActivate: () => void; what: string }) {
  return (
    <EmptyState icon={Lock} title="Activa Crush primero"
      subtitle={`Pon tu usuario de Instagram para ${what}. Tu @ solo se comparte si hay match.`}
      cta="Activar Crush" onCta={onActivate} />
  );
}

/** Fallo de red o de RPC: nunca un spinner eterno, siempre un reintento. */
export function CrushError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState icon={WifiOff} title="No se pudo cargar"
      subtitle="Comprueba tu conexión e inténtalo de nuevo."
      cta="Reintentar" onCta={onRetry} />
  );
}

/** Nota de cabecera de una pestaña: superficie con hairline e icono suelto,
 *  nunca un bloque tintado. Es la misma pieza en Peticiones e Invitar. */
export function CrushNote({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <View style={{
      flexDirection: 'row', gap: 10, alignItems: 'flex-start',
      marginHorizontal: S.lg, marginTop: S.lg, marginBottom: 12,
      backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border,
      paddingHorizontal: 14, paddingVertical: 12,
    }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 1 }}>
        <Icon size={16} color={C.blue} strokeWidth={1.75} />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text, fontSize: 13.5, lineHeight: 19 }]}>
        {children}
      </Text>
    </View>
  );
}

/** Nombre y edad. La revisión histórica de capturas no acredita propiedad. */
export function PersonTitle({ name, age, light }: {
  name: string | null; age: number | null; verified?: boolean; light?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
        style={[F.h3, { flexShrink: 1, fontSize: 15.5, letterSpacing: -0.25 }, light && { color: C.white }]}>
        {name ?? 'Estudiante'}{age != null ? `, ${age}` : ''}
      </Text>
    </View>
  );
}

/** Botón del @ de un match: píldora violeta sólida (nunca degradado). Blanco
 *  sobre violeta es la única excepción de color fijo, y sale de C.onAccent. */
export function HandleButton({ handle, name, maxWidth = 108 }: {
  handle: string; name: string | null; maxWidth?: number;
}) {
  return (
    <Tap onPress={() => { void openSocialInstagram(handle); }}
      accessibilityLabel={`Abrir Instagram de ${name ?? 'este match'}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34,
        backgroundColor: C.blue, borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 7,
      }}>
      <AtSign size={13} color={C.onAccent} strokeWidth={2.2} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
        style={{ color: C.onAccent, fontFamily: FONT.semibold, fontSize: 12.5, letterSpacing: -0.1, maxWidth }}>
        {handle}
      </Text>
    </Tap>
  );
}
