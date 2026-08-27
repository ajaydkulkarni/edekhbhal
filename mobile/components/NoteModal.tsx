import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, PrimaryButton, SecondaryButton } from "./Ui";

export function NoteModal({ visible, title, onClose, onSave }: { visible: boolean; title: string; onClose: () => void; onSave: (note: string) => Promise<void> }) {
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

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.help}>Record an observation, delay reason, damage, safety issue, or anything the Supervisor should know.</Text>
        <TextInput value={note} onChangeText={setNote} multiline maxLength={4000} placeholder="Enter note…" style={styles.input} textAlignVertical="top" />
        <View style={styles.row}>
          <View style={{ flex: 1 }}><SecondaryButton title="Cancel" onPress={onClose} /></View>
          <View style={{ flex: 1 }}><PrimaryButton title="Save Note" onPress={save} disabled={!note.trim()} busy={saving} /></View>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "white", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  help: { color: colors.muted, lineHeight: 20 },
  input: { minHeight: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text },
  row: { flexDirection: "row", gap: 10 }
});
