// ─── Centro de ayuda / FAQ ───────────────────────────────────────────────
// Preguntas frecuentes agrupadas por tema, en acordeón (una respuesta abierta
// a la vez por grupo). Todo el contenido vive en este fichero: no hay tabla
// ni CMS detrás, así que las respuestas hay que mantenerlas a mano si cambia
// una función de la app. Al final, contacto: sugerencias in-app y correo.
import React, { useState } from 'react';
import { View, Text, Linking, LayoutAnimation, Platform, UIManager } from 'react-native';
import {
  ChevronDown, ChevronUp, HelpCircle, Mail,
  UserCircle2, Sparkles, Heart, MessageCircle, Ticket, ShieldCheck, Wallet,
  FileText, Cookie,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Tap, Btn, NavRow } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

// LayoutAnimation en Android necesita este interruptor explícito; sin él la
// respuesta del acordeón aparece de golpe y da un saltón.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SUPPORT_EMAIL = 'soporte@franky.es';

type QA = { q: string; a: string };
type Group = { title: string; icon: typeof UserCircle2; items: QA[] };

const GROUPS: Group[] = [
  {
    title: 'Cuenta y registro',
    icon: UserCircle2,
    items: [
      {
        q: '¿Cómo me registro en Franky?',
        a: 'Con tu correo (a poder ser el de la universidad) y una contraseña. Si usas el correo universitario podrás verificarte como estudiante después, desde Privacidad.',
      },
      {
        q: '¿Es obligatorio verificarme como estudiante?',
        a: 'No, pero te da el check de estudiante verificado en tu perfil. Se hace desde el menú, en Privacidad > Verificar email de estudiante, con el correo de tu universidad.',
      },
      {
        q: '¿Cómo cambio mi foto, nombre o descripción?',
        a: 'Desde tu perfil, en Editar perfil. Ahí también gestionas tus intereses y el resto de datos visibles.',
      },
      {
        q: '¿Cómo elimino mi cuenta?',
        a: 'Desde Perfil > Eliminar mi cuenta o Privacidad > Eliminar mi cuenta. La solicitud es irreversible: se cierra tu sesión y se eliminan tus datos personales en un máximo de 30 días. Recibirás una confirmación por correo. Solo se conservan los registros necesarios para obligaciones legales, operaciones pendientes y derechos de otras personas.',
      },
    ],
  },
  {
    title: 'FOMO y publicaciones',
    icon: Sparkles,
    items: [
      {
        q: '¿Qué es el FOMO?',
        a: 'Es el muro de tu universidad: publicaciones, fotos, vídeos, notas de voz y encuestas de gente de tu campus, ordenadas por relevancia.',
      },
      {
        q: '¿Puedo publicar de forma anónima?',
        a: 'Sí. Una publicación anónima puede aparecer en el muro de tu campus, pero no muestra tu nombre a los demás. Sigue sujeta a las normas: se puede denunciar y bloquear a su autor sin revelar su identidad.',
      },
      {
        q: '¿Cómo reacciono, guardo o doy me gusta a algo?',
        a: 'Con los iconos bajo cada publicación. Lo que guardes o te guste queda accesible desde el menú de tu perfil, en "Publicaciones guardadas" y "Me gusta".',
      },
      {
        q: '¿Puedo ver quién ha publicado algo antes de comentar?',
        a: 'Sí, tocando el nombre o el avatar de la publicación vas directo a ese perfil (salvo que sea anónima).',
      },
    ],
  },
  {
    title: 'Crush',
    icon: Heart,
    items: [
      {
        q: '¿Qué es Crush?',
        a: 'La sección para ligar: publicaciones de gente que busca conocer a alguien. Si os gustáis mutuamente, hacéis match y se abre un chat.',
      },
      {
        q: '¿Tengo que compartir mi Instagram?',
        a: 'No hasta que quieras. Solo se comparte tu @ de Instagram cuando aceptas una petición de contacto de la otra persona.',
      },
      {
        q: '¿Puedo filtrar lo que veo o ver mis matches anteriores?',
        a: 'Sí. El panel de filtros del tablón te deja acotar por audiencia, y el icono de historial (arriba) muestra todos tus matches pasados.',
      },
      {
        q: '¿Cómo dejo de ver a alguien?',
        a: 'Puedes bloquearlo desde su perfil o desde el chat. Se gestiona luego en Privacidad > Cuentas bloqueadas.',
      },
    ],
  },
  {
    title: 'Chats',
    icon: MessageCircle,
    items: [
      {
        q: '¿Cómo empiezo una conversación?',
        a: 'Se abre sola cuando haces match en Crush, o al unirte al grupo de un evento. No puedes escribir en frío a quien no conoces.',
      },
      {
        q: '¿Puedo buscar dentro de un chat?',
        a: 'Sí, con la lupa de la cabecera del chat: busca por texto entre todos los mensajes de esa conversación.',
      },
      {
        q: '¿Puedo reenviar un mensaje a otro chat?',
        a: 'Sí, manteniendo pulsado el mensaje y eligiendo "Reenviar" en el menú de acciones.',
      },
      {
        q: '¿Puedo archivar una conversación?',
        a: 'Sí, desde el menú de opciones del chat (los tres puntos). Un chat archivado deja de aparecer en tu lista, pero no se borra.',
      },
      {
        q: '¿Puedo poner mi propio fondo de chat?',
        a: 'Sí, en el selector de tema del chat puedes elegir un color o una foto de tu carrete como fondo. Solo lo ves tú.',
      },
    ],
  },
  {
    title: 'Eventos y entradas',
    icon: Ticket,
    items: [
      {
        q: '¿Cómo compro una entrada?',
        a: 'Desde la página del evento. Tras el pago, la entrada (con su código QR) aparece en el menú de tu perfil, en "Mis entradas".',
      },
      {
        q: '¿Cómo guardo un evento para más tarde?',
        a: 'Con el icono de guardar en la tarjeta o en la página del evento. Se guarda en "Favoritos", en el menú de tu perfil.',
      },
      {
        q: '¿Puedo ver los eventos en un mapa?',
        a: 'Sí, en la pestaña Eventos hay un botón para cambiar entre vista de Lista y vista de Mapa, con las zonas de ocio del campus.',
      },
      {
        q: '¿Cómo creo un evento?',
        a: 'Con el botón de crear (el "+" del menú de creación). Puedes revisar cómo quedará antes de publicarlo, y si dura varios días puedes indicar fecha de inicio y de fin.',
      },
    ],
  },
  {
    title: 'Privacidad y seguridad',
    icon: ShieldCheck,
    items: [
      {
        q: '¿Puedo ocultar mi perfil?',
        a: 'Sí. En Privacidad tienes el interruptor "Perfil oculto": si lo activas, no apareces en las sugerencias de descubrimiento de otros usuarios.',
      },
      {
        q: '¿Cómo denuncio o bloqueo a alguien?',
        a: 'Desde su perfil o desde un chat con esa persona tienes las opciones de denunciar y bloquear. Los bloqueos se gestionan luego en Privacidad > Cuentas bloqueadas.',
      },
      {
        q: '¿Dónde veo la política de privacidad y los términos?',
        a: 'En Privacidad tienes acceso directo a los Términos del servicio y a la Política de privacidad.',
      },
    ],
  },
  {
    title: 'Pagos',
    icon: Wallet,
    items: [
      {
        q: '¿Cómo se cobran las entradas de eventos?',
        a: 'El pago se procesa de forma segura con Stripe. Antes de pagar siempre ves el desglose: lo recaudado, la comisión de servicio de Franky y lo que recibe el organizador.',
      },
      {
        q: '¿Dónde veo mis facturas?',
        a: 'En "Mis facturas", dentro del menú de tu perfil. Cada factura (entradas o suscripción) se abre en su página segura de Stripe para verla o descargarla.',
      },
      {
        q: 'Soy organizador, ¿dónde veo lo que gano?',
        a: 'En "Cartera", dentro del menú de tu perfil: verás lo recaudado por evento y el desglose de comisiones. Las transferencias a tu cuenta bancaria se gestionan desde tu panel de Stripe Express, enlazado ahí mismo.',
      },
    ],
  },
];

