// Guía de trámites universitarios (mejora 89), en acordeón. Todo el contenido
// vive aquí (sin tabla detrás): las fechas cambian cada curso, así que los
// plazos se redactan de forma orientativa, nunca como si fueran oficiales.
//
// Diseño: cada trámite es una tarjeta del kit con su icono suelto; abrir y cerrar
// se anima con Collapsible (altura animada) y los rótulos internos usan F.label.
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import {
  ChevronDown, ChevronUp, FileText, GraduationCap, Landmark, MapPinned,
  FileCheck2, Award, ShieldPlus, Info, CalendarClock, ClipboardList, HelpCircle,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Tap, Card } from '@/components/ui';
import { FadeIn, Collapsible } from '@/components/motion';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F } from '@/theme';

type Tramite = {
  title: string;
  icon: typeof FileText;
  quees: string;
  cuando: string;
  necesitas: string[];
};

const TRAMITES: Tramite[] = [
  {
    title: 'Matrícula',
    icon: FileText,
    quees: 'El trámite que te inscribe oficialmente en tus asignaturas del curso. Sin matricularte no eres alumno oficial ni puedes examinarte.',
    cuando: 'Suele abrirse en julio para quien entra de nuevo (tras la admisión) y en julio o septiembre para quien continúa curso. Hay un segundo plazo en septiembre para rezagados.',
    necesitas: [
      'DNI o NIE',
      'Nota de admisión o expediente del curso anterior',
      'Foto tipo carnet (algunas universidades)',
      'Datos de una cuenta bancaria para domiciliar el pago o las tasas',
      'Certificado de familia numerosa o discapacidad, si aplica (para descuentos)',
    ],
  },
  {
    title: 'Beca MEC (convocatoria general del Ministerio)',
    icon: GraduationCap,
    quees: 'La beca general de estudios del Ministerio de Educación: cubre matrícula y, según renta y nota, una cuantía adicional. Es la más habitual entre estudiantes universitarios.',
    cuando: 'La solicitud suele abrirse a finales de marzo o en abril, con plazo hasta finales de mayo (fechas distintas para Cataluña y el País Vasco, que gestionan la suya propia). Se pide antes de conocer las notas finales, con la matrícula del curso anterior.',
    necesitas: [
      'Certificado o declaración de la renta familiar del año anterior',
      'DNI o NIE de quien solicita y de la unidad familiar',
      'Número de miembros de la unidad familiar y su situación (paro, discapacidad, familia numerosa…)',
      'Datos académicos: nota de acceso o del curso anterior, créditos matriculados',
      'Cuenta bancaria a tu nombre',
    ],
  },
  {
    title: 'Beca del Gobierno autonómico',
    icon: Landmark,
    quees: 'Ayudas propias de tu comunidad autónoma (movilidad, residencia, excelencia académica, necesidad económica…), compatibles en muchos casos con la beca MEC. Cada comunidad tiene su propia convocatoria y requisitos.',
    cuando: 'Varía mucho según la comunidad: algunas abren en otoño, otras en primavera. Conviene revisarlo cada curso en la web de la consejería de educación o universidades de tu comunidad.',
    necesitas: [
      'DNI o NIE',
      'Certificado de empadronamiento (si la beca exige residencia en la comunidad)',
      'Declaración de la renta o certificado de ingresos',
      'Justificante de matrícula del curso',
      'Los requisitos concretos varían por comunidad: revisa siempre la convocatoria oficial',
    ],
  },
  {
    title: 'Traslado de expediente',
    icon: MapPinned,
    quees: 'El trámite para cambiar de universidad (o de carrera) llevándote tus asignaturas superadas, de forma que puedan convalidarse en el nuevo centro.',
    cuando: 'Normalmente se solicita tras confirmar la admisión en la nueva universidad, antes de formalizar la matrícula: suele haber plazo entre julio y septiembre.',
    necesitas: [
      'Certificado académico oficial de la universidad de origen',
      'Resguardo de haber pagado las tasas de traslado en la universidad de origen',
      'Admisión confirmada en la universidad de destino',
      'DNI o NIE',
    ],
  },
  {
    title: 'Convalidaciones',
    icon: FileCheck2,
    quees: 'El reconocimiento de asignaturas ya superadas (en otra carrera, otra universidad o un ciclo formativo) para que no tengas que volver a cursarlas.',
    cuando: 'Se solicita al empezar en la nueva carrera o universidad, normalmente junto con la matrícula o poco después; cada centro fija su propio plazo dentro del curso.',
    necesitas: [
      'Certificado académico con las asignaturas y calificaciones ya superadas',
      'Programas o guías docentes de esas asignaturas (para comparar contenidos)',
      'Impreso de solicitud de convalidación de tu universidad',
      'Pago de la tasa de estudio del expediente, si la universidad la cobra',
    ],
  },
  {
    title: 'Título y suplemento europeo',
    icon: Award,
    quees: 'Una vez terminada la carrera, el título es el documento oficial que acredita tus estudios; el Suplemento Europeo al Título (SET) detalla tu expediente en un formato reconocido en toda la Unión Europea, útil para trabajar o estudiar fuera.',
    cuando: 'Se solicita después de cerrar el expediente (todas las asignaturas superadas, incluido el TFG/TFM), normalmente durante todo el año en la secretaría de tu facultad. La expedición del título físico puede tardar varios meses.',
    necesitas: [
      'Expediente académico completo y cerrado',
      'DNI o NIE en vigor',
      'Justificante de pago de las tasas de expedición del título',
      'Solicitud del Suplemento Europeo, si lo necesitas (trámite aparte en algunas universidades)',
    ],
  },
  {
    title: 'Seguro escolar',
    icon: ShieldPlus,
    quees: 'Un seguro obligatorio de bajo coste para estudiantes menores de 28 años, que cubre accidentes, enfermedad y algunos infortunios familiares durante el curso.',
    cuando: 'Se paga automáticamente junto con las tasas de matrícula, así que no hay que solicitarlo aparte: se activa al formalizar la matrícula de cada curso.',
    necesitas: [
      'Nada aparte: se incluye en el pago de la matrícula',
      'Tener menos de 28 años en la fecha de matrícula',
      'El carnet o certificado del seguro lo emite la secretaría si necesitas usarlo',
    ],
  },
];

