import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Btn, Tap } from "@/components/ui";
import { C, F, R, S } from "@/theme";

export function ProError({
  message,
  retry,
}: {
  message: string | null;
  retry?: () => void;
}) {
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ gap: S.sm, paddingVertical: S.md }}
    >
      <Text style={{ ...F.small, color: C.errorText }}>{message}</Text>
      {retry ? (
        <Btn label="Volver a comprobar" variant="ghost" small onPress={retry} />
      ) : null}
    </View>
  );
}

export function ProField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: S.sm }}>
      <Text style={F.h3}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={C.muted}
        {...props}
        style={[
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: R.sm,
            paddingHorizontal: S.md,
            paddingVertical: S.md,
            color: C.text,
            backgroundColor: C.surface,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function ProChoice({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Tap
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={disabled}
      style={{
        minHeight: 44,
        paddingHorizontal: S.md,
        paddingVertical: S.md,
        borderWidth: 1,
        borderColor: selected ? C.blue : C.border,
        backgroundColor: selected ? C.blue : C.surface,
        borderRadius: R.sm,
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ ...F.small, color: selected ? C.onAccent : C.text }}>
        {label}
      </Text>
    </Tap>
  );
}

export function ProSheet({
  title,
  pending,
  close,
  children,
}: {
  title: string;
  pending: boolean;
  close(): void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!pending) close();
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: S.lg,
              minHeight: 64,
              borderBottomWidth: 1,
              borderBottomColor: C.borderLight,
            }}
          >
            <Text accessibilityRole="header" style={{ ...F.h2, flex: 1 }}>
              {title}
            </Text>
            <Tap
              accessibilityLabel="Cerrar"
              disabled={pending}
              onPress={close}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={22} color={C.text} strokeWidth={1.8} />
            </Tap>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: S.lg,
              gap: S.xl,
              width: "100%",
              maxWidth: 600,
              alignSelf: "center",
            }}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
