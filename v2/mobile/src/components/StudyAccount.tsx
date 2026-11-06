import React from 'react';
import { useRouter } from 'expo-router';
import { LogIn } from 'lucide-react-native';
import { Screen } from './Screen';
import { EmptyState, Skeleton } from './ui';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { studyStorage, type SessionIdentity } from '@/lib/study-storage';

/** Account changes discard drafts and component state as well as cached data. */
export function withStudyAccount(Component: React.ComponentType<{ owner: SessionIdentity }>, title: string) {
  return function StudyAccount() {
    const { uid } = useSessionIdentity();
    const router = useRouter();
    const owner = studyStorage.capture();
    // Estados completos mientras no hay dueño: esqueleto al comprobar la
    // sesión y estado vacío editorial (icono suelto + CTA) si no hay cuenta,
    // en vez de un botón solo en medio de la pantalla.
    if (!uid || !owner || owner.userId !== uid) return <Screen title={title} back>
      {uid === undefined ? <Skeleton height={220} /> : null}
      {uid === null ? <EmptyState icon={LogIn} title="Entra para guardar tu estudio"
        subtitle="Con tu cuenta, tus apuntes y tu progreso te siguen en cualquier dispositivo."
        cta="Iniciar sesión" onCta={() => router.push('/welcome')} /> : null}
    </Screen>;
    return <Component key={`${owner.userId}:${owner.generation}`} owner={owner} />;
  };
}