function Block({ icon: Icon, label, children }: { icon: typeof Info; label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={13} color={C.muted} strokeWidth={2} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

function AccordionItem({ item, open, onToggle }: { item: Tramite; open: boolean; onToggle: () => void }) {
  const Icono = item.icon;
  return (
    <Card style={{ padding: 0, borderWidth: open ? 1 : 0.5, borderColor: open ? C.blue : C.border }}>
      <Tap onPress={onToggle} haptic accessibilityLabel={item.title} accessibilityHint={open ? 'Contrae el trámite' : 'Despliega el trámite'} accessibilityState={{ selected: open }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: S.lg, paddingVertical: 14, minHeight: 62 }}>
          {/* Icono suelto de trazo fino: violeta cuando el trámite está abierto. */}
          <Icono size={21} color={open ? C.blue : C.text} strokeWidth={1.75} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>{item.title}</Text>
          {open ? <ChevronUp size={18} color={C.muted} strokeWidth={1.9} /> : <ChevronDown size={18} color={C.muted} strokeWidth={1.9} />}
        </View>
      </Tap>
      <Collapsible open={open}>
        <View style={{ paddingHorizontal: S.lg, paddingBottom: 18, gap: 16 }}>
          <Block icon={HelpCircle} label="Qué es">
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{item.quees}</Text>
          </Block>
          <Block icon={CalendarClock} label="Cuándo se hace (orientativo)">
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{item.cuando}</Text>
          </Block>
          <Block icon={ClipboardList} label="Qué necesitas">
            {item.necesitas.map((n, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 2 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.blue }]}>•</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>{n}</Text>
              </View>
            ))}
          </Block>
        </View>
      </Collapsible>
    </Card>
  );
}

export default function Tramites() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (title: string) => {
    // La altura la anima Collapsible: aquí solo cambia cuál está abierto.
    setOpenKey((prev) => (prev === title ? null : title));
  };

  return (
    <Screen title="Guía de trámites" back>
      <Card flat style={{ marginTop: S.lg, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Info size={18} color={C.blue} strokeWidth={2} style={{ marginTop: 1 }} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>
          Los plazos de esta guía son orientativos y pueden cambiar cada curso. Confirma siempre las fechas exactas en la web oficial de tu universidad.
        </Text>
      </Card>

      {TRAMITES.map((t, i) => (
        <FadeIn key={t.title} index={i}>
          <AccordionItem item={t} open={openKey === t.title} onToggle={() => toggle(t.title)} />
        </FadeIn>
      ))}

      <View style={{ height: S.xl }} />
    </Screen>
  );
}
