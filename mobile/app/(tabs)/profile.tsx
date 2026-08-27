import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/lib/session";
import { Card, colors, PrimaryButton, ScreenHeader } from "@/components/Ui";

export default function ProfileScreen() {
  const session = useSession();
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);

  async function logout() {
    await session.signOut();
    router.replace("/login");
  }

  return <View style={styles.screen}>
    <ScreenHeader organizationName={membership?.organizationName} title="Profile" subtitle="Mobile USER account" />
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <Row label="User Name" value={session.user?.name || "—"} />
        <Row label="Email Address" value={session.user?.email || "—"} />
        <Row label="User Role" value={membership?.role || "—"} />
        <Row label="Organization" value={membership?.organizationName || "—"} />
        <Row label="Time Zone" value={membership?.timezone || "—"} />
      </Card>
      {session.memberships.length > 1 ? <Card>
        <Text style={styles.sectionTitle}>Organizations</Text>
        {session.memberships.map((item) => <Pressable key={item.organizationId} onPress={() => session.selectOrganization(item.organizationId)}><Text style={[styles.orgLine, item.organizationId === session.organizationId && styles.orgSelected]}>{item.organizationName}{item.organizationId === session.organizationId ? "  ✓" : ""}</Text></Pressable>)}
      </Card> : null}
      <PrimaryButton title="Logout" onPress={logout} />
    </ScrollView>
  </View>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles=StyleSheet.create({screen:{flex:1,backgroundColor:colors.bg},content:{padding:16,gap:12},row:{paddingVertical:11,borderBottomWidth:1,borderColor:colors.border},label:{fontSize:12,color:colors.muted,fontWeight:"700"},value:{fontSize:16,color:colors.text,fontWeight:"600",marginTop:3},sectionTitle:{fontSize:16,fontWeight:"800",color:colors.text,marginBottom:8},orgLine:{paddingVertical:10,color:colors.text},orgSelected:{color:colors.primary,fontWeight:"800"}});
