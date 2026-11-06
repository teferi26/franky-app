import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { hasSeenTour } from '@/lib/tour';
import { C } from '@/theme';
import { useWorkspace } from '@/components/WorkspaceProvider';

// Registro/login obligatorio nada más entrar: sin sesión no hay app.
// El gate global vive en app/_layout.tsx; esto decide solo la primera pantalla.
// Con sesión, si este móvil aún no ha visto la guía de la app (una vez por
// dispositivo), se enseña antes del feed: así quien actualiza también
// descubre lo nuevo.
export default function Index() {
  const { ready, active } = useWorkspace();
  const [target, setTarget] = useState<'/welcome' | '/(tabs)/feed' | '/tour' | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setTarget('/welcome'); return; }
        const seen = await hasSeenTour();
        setTarget(seen ? '/(tabs)/feed' : '/tour');
      } catch {
        setTarget('/welcome');
      }
    })();
  }, []);
  // Mientras se decide el destino: superficie del tema, nunca un hueco negro.
  if (!target || !ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  if (active && target !== '/welcome') return <Redirect href="/(workspace)/resumen" />;
  return <Redirect href={target} />;
}
