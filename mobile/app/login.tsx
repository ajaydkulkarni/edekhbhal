import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { API_URL } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors, PrimaryButton, SecondaryButton } from "@/components/Ui";

export default function LoginScreen() {
  const { signInWithToken, signInWithPassword } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showLink, setShowLink] = useState(false);

  async function passwordSignIn() {
    setBusy(true);
    try {
      await signInWithPassword(email.trim(), password);
      router.replace("/(tabs)/work");
    } catch (error) {
      Alert.alert("Sign In", error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function requestLink() {
    setBusy(true);
    setDevToken(null);
    try {
      const response = await fetch(`${API_URL}/api/mobile/auth/request-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to request sign in.");
      setMessage(data.message || "Check your email.");
      setDevToken(data.devToken || null);
    } catch (error) {
      Alert.alert("Sign In", error instanceof Error ? error.message : "Unable to request sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function developmentSignIn() {
    if (!devToken) return;
    setBusy(true);
    try {
      await signInWithToken(devToken);
      router.replace("/(tabs)/work");
    } catch (error) {
      Alert.alert("Sign In", error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.logo}><Text style={styles.logoText}>eD</Text></View>
      <Text style={styles.brand}>eDekhbhal</Text>
      <Text style={styles.title}>Mobile Work Execution</Text>
      <Text style={styles.help}>Use your eDekhbhal email identity. If you have set a password, you can sign in directly.</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="Email address"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        secureTextEntry
        autoComplete="password"
        placeholder="Password"
        style={styles.input}
      />
      <PrimaryButton
        title="Sign In with Password"
        onPress={passwordSignIn}
        disabled={!email.includes("@") || password.length < 8}
        busy={busy}
      />

      <View style={styles.orRow}><View style={styles.line}/><Text style={styles.orText}>or</Text><View style={styles.line}/></View>
      <Text style={styles.helpSmall}>No password yet or forgot it? Use the email sign-in link.</Text>
      {!showLink ? <SecondaryButton title="Use Email Sign-In Link" onPress={() => setShowLink(true)} /> : <>
        <PrimaryButton title="Email me a sign-in link" onPress={requestLink} disabled={!email.includes("@")} busy={busy} />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {devToken ? <PrimaryButton title="Development Sign In" onPress={developmentSignIn} busy={busy} /> : null}
        <Pressable onPress={() => setShowLink(false)}><Text style={styles.switchLink}>Use password instead</Text></Pressable>
      </>}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Privacy & Security</Text>
        <Text style={styles.footerText}>Legal disclosures</Text>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 14 },
  logo: { width: 76, height: 76, borderRadius: 20, backgroundColor: colors.primary, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  logoText: { color: "white", fontSize: 30, fontWeight: "900" },
  brand: { textAlign: "center", fontSize: 27, fontWeight: "900", color: colors.text },
  title: { textAlign: "center", fontSize: 19, fontWeight: "700", color: colors.text },
  help: { textAlign: "center", color: colors.muted, lineHeight: 20, marginBottom: 6 },
  helpSmall: { textAlign: "center", color: colors.muted, lineHeight: 19 },
  input: { backgroundColor: "white", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 50, fontSize: 16 },
  message: { backgroundColor: "white", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.muted, textAlign: "center" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.muted, fontWeight: "700" },
  switchLink: { color: colors.primary, textAlign: "center", fontWeight: "700", paddingVertical: 6 },
  footer: { marginTop: 24, gap: 6, alignItems: "center" },
  footerText: { color: colors.muted, fontSize: 12 }
});
