import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

export const colors = {
  bg: "#f4f7fb",
  card: "#ffffff",
  text: "#172033",
  muted: "#64748b",
  border: "#dbe3ef",
  primary: "#0f5fa8",
  primaryDark: "#08497f",
  success: "#e9f7ed",
  warning: "#fff7e6",
  danger: "#a61b1b"
};

export function ScreenHeader({ organizationName, title, subtitle }: { organizationName?: string; title: string; subtitle?: string }) {
  return <View style={styles.header}>
    <View style={{ flex: 1 }}>
      <Text style={styles.org}>{organizationName || "eDekhbhal"}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    <View style={styles.brandBadge}><Text style={styles.brandBadgeText}>eD</Text></View>
  </View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({ title, onPress, disabled, busy }: { title: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return <Pressable style={[styles.primaryButton, disabled && styles.disabled]} onPress={onPress} disabled={disabled || busy}>
    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{title}</Text>}
  </Pressable>;
}

export function SecondaryButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable style={[styles.secondaryButton, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
    <Text style={styles.secondaryButtonText}>{title}</Text>
  </Pressable>;
}

export function Pill({ children }: { children: React.ReactNode }) {
  return <View style={styles.pill}><Text style={styles.pillText}>{children}</Text></View>;
}

export const styles = StyleSheet.create({
  header: { backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 18, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  org: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  title: { fontSize: 22, lineHeight: 28, color: colors.text, fontWeight: "800", marginTop: 2 },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 13 },
  brandBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  brandBadgeText: { color: "white", fontWeight: "900", fontSize: 18 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16 },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 12 },
  primaryButtonText: { color: "white", fontWeight: "800", fontSize: 16 },
  secondaryButton: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "white" },
  secondaryButtonText: { color: colors.primary, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  pill: { alignSelf: "flex-start", backgroundColor: "#eaf2fb", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { color: colors.primaryDark, fontWeight: "700", fontSize: 12 }
});
