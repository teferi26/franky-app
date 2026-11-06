// ─── Términos de uso (nativo) ────────────────────────────────────────────
// Requisito de las tiendas: el texto legal tiene que poder leerse dentro de
// la app, no solo en un enlace a la web. El contenido es el MISMO que
// web/src/app/terminos/page.tsx: si cambia allí, hay que cambiarlo aquí.
import React from 'react';
import { View, Text, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

const ULTIMA_ACTUALIZACION = '20 de septiembre de 2026';

type Seccion = { titulo: string; parrafos: string[]; lista?: string[] };

const SECCIONES: Seccion[] = [
  {
    titulo: '1. Aceptación',
    parrafos: [
      'Al acceder y utilizar Franky (web y app móvil), aceptas estos términos de uso en su totalidad. Si no estás de acuerdo, no utilices la plataforma.',
    ],
  },
  {
    titulo: '2. Descripción del servicio',
    parrafos: [
      'Franky es una plataforma informativa para estudiantes universitarios en España que ofrece: información sobre carreras y notas de corte, buscador de becas, guía de alojamiento, test vocacional, sistema de matching de compañeros de piso y noticias educativas.',
    ],
  },
  {
    titulo: '3. Registro y cuenta',
    parrafos: [
      'Para acceder a funciones avanzadas necesitas crear una cuenta. Eres responsable de mantener la confidencialidad de tus credenciales. Debes proporcionar información veraz y actualizada. Nos reservamos el derecho de suspender cuentas que incumplan estos términos.',
    ],
  },
  {
    titulo: '4. Suscripciones y pagos',
    parrafos: [
      'Los planes de pago (Pro y Premium) se gestionan a través de Stripe. La suscripción se renueva automáticamente. Puedes cancelar en cualquier momento desde tu perfil. No se realizan reembolsos por períodos parciales, salvo lo exigido por ley.',
    ],
  },
  {
    titulo: '5. Uso aceptable',
    parrafos: [
      'Tolerancia cero con el acoso, las amenazas, el odio, la explotación sexual, el contenido sexual explícito y la difusión de datos privados de otras personas sin su consentimiento. Estas conductas y los usuarios abusivos no tienen cabida en Franky.',
      'Antes de publicar en FOMO, Crush o historias debes aceptar expresamente estas normas y autorizar el envío del texto, las encuestas y las imágenes de tus publicaciones a Google Gemini para detectar abusos. No enviamos tu identificador interno de cuenta. Los audios, vídeos y contenidos dudosos permanecen retenidos para revisión del equipo. Consulta el tratamiento de datos en franky.es/privacidad. Las infracciones confirmadas suponen la retirada del contenido y la suspensión de la cuenta responsable.',
      'Puedes ocultar una publicación inmediatamente desde su menú. También puedes denunciar desde el menú de cada publicación, comentario o historia y bloquear a su autor, también si publica en anónimo. El contenido denunciado desaparece de tu vista y el bloqueo impide nuevas interacciones entre ambas cuentas. El equipo atiende las denuncias en un plazo de 24 horas. Si una denuncia sigue sin resolver, el contenido se retiene preventivamente antes de ese plazo.',
      'Para comunicar un problema o pedir revisión de una decisión escribe a soporte@franky.es o utiliza el formulario de contacto de Franky en franky.es/contacto. No incluyas datos privados de terceros en publicaciones públicas.',
      'Queda prohibido:',
    ],
    lista: [
      'Usar la plataforma para fines ilegales o no autorizados.',
      'Intentar acceder a datos de otros usuarios sin autorización.',
      'Publicar contenido ofensivo, fraudulento o que viole derechos de terceros.',
      'Realizar scraping o extracción masiva de datos.',
    ],
  },
  {
    titulo: '6. Información de terceros',
    parrafos: [
      'La información sobre universidades, notas de corte, becas y alojamiento proviene de fuentes públicas oficiales. Nos esforzamos por mantenerla actualizada, pero no garantizamos su exactitud absoluta. Consulta siempre las fuentes oficiales antes de tomar decisiones.',
    ],
  },
  {
    titulo: '7. Propiedad intelectual',
    parrafos: [
      'El diseño, código, marca y contenidos originales de Franky están protegidos por derechos de propiedad intelectual. No puedes reproducirlos sin autorización expresa.',
    ],
  },
  {
    titulo: '8. Limitación de responsabilidad',
    parrafos: [
      'Franky se proporciona “tal cual”. No nos hacemos responsables de decisiones tomadas basándose en la información de la plataforma, interrupciones del servicio o pérdida de datos más allá de lo establecido por ley.',
    ],
  },
  {
    titulo: '9. Modificaciones',
    parrafos: [
      'Podemos modificar estos términos en cualquier momento. Te notificaremos los cambios significativos por email. El uso continuado implica aceptación.',
    ],
  },
  {
    titulo: '10. Legislación aplicable',
    parrafos: [
      'Estos términos se rigen por la legislación española. Para cualquier controversia, serán competentes los juzgados y tribunales del domicilio del usuario.',
    ],
  },
];

export default function Terminos() {
  const router = useRouter();
  return (
    <Screen title="Términos de uso" back>
      <FadeIn style={{ paddingHorizontal: S.lg, paddingTop: S.xl, paddingBottom: S.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FileText size={17} color={C.blue} strokeWidth={1.75} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Última actualización: {ULTIMA_ACTUALIZACION}</Text>
        </View>
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[F.display, { fontSize: 27, letterSpacing: -1, lineHeight: 31, marginTop: 10 }]}>Términos y condiciones de uso</Text>
      </FadeIn>

      {SECCIONES.map((s) => (
        <View key={s.titulo} style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: 8 }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>{s.titulo}</Text>
          {s.parrafos.map((p, i) => (
            <Text key={i} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { lineHeight: 22 }]}>{p}</Text>
          ))}
          {s.lista ? (
            <View style={{ gap: 6 }}>
              {s.lista.map((item) => (
                <View key={item} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.error, fontFamily: FONT.heading }]}>•</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1, lineHeight: 22 }]}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      <View style={{ marginTop: S.xl, marginHorizontal: S.lg, paddingTop: S.lg, borderTopWidth: 0.5, borderTopColor: C.borderLight, flexDirection: 'row', gap: 18, borderRadius: R.sm }}>
        <Btn variant="link" label="Privacidad" onPress={() => { void Linking.openURL('https://franky.es/privacidad').catch(() => {}); }} />
        <Btn variant="link" label="Cookies" onPress={() => router.push('/cookies')} />
      </View>
    </Screen>
  );
}
