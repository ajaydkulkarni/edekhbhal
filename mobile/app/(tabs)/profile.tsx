import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { languageInfo, SUPPORTED_LANGUAGES } from "@/lib/languages";
import { Card, colors, PrimaryButton, ScreenHeader, SecondaryButton } from "@/components/Ui";

export default function ProfileScreen() {
  const session = useSession();
  const { t, language } = useI18n();
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);
  const [name, setName] = useState(session.user?.name ?? "");
  const [preferredLanguage, setPreferredLanguage] = useState(session.user?.preferredLanguage ?? "en");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    setName(session.user?.name ?? "");
    setPreferredLanguage(session.user?.preferredLanguage ?? "en");
  }, [session.user?.name, session.user?.preferredLanguage]);

  async function saveProfile() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/mobile/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          preferredLanguage: preferredLanguage === "en" ? null : preferredLanguage
        })
      });
      await session.refresh();
      Alert.alert(t("profile"), t("profileSaved"));
    } catch (error) {
      Alert.alert(t("profile"), error instanceof Error ? error.message : t("profileSaveError"));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (newPassword.length < 8) {
      Alert.alert(t("passwordSecurity"), t("passwordMin"));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t("passwordSecurity"), t("passwordMismatch"));
      return;
    }
    setPasswordBusy(true);
    try {
      await apiFetch("/api/mobile/profile/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: currentPassword || undefined,
          newPassword
        })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await session.refresh();
      Alert.alert(t("passwordSecurity"), t("passwordChanged"));
    } catch (error) {
      Alert.alert(t("passwordSecurity"), error instanceof Error ? error.message : "Unable to update password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  function confirmLogout() {
    Alert.alert(t("signOutConfirm"), t("signOutConfirmBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("signOut"),
        style: "destructive",
        onPress: async () => {
          await session.signOut();
          router.replace("/login");
        }
      }
    ]);
  }

  const selectedLanguage = languageInfo(preferredLanguage);

  return <View style={styles.screen}>
    <ScreenHeader organizationName={membership?.organizationName} title={t("profile")} subtitle={t("mobileUserAccount")} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={styles.sectionTitle}>{t("accountDetails")}</Text>
        <Text style={styles.label}>{t("displayName")}</Text>
        <TextInput value={name} onChangeText={setName} maxLength={120} style={styles.input} placeholder={t("displayName")} />
        <ReadOnlyRow label={t("emailAddress")} value={session.user?.email || "—"} />
        <ReadOnlyRow label={t("userRole")} value={membership?.role || "—"} />
        <ReadOnlyRow label={t("organization")} value={membership?.organizationName || "—"} />
        <ReadOnlyRow label={t("timeZone")} value={membership?.timezone || "—"} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>{t("preferredLanguage")}</Text>
        <Text style={styles.help}>{t("languageHelp")}</Text>
        <Pressable style={styles.languageButton} onPress={() => setLanguageOpen(true)}>
          <View><Text style={styles.languageNative}>{selectedLanguage.nativeLabel}</Text><Text style={styles.languageEnglish}>{selectedLanguage.label}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <PrimaryButton title={t("saveProfile")} onPress={saveProfile} disabled={!name.trim()} busy={saving} />
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>{t("passwordSecurity")}</Text>
          <Text style={session.user?.passwordSet ? styles.good : styles.mutedSmall}>
            {session.user?.passwordSet ? t("passwordSet") : t("passwordNotSet")}
          </Text>
        </View>
        {session.user?.passwordSet ? <>
          <Text style={styles.label}>{t("currentPassword")}</Text>
          <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" style={styles.input} />
          <Text style={styles.help}>{t("passwordHelpRecovery")}</Text>
        </> : null}
        <Text style={styles.label}>{t("newPassword")}</Text>
        <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" style={styles.input} />
        <Text style={styles.label}>{t("confirmPassword")}</Text>
        <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" style={styles.input} />
        <PrimaryButton
          title={session.user?.passwordSet ? t("changePassword") : t("setPassword")}
          onPress={changePassword}
          disabled={newPassword.length < 8 || !confirmPassword}
          busy={passwordBusy}
        />
      </Card>

      {session.memberships.length > 1 ? <Card>
        <Text style={styles.sectionTitle}>{t("organization")}</Text>
        {session.memberships.map((item) => <Pressable key={item.organizationId} onPress={() => session.selectOrganization(item.organizationId)}>
          <Text style={[styles.orgLine, item.organizationId === session.organizationId && styles.orgSelected]}>
            {item.organizationName}{item.organizationId === session.organizationId ? "  ✓" : ""}
          </Text>
        </Pressable>)}
      </Card> : null}

      <View style={styles.logoutBox}>
        <SecondaryButton title={t("signOut")} onPress={confirmLogout} />
      </View>
      <Text style={styles.version}>eDekhbhal Mobile v0.8.0 · {t("uiLanguage")}: {languageInfo(language).nativeLabel}</Text>
    </ScrollView>

    <Modal visible={languageOpen} transparent animationType="fade" onRequestClose={() => setLanguageOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.languageSheet}>
          <View style={styles.rowBetween}><Text style={styles.sheetTitle}>{t("preferredLanguage")}</Text><Pressable onPress={() => setLanguageOpen(false)}><Text style={styles.close}>{t("close")}</Text></Pressable></View>
          <ScrollView style={{ maxHeight: 520 }}>
            {SUPPORTED_LANGUAGES.map((item) => <Pressable key={item.code} style={styles.languageOption} onPress={() => { setPreferredLanguage(item.code); setLanguageOpen(false); }}>
              <View><Text style={styles.languageNative}>{item.nativeLabel}</Text><Text style={styles.languageEnglish}>{item.code === "en" ? t("defaultEnglish") : item.label}</Text></View>
              {preferredLanguage === item.code ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.readOnlyRow}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.text, marginBottom: 10 },
  label: { fontSize: 12, color: colors.muted, fontWeight: "700", marginBottom: 5, marginTop: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: "white", color: colors.text, fontSize: 16 },
  readOnlyRow: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 9, marginTop: 9 },
  value: { color: colors.text, fontWeight: "600", fontSize: 15 },
  help: { color: colors.muted, lineHeight: 19, marginBottom: 10 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  languageButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  languageNative: { color: colors.text, fontWeight: "800", fontSize: 16 },
  languageEnglish: { color: colors.muted, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.primary, fontSize: 28 },
  good: { color: "#16733c", fontWeight: "700", fontSize: 12 },
  mutedSmall: { color: colors.muted, fontSize: 12 },
  orgLine: { paddingVertical: 10, color: colors.text },
  orgSelected: { color: colors.primary, fontWeight: "800" },
  logoutBox: { paddingVertical: 6 },
  version: { textAlign: "center", color: colors.muted, fontSize: 11 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.42)", justifyContent: "center", padding: 18 },
  languageSheet: { backgroundColor: "white", borderRadius: 18, padding: 16 },
  sheetTitle: { fontSize: 19, fontWeight: "800", color: colors.text },
  close: { color: colors.primary, fontWeight: "700" },
  languageOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border },
  check: { color: colors.primary, fontSize: 20, fontWeight: "900" }
});
