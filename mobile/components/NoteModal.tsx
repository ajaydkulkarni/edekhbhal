import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useI18n } from "@/lib/i18n";
import { colors, PrimaryButton, SecondaryButton } from "./Ui";

export function NoteModal({ visible, title, onClose, onSave }: { visible: boolean; title: string; onClose: () => void; onSave: (note: string) => Promise<void> }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!visible) setNote(""); }, [visible]);

  async function save() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await onSave(note.trim());
      setNote("");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      style={styles.overlay}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.help}>{t("noteHelp")}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={4000}
            placeholder={t("enterNote")}
            style={styles.input}
            textAlignVertical="top"
            autoFocus
            scrollEnabled
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}><SecondaryButton title={t("cancel")} onPress={onClose} /></View>
            <View style={{ flex: 1 }}><PrimaryButton title={t("saveNote")} onPress={save} disabled={!note.trim()} busy={saving} /></View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,.45)" },
  scrollContent: { flexGrow: 1, justifyContent: "flex-start", paddingHorizontal: 14, paddingTop: 72, paddingBottom: 24 },
  sheet: { backgroundColor: "white", borderRadius: 20, padding: 18, gap: 12, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, elevation: 8 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  help: { color: colors.muted, lineHeight: 20 },
  input: { minHeight: 160, maxHeight: 280, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, backgroundColor: "#fff" },
  row: { flexDirection: "row", gap: 10 }
});
