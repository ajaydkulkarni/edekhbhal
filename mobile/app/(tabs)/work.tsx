import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Occurrence } from "@/lib/types";
import { Card, colors, Pill, PrimaryButton, ScreenHeader, SecondaryButton } from "@/components/Ui";

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function WorkScreen() {
  const session = useSession();
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);
  const [state, setState] = useState<"AVAILABLE" | "CLAIMED" | "IN_PROGRESS" | "EMPTY">("EMPTY");
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [claimExpiryMinutes, setClaimExpiryMinutes] = useState(15);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ state: typeof state; occurrence: Occurrence | null; claimExpiryMinutes: number }>("/api/mobile/queue/next");
      setState(data.state);
      setOccurrence(data.occurrence);
      setClaimExpiryMinutes(data.claimExpiryMinutes);
    } catch (error) {
      Alert.alert("My Work", error instanceof Error ? error.message : "Unable to load work queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function claim() {
    if (!occurrence) return;
    setClaiming(true);
    try {
      const data = await apiFetch<{ occurrence: Occurrence }>(`/api/mobile/occurrences/${occurrence.id}/claim`, { method: "POST" });
      setOccurrence(data.occurrence);
      setState("CLAIMED");
      router.push("/(tabs)/scan");
    } catch (error) {
      Alert.alert("Claim Schedule", error instanceof Error ? error.message : "Unable to claim Schedule.");
      await load();
    } finally {
      setClaiming(false);
    }
  }

  async function release() {
    if (!occurrence) return;
    try {
      await apiFetch(`/api/mobile/occurrences/${occurrence.id}/release`, { method: "POST" });
      await load();
    } catch (error) {
      Alert.alert("Release Schedule", error instanceof Error ? error.message : "Unable to release Schedule.");
    }
  }

  return <View style={styles.screen}>
    <ScreenHeader organizationName={membership?.organizationName} title="My Work" subtitle="Next available Schedule" />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {!occurrence ? <Card>
        <Text style={styles.emptyTitle}>No queued work is currently available.</Text>
        <Text style={styles.muted}>Pull down to refresh. Upcoming ScheduleOccurrences appear here as they are generated.</Text>
      </Card> : <Card>
        <View style={styles.rowBetween}>
          <Pill>{state === "AVAILABLE" ? "AVAILABLE" : state === "CLAIMED" ? "CLAIMED" : "IN PROGRESS"}</Pill>
          <Text style={styles.taskCount}>{occurrence.completedTaskCount}/{occurrence.taskCount} Tasks</Text>
        </View>
        <Text style={styles.schedule}>{occurrence.scheduleName}</Text>
        <Text style={styles.property}>{occurrence.propertyName}</Text>
        <Text style={styles.workArea}>{occurrence.workAreaName}</Text>
        <View style={styles.detailGrid}>
          <View><Text style={styles.label}>Scheduled</Text><Text style={styles.value}>{formatDate(occurrence.scheduledStartAt, occurrence.timezone)}</Text></View>
          <View><Text style={styles.label}>Planned duration</Text><Text style={styles.value}>{occurrence.plannedDurationMinutes} min</Text></View>
        </View>
        {state === "AVAILABLE" ? <>
          <Text style={styles.muted}>You may begin this Schedule before its scheduled time. Press Accept only when you intend to travel to the Work Area.</Text>
          <PrimaryButton title="Accept / Go to Work Area" onPress={claim} busy={claiming} />
          <Text style={styles.expiry}>After claiming, scan the Work Area QR within {claimExpiryMinutes} minute(s).</Text>
        </> : null}
        {state === "CLAIMED" ? <>
          <Text style={styles.muted}>This work is reserved for you until the claim expires. Reach the Work Area and scan its QR Code.</Text>
          {occurrence.claimExpiresAt ? <Text style={styles.claimUntil}>Reserved until {formatDate(occurrence.claimExpiresAt, occurrence.timezone)}</Text> : null}
          <PrimaryButton title="Scan Work Area QR" onPress={() => router.push("/(tabs)/scan")} />
          <SecondaryButton title="Return to Queue" onPress={release} />
        </> : null}
        {state === "IN_PROGRESS" ? <PrimaryButton title="Continue Current Schedule" onPress={() => router.push(`/execution/${occurrence.id}`)} /> : null}
      </Card>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  taskCount: { color: colors.muted, fontWeight: "700" },
  schedule: { fontSize: 22, fontWeight: "900", color: colors.text, marginTop: 16 },
  property: { fontSize: 15, color: colors.muted, marginTop: 6 },
  workArea: { fontSize: 19, fontWeight: "800", color: colors.primary, marginTop: 2, marginBottom: 16 },
  detailGrid: { gap: 12, marginBottom: 16 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  value: { color: colors.text, fontWeight: "600", marginTop: 3 },
  muted: { color: colors.muted, lineHeight: 20, marginVertical: 12 },
  expiry: { textAlign: "center", color: colors.muted, fontSize: 12, marginTop: 10 },
  claimUntil: { textAlign: "center", color: colors.primary, fontSize: 13, fontWeight: "700", marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.text }
});
