import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Btn, Card } from '@/components/ui';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { useWorkspace } from '@/components/WorkspaceProvider';
import type { SessionIdentity } from '@/lib/session';
import { C, F, FONT } from '@/theme';

export function CardAccount({ title, children }: { title: string; children(owner: SessionIdentity): React.ReactNode }) {
  const owner = useSessionOwner(); const router = useRouter(); const workspace = useWorkspace();
  if (!owner) return <Screen title={title} back><Card style={{ gap: 12 }}><Text style={F.body}>Inicia sesión con tu cuenta para ver tu tarjeta, ventajas y sellos.</Text><Btn label="Iniciar sesión" onPress={() => router.push('/welcome')} /></Card></Screen>;
  return <React.Fragment key={`${owner.userId}:${owner.generation}:${workspace.active?.id ?? 'personal'}:${workspace.revision}`}>{children(owner)}</React.Fragment>;
}

export function CardScreen<T>(props: React.ComponentProps<typeof Screen<T>>) {
  const router = useRouter(); const workspace = useWorkspace();
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen {...props} pad={props.pad ?? true} onBack={props.onBack ?? (() => {
    if (router.canGoBack()) router.back();
    else router.replace(workspace.active ? '/(workspace)/resumen' : '/(tabs)/perfil');
  })} /></KeyboardAvoidingView>;
}

export function CardSurface(props: React.ComponentProps<typeof Card>) {
  return <Card {...props} style={[{ marginHorizontal: 0, marginBottom: 0 }, props.style]} />;
}

export function CardChip({ label, active, onPress, disabled = false }: { label: string; active?: boolean; onPress?(): void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active, disabled }} style={{ opacity: disabled ? 0.5 : 1, minHeight: 44, maxWidth: '100%', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 24, borderWidth: 1, borderColor: active ? C.blue : C.border, backgroundColor: active ? C.blue : C.surface }}>
    <Text style={{ flexShrink: 1, fontSize: 14, lineHeight: 20, fontFamily: FONT.medium, color: active ? C.onAccent : C.text }}>{label}</Text>
  </Pressable>;
}

export function CardNotice({ text, error = false, onRetry }: { text: string | null | undefined; error?: boolean; onRetry?(): void }) {
  if (!text) return null;
  return <View style={{ padding: 15, gap: 10, borderRadius: 16, backgroundColor: error ? `${C.error}10` : C.accentSoft }}><Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={{ color: error ? C.errorText : C.blueDeep, fontSize: 14, lineHeight: 20 }}>{text}</Text>{onRetry ? <Btn label="Reintentar consulta" small variant="secondary" onPress={onRetry} /> : null}</View>;
}

export function CardField({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 6 }}><Text style={{ color: C.text, fontFamily: FONT.medium, fontSize: 14 }}>{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor={C.muted} style={[{ minHeight: 48, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 13, color: C.text, backgroundColor: C.surface, fontSize: 16 }, props.style]} /></View>;
}

export function CardLoading() { return <ActivityIndicator color={C.blue} style={{ marginVertical: 24 }} accessibilityLabel="Comprobando información" />; }

export function CardFigure({ label, value, note }: { label: string; value: string; note?: string }) {
  return <Card style={{ gap: 8, flex: 1, minWidth: 135 }}><Text style={F.small}>{label}</Text><Text style={{ color: C.text, fontSize: 27, fontFamily: FONT.heading, fontVariant: ['tabular-nums'] }}>{value}</Text>{note ? <Text style={F.small}>{note}</Text> : null}</Card>;
}