function AccordionItem({ item, open, onToggle }: { item: QA; open: boolean; onToggle: () => void }) {
  return (
    <View style={{ borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
      <Tap onPress={onToggle} accessibilityLabel={item.q}
        accessibilityHint={open ? 'Toca para cerrar la respuesta' : 'Toca para ver la respuesta'}
        accessibilityState={{ selected: open }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, minHeight: 48 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>{item.q}</Text>
          {open ? <ChevronUp size={18} color={C.blue} strokeWidth={2.2} /> : <ChevronDown size={18} color={C.muted} strokeWidth={2.2} />}
        </View>
      </Tap>
      {open ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { paddingBottom: 14, lineHeight: 21, color: C.muted }]}>{item.a}</Text>
      ) : null}
    </View>
  );
}

export default function Ayuda() {
  const router = useRouter();
  // Clave única por pregunta: "grupo-índice". Un Set permite varias abiertas.
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const reduceMotion = useReduceMotion();

  const toggle = (key: string) => {
    // La respuesta se despliega con transición: sin ella el bloque de texto
    // aparece de golpe y cuesta seguir dónde estabas.
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <Screen title="Ayuda" back>
      {/* Cabecera editorial: rotulo, titular grande y una frase. */}
      <FadeIn style={{ paddingHorizontal: S.lg, paddingTop: S.xl, paddingBottom: S.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <HelpCircle size={18} color={C.blue} strokeWidth={1.75} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Preguntas frecuentes</Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 8, lineHeight: 19 }]}>
          Las preguntas más habituales sobre Franky. Toca una para ver la respuesta.
        </Text>
      </FadeIn>

      {GROUPS.map((group, gi) => (
        <FadeIn key={group.title} index={gi} style={{ marginTop: S.md, marginHorizontal: S.lg, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: S.lg, backgroundColor: C.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16, paddingBottom: 8 }}>
            <group.icon size={19} color={C.blue} strokeWidth={1.75} />
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>{group.title}</Text>
          </View>
          {group.items.map((item, i) => {
            const key = `${group.title}-${i}`;
            return (
              <AccordionItem key={key} item={item} open={openKeys.has(key)} onToggle={() => toggle(key)} />
            );
          })}
        </FadeIn>
      ))}

      <View style={{ marginTop: S.xl, marginHorizontal: S.lg, alignItems: 'center', gap: 12, paddingBottom: S.xl }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center' }]}>¿No has encontrado lo que buscabas?</Text>
        <Btn label="Sugerir una mejora" onPress={() => router.push('/sugerencias')} />
        <Tap onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} accessibilityRole="link"
          accessibilityLabel={`Escribir a ${SUPPORT_EMAIL}`}
          style={{ paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Mail size={15} color={C.blue} strokeWidth={2} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blue, fontSize: 13.5, fontFamily: FONT.semibold }}>{SUPPORT_EMAIL}</Text>
          </View>
        </Tap>
      </View>

      {/* Documentos legales en nativo (requisito de las tiendas). */}
      <View style={{ marginHorizontal: S.lg, marginBottom: S.xl, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, paddingVertical: 4 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: 10, paddingBottom: 2 }]}>Legal</Text>
        <NavRow icon={FileText} title="Términos de uso" onPress={() => router.push('/terminos')} />
        <NavRow icon={ShieldCheck} title="Política de privacidad" onPress={() => router.push('/privacidad')} />
        <NavRow icon={Cookie} title="Política de cookies" onPress={() => router.push('/cookies')} />
      </View>
    </Screen>
  );
}
