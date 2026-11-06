import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { EyeOff, Flag, Ban, LifeBuoy, MoreHorizontal } from 'lucide-react-native';
import { OptionsSheet, Tap } from './ui';
import { confirmSocialAction, hideSocialContent, type SocialContentKind } from '@/lib/social-moderation';
import { C } from '@/theme';

export function SocialSafetyMenu({ kind, id, onSuppressed }: { kind: SocialContentKind; id: string; onSuppressed: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return <>
    <Tap onPress={() => setOpen(true)} accessibilityLabel="Opciones de seguridad" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <MoreHorizontal size={22} color={C.text} />
    </Tap>
    <OptionsSheet visible={open} title="Opciones de seguridad" onClose={() => setOpen(false)} options={[
      { label: 'Ocultar contenido', icon: EyeOff, onPress: () => { void hideSocialContent(kind, id, onSuppressed); } },
      { label: 'Denunciar contenido', icon: Flag, onPress: () => { void confirmSocialAction(kind, id, false, onSuppressed); } },
      { label: 'Bloquear a esta persona', icon: Ban, onPress: () => { void confirmSocialAction(kind, id, true, onSuppressed); } },
      { label: 'Contactar con Franky', icon: LifeBuoy, onPress: () => router.push('/centro-seguridad') },
    ]} />
  </>;
}
