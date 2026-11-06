// ─── Política de cookies (nativo) ────────────────────────────────────────
// Requisito de las tiendas: el texto legal tiene que poder leerse dentro de
// la app. El contenido es el MISMO que web/src/app/cookies/page.tsx: si
// cambia allí, hay que cambiarlo aquí.
import React from 'react';
import { View, Text, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Cookie } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Pill, Card } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, FONT } from '@/theme';

const ULTIMA_ACTUALIZACION = 'marzo 2026';
const STRIPE_PRIVACY_URL = 'https://stripe.com/privacy';

type TipoCookie = { nombre: string; etiqueta: string; tone: 'green' | 'blue' | 'orange'; texto: string };

const TIPOS: TipoCookie[] = [
  {
    nombre: 'Esenciales',
    etiqueta: 'Necesarias',
    tone: 'green',
    texto: 'Cookies de autenticación (Supabase Auth), preferencias de sesión y seguridad CSRF. No se pueden desactivar ya que son necesarias para el funcionamiento de la plataforma.',
  },
  {
    nombre: 'Funcionales',
    etiqueta: 'Opcionales',
    tone: 'blue',
    texto: 'Guardan tus preferencias de filtros, tema visual y últimas búsquedas para mejorar tu experiencia. Puedes desactivarlas sin afectar al funcionamiento básico.',
  },
  {
    nombre: 'Analíticas',
    etiqueta: 'Opcionales',
    tone: 'orange',
    texto: 'Nos ayudan a entender cómo usas la plataforma de forma anónima. Utilizamos estos datos para mejorar el servicio. No te identifican personalmente.',
  },
];

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: 8 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header" style={F.h2}>{titulo}</Text>
      {children}
    </View>
  );
}

export default function Cookies() {
  const router = useRouter();
  return (
    <Screen title="Política de cookies" back>
      <FadeIn style={{ paddingHorizontal: S.lg, paddingTop: S.xl, paddingBottom: S.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Cookie size={17} color={C.blue} strokeWidth={1.75} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Última actualización: {ULTIMA_ACTUALIZACION}</Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header"
          style={[F.display, { fontSize: 27, letterSpacing: -1, lineHeight: 31, marginTop: 10 }]}>Información sobre el uso de cookies en Franky</Text>
      </FadeIn>

      <Seccion titulo="¿Qué son las cookies?">
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { lineHeight: 22 }]}>
          Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitas un sitio web. Se utilizan para recordar tus preferencias, mantener tu sesión activa y mejorar tu experiencia de usuario.
        </Text>
      </Seccion>

      <Seccion titulo="Cookies que utilizamos">
        <View />
      </Seccion>
      {TIPOS.map((t) => (
        <Card key={t.nombre} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.tone === 'green' ? C.success : t.tone === 'blue' ? C.blue : C.warning }} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{t.nombre}</Text>
            <Pill label={t.etiqueta} tone={t.tone} />
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { lineHeight: 19 }]}>{t.texto}</Text>
        </Card>
      ))}

      <Seccion titulo="Gestionar cookies">
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { lineHeight: 22 }]}>
          Puedes gestionar tus preferencias de cookies en cualquier momento desde la configuración de tu navegador. Ten en cuenta que bloquear cookies esenciales puede afectar al funcionamiento de Franky.
        </Text>
      </Seccion>

      <Seccion titulo="Cookies de terceros">
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { lineHeight: 22 }]}>
          Utilizamos Stripe para pagos, que puede establecer sus propias cookies de seguridad. Consulta la{' '}
          <Text accessibilityRole="link" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blue, fontFamily: FONT.semibold }}
            onPress={() => Linking.openURL(STRIPE_PRIVACY_URL).catch(() => {})}>
            política de privacidad de Stripe
          </Text>
          {' '}para más información.
        </Text>
      </Seccion>

      <View style={{ marginTop: S.xl, marginHorizontal: S.lg, paddingTop: S.lg, borderTopWidth: 0.5, borderTopColor: C.borderLight, flexDirection: 'row', gap: 18 }}>
        <Btn variant="link" label="Privacidad" onPress={() => router.push('/privacidad')} />
        <Btn variant="link" label="Términos" onPress={() => router.push('/terminos')} />
      </View>
    </Screen>
  );
}
