import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { useOccurrenceTranslation } from "@/lib/contentTranslation";
import type { Occurrence } from "@/lib/types";
import { Card, colors, Pill, PrimaryButton, ScreenHeader, SecondaryButton } from "@/components/Ui";

function formatDate(value: string, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function WorkScreen() {
  const session = useSession();
  const { t, info } = useI18n();
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);
  const [state, setState] = useState<"AVAILABLE" | "CLAIMED" | "IN_PROGRESS" | "EMPTY">("EMPTY");
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [claimExpiryMinutes, setClaimExpiryMinutes] = useState(15);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const translation = useOccurrenceTranslation(occurrence?.id, session.user?.preferredLanguage);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ state: typeof state; occurrence: Occurrence | null; claimExpiryMinutes: number }>("/api/mobile/queue/next");
      setState(data.state);
      setOccurrence(data.occurrence);
      setClaimExpiryMinutes(data.claimExpiryMinutes);
    } catch (error) {
      Alert.alert(t("myWork"), error instanceof Error ? error.message : t("workLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function claim() {
    if (!occurrence) return;
    setClaiming(true);
    try {
      const data = await apiFetch<{ occurrence: Occurrence }>(`/api/mobile/occurrences/${occurrence.id}/claim`, { method: "POST" });
      setOccurrence(data.occurrence);
      setState("CLAIMED");
      router.push("/(tabs)/scan");
    } catch (error) {
      Alert.alert(t("schedule"), error instanceof Error ? error.message : "Unable to claim Schedule.");
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
      Alert.alert(t("schedule"), error instanceof Error ? error.message : "Unable to release Schedule.");
    }
  }

  const scheduleName = translation.data?.scheduleName ?? occurrence?.scheduleName;

  return <View style={styles.screen}>
    <ScreenHeader organizationName={membership?.organizationName} title={t("myWork")} subtitle={t("nextAvailableSchedule")} />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {!occurrence ? <Card>
        <Text style={styles.emptyTitle}>{t("noQueuedWork")}</Text>
        <Text style={styles.muted}>{t("pullToRefresh")}</Text>
      </Card> : <Card>
        <View style={styles.rowBetween}>
          <Pill>{state === "AVAILABLE" ? t("available") : state === "CLAIMED" ? t("claimed") : t("inProgress")}</Pill>
          <Text style={styles.taskCount}>{occurrence.completedTaskCount}/{occurrence.taskCount} {t("tasks")}</Text>
        </View>
        <Text style={styles.schedule}>{scheduleName}</Text>
        {translation.data?.scheduleName && translation.data.scheduleName !== occurrence.scheduleName ? <Text style={styles.source}>{t("englishSource")}: {occurrence.scheduleName}</Text> : null}
        <Text style={styles.property}>{occurrence.propertyName}</Text>
        <Text style={styles.workArea}>{occurrence.workAreaName}</Text>
        <View style={styles.detailGrid}>
          <View><Text style={styles.label}>{t("scheduled")}</Text><Text style={styles.value}>{formatDate(occurrence.scheduledStartAt, occurrence.timezone, info.speechLocale)}</Text></View>
          <View><Text style={styles.label}>{t("plannedDuration")}</Text><Text style={styles.value}>{occurrence.plannedDurationMinutes} {t("minuteShort")}</Text></View>
        </View>
        {state === "AVAILABLE" ? <>
          <Text style={styles.muted}>{t("acceptHint")}</Text>
          <PrimaryButton title={t("acceptGoWorkArea")} onPress={claim} busy={claiming} />
          <Text style={styles.expiry}>{t("scanWithin")} {claimExpiryMinutes} {t("minutes")}</Text>
        </> : null}
        {state === "CLAIMED" ? <>
          <Text style={styles.muted}>{t("reservedHint")}</Text>
          {occurrence.claimExpiresAt ? <Text style={styles.claimUntil}>{t("reservedUntil")} {formatDate(occurrence.claimExpiresAt, occurrence.timezone, info.speechLocale)}</Text> : null}
          <PrimaryButton title={t("scanWorkAreaQr")} onPress={() => router.push("/(tabs)/scan")} />
          <SecondaryButton title={t("returnToQueue")} onPress={release} />
        </> : null}
        {state === "IN_PROGRESS" ? <PrimaryButton title={t("continueSchedule")} onPress={() => router.push(`/execution/${occurrence.id}`)} /> : null}
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
  source: { color: colors.muted, fontSize: 11, marginTop: 3 },
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
