import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/lib/session";
import { colors } from "@/components/Ui";

export default function AuthDeepLinkScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { signInWithToken } = useSession();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setError("Missing authentication token."); return; }
    signInWithToken(token)
      .then(() => router.replace("/(tabs)/work"))
      .catch((e) => setError(e instanceof Error ? e.message : "Unable to sign in."));
  }, [token, signInWithToken]);

  return <View style={styles.screen}>
    {error ? <Text style={styles.error}>{error}</Text> : <><ActivityIndicator size="large"/><Text style={styles.text}>Signing in to eDekhbhal…</Text></>}
  </View>;
}
const styles=StyleSheet.create({screen:{flex:1,alignItems:"center",justifyContent:"center",padding:24,gap:14,backgroundColor:colors.bg},text:{color:colors.muted},error:{color:colors.danger,textAlign:"center"}});
