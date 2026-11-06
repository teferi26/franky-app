import React from 'react';
import { Text, View } from 'react-native';
import { Btn } from './ui';
import { Screen } from './Screen';
import { socialDemoFeatureNotice, useSocialDemoAccessState, type SocialDemoAccess, type SocialDemoFeature } from '@/lib/social-demo';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { F, S } from '@/theme';

export function SocialDemoFeatureNotice({ access, feature, retry, checking = false }: {
  access: SocialDemoAccess | null; feature: SocialDemoFeature; retry: () => void; checking?: boolean;
}) {
  const notice = socialDemoFeatureNotice(access, feature);
  if (!notice) return null;
  return <View style={{ padding: S.md, gap: S.sm }}>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{!access && checking ? 'Comprobando las funciones disponibles para tu cuenta…' : notice}</Text>
    {!access ? <Btn small variant="secondary" label="Reintentar comprobación" onPress={retry} disabled={checking} /> : null}
  </View>;
}

/** Unmount protected screens on account changes, including a new session of the same UID. */
export function SocialDemoFeatureGate({ feature, title, children }: {
  feature: SocialDemoFeature; title: string; children: React.ReactNode;
}) {
  const owner = useSessionOwner();
  const { access, retry, checking } = useSocialDemoAccessState();
  if (!owner || socialDemoFeatureNotice(access, feature)) {
    return <Screen title={title} back><SocialDemoFeatureNotice access={access} feature={feature} retry={retry} checking={checking} /></Screen>;
  }
  return <React.Fragment key={`${owner.userId}:${owner.generation}`}>{children}</React.Fragment>;
}
