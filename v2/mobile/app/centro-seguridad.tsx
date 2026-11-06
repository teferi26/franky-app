import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn } from '@/components/ui';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S } from '@/theme';

export default function SafetyCenter() {
  const router = useRouter();
  const [error, setError] = useState('');
  const open = (url: string) => { void Linking.openURL(url).catch(() => setError('No se pudo abrir. Puedes escribir a soporte@franky.es o usar el formulario de contacto.')); };
  return <Screen title="Seguridad de la comunidad" back>
    <View style={{ padding: S.lg, gap: S.lg }}>
      <ShieldCheck color={C.blue} size={36} />
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>Tolerancia cero con el abuso</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>No permitimos acoso, amenazas, odio, explotación sexual, contenido sexual explícito ni difusión de datos privados. Las normas se aplican también a publicaciones anónimas.</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Abre el menú ⋯ de la publicación, comentario o historia: «Ocultar» la quita de tu vista; «Denunciar» además avisa al equipo; «Bloquear» impide nuevas interacciones con esa persona sin revelar su identidad.</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Revisamos las denuncias en un máximo de 24 horas. Si confirmamos una infracción, retiramos el contenido y suspendemos la cuenta responsable. Puedes pedir revisión de una decisión por correo.</Text>
      <Text selectable maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>soporte@franky.es</Text>
      <Btn label="Comunicar actividad inapropiada" onPress={() => open('mailto:soporte@franky.es?subject=Seguridad%20de%20la%20comunidad%20Franky')} />
      <Btn variant="secondary" label="Formulario de contacto" onPress={() => open('https://franky.es/contacto')} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Indica la publicación o dónde ocurrió el problema. No compartas datos privados de otras personas en el muro.</Text>
      {error ? <Text accessibilityLiveRegion="polite" style={[F.body, { color: C.error }]}>{error}</Text> : null}
      <Btn variant="link" label="Normas y términos de uso" onPress={() => router.push('/terminos')} />
    </View>
  </Screen>;
}
