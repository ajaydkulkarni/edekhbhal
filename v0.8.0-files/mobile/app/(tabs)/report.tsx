import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { Card, colors, PrimaryButton, ScreenHeader, SecondaryButton } from "@/components/Ui";

type ReportTask = {
  id: string;
  sequence: number;
  name: string;
  sourceName: string;
  plannedDurationMinutes: number;
  actualDurationSeconds: number | null;
  status: string;
  evidenceCount: number;
  notes: Array<{ id: string; note: string; createdAt: string }>;
};

type ReportOccurrence = {
  id: string;
  status: string;
  scheduleName: string;
  sourceScheduleName: string;
  workAreaName: string;
  propertyName: string;
  scheduledStartAt: string;
  startedAt: string | null;
  completedAt: string | null;
  plannedDurationMinutes: number;
  actualDurationSeconds: number | null;
  deviationSeconds: number | null;
  notes: Array<{ id: string; note: string; createdAt: string }>;
  tasks: ReportTask[];
};

type ReportResponse = {
  from: string;
  to: string;
  q: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  language: string;
  occurrences: ReportOccurrence[];
};

type Preset = "TODAY" | "7" | "30" | "CUSTOM";

function duration(seconds: number | null) {
  if (seconds == null) return "—";
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function deviation(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds === 0) return "0:00";
  return `${seconds > 0 ? "+" : "−"}${duration(Math.abs(seconds))}`;
}

function localDateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatDate(value: string, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: string, t: (key: string) => string) {
  if (status === "COMPLETED") return t("completed");
  if (status === "PARTIALLY_COMPLETED") return t("partial");
  if (status === "MISSED") return t("missed");
  return status.replaceAll("_", " ");
}

export default function ReportScreen() {
  const session = useSession();
  const { t, info } = useI18n();
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);
  const timeZone = membership?.timezone ?? "UTC";
  const today = localDateKey(new Date(), timeZone);
  const [preset, setPreset] = useState<Preset>("7");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (requestedPage = 1, requestedPreset: Preset = preset) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(requestedPage), pageSize: "10" });
      if (search.trim()) params.set("q", search.trim());
      if (requestedPreset === "TODAY") params.set("days", "1");
      else if (requestedPreset === "7") params.set("days", "7");
      else if (requestedPreset === "30") params.set("days", "30");
      else {
        params.set("from", fromDate);
        params.set("to", toDate);
      }
      const result = await apiFetch<ReportResponse>(`/api/mobile/reports/my-performance?${params.toString()}`);
      setData(result);
      setExpandedId(null);
    } catch (error) {
      Alert.alert(t("report"), error instanceof Error ? error.message : t("reportLoadError"));
    } finally {
      setLoading(false);
    }
  }, [preset, search, fromDate, toDate, t]);

  // Keep focus refresh stable so editing search/date fields does not trigger a request on every keystroke.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useFocusEffect(useCallback(() => { void loadRef.current(1); }, []));

  function choosePreset(value: Preset) {
    setPreset(value);
    if (value !== "CUSTOM") void load(1, value);
  }

  return <View style={styles.screen}>
    <ScreenHeader organizationName={membership?.organizationName} title={t("myPerformance")} subtitle={t("personalHistory")} />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(data?.page ?? 1)} />} keyboardShouldPersistTaps="handled">
      <Card>
        <View style={styles.presetRow}>
          {([[
            "TODAY", t("today")
          ], ["7", t("last7Days")], ["30", t("last30Days")], ["CUSTOM", t("custom")]] as Array<[Preset, string]>).map(([value, label]) => (
            <Pressable key={value} style={[styles.preset, preset === value && styles.presetActive]} onPress={() => choosePreset(value)}>
              <Text style={[styles.presetText, preset === value && styles.presetTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {preset === "CUSTOM" ? <View style={styles.dateRow}>
          <View style={{ flex: 1 }}><Text style={styles.label}>{t("fromDate")}</Text><TextInput value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" style={styles.input}/></View>
          <View style={{ flex: 1 }}><Text style={styles.label}>{t("toDate")}</Text><TextInput value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" style={styles.input}/></View>
        </View> : null}
        <Text style={styles.label}>{t("search")}</Text>
        <TextInput value={search} onChangeText={setSearch} placeholder={t("searchPlaceholder")} style={styles.input} returnKeyType="search" onSubmitEditing={() => load(1)} />
        <PrimaryButton title={t("applyFilters")} onPress={() => load(1)} busy={loading} />
      </Card>

      {data ? <Text style={styles.resultSummary}>{data.total} · {data.from} → {data.to}</Text> : null}
      {!data?.occurrences.length ? <Card><Text style={styles.muted}>{t("noMatchingWork")}</Text></Card> : data.occurrences.map((item) => {
        const expanded = expandedId === item.id;
        return <Card key={item.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.status}>{statusLabel(item.status, t)}</Text>
            <Text style={styles.date}>{formatDate(item.completedAt ?? item.scheduledStartAt, timeZone, info.speechLocale)}</Text>
          </View>
          <Text style={styles.schedule}>{item.scheduleName}</Text>
          {item.scheduleName !== item.sourceScheduleName ? <Text style={styles.source}>{t("englishSource")}: {item.sourceScheduleName}</Text> : null}
          <Text style={styles.location}>{item.propertyName} · {item.workAreaName}</Text>
          <View style={styles.metrics}>
            <Metric label={t("planned")} value={`${item.plannedDurationMinutes} ${t("minuteShort")}`} />
            <Metric label={t("actual")} value={duration(item.actualDurationSeconds)} />
            <Metric label={t("deviation")} value={deviation(item.deviationSeconds)} late={Boolean(item.deviationSeconds && item.deviationSeconds > 0)} />
          </View>
          <SecondaryButton title={expanded ? t("hideDetails") : t("showDetails")} onPress={() => setExpandedId(expanded ? null : item.id)} />
          {expanded ? <View style={styles.details}>
            {item.tasks.map((task) => <View key={task.id} style={styles.taskRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.taskName}>{task.sequence}. {task.name}</Text>
                {task.name !== task.sourceName ? <Text style={styles.source}>{t("englishSource")}: {task.sourceName}</Text> : null}
                <Text style={styles.taskMeta}>{statusLabel(task.status, t)} · {t("planned")} {task.plannedDurationMinutes} {t("minuteShort")} · {t("actual")} {duration(task.actualDurationSeconds)} · {t("evidenceCount")} {task.evidenceCount}</Text>
                {task.notes.map((note) => <Text key={note.id} style={styles.noteLine}>{t("taskNotes")}: {note.note}</Text>)}
              </View>
            </View>)}
            {item.notes.map((note) => <Text key={note.id} style={styles.noteLine}>{t("scheduleNotes")}: {note.note}</Text>)}
          </View> : null}
        </Card>;
      })}

      {data && data.totalPages > 1 ? <View style={styles.pagination}>
        <View style={{ flex: 1 }}><SecondaryButton title={`← ${t("previous")}`} onPress={() => load(Math.max(1, data.page - 1))} disabled={data.page <= 1 || loading} /></View>
        <Text style={styles.pageText}>{t("page")} {data.page} {t("of")} {data.totalPages}</Text>
        <View style={{ flex: 1 }}><SecondaryButton title={`${t("next")} →`} onPress={() => load(Math.min(data.totalPages, data.page + 1))} disabled={data.page >= data.totalPages || loading} /></View>
      </View> : null}
    </ScrollView>
  </View>;
}

function Metric({ label, value, late }: { label: string; value: string; late?: boolean }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, late && styles.late]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 },
  preset: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "white" },
  presetActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  presetTextActive: { color: "white" },
  dateRow: { flexDirection: "row", gap: 10 },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", marginBottom: 5, marginTop: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 12, backgroundColor: "white", color: colors.text, marginBottom: 10 },
  resultSummary: { color: colors.muted, textAlign: "right", fontSize: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  status: { fontSize: 11, fontWeight: "900", color: colors.primary, textTransform: "uppercase" },
  date: { fontSize: 11, color: colors.muted },
  schedule: { fontSize: 19, fontWeight: "900", color: colors.text, marginTop: 9 },
  source: { color: colors.muted, fontSize: 11, marginTop: 2 },
  location: { color: colors.muted, marginTop: 5, marginBottom: 12 },
  metrics: { flexDirection: "row", gap: 8, marginBottom: 12 },
  metric: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 9 },
  metricLabel: { fontSize: 10, color: colors.muted, fontWeight: "800", textTransform: "uppercase" },
  metricValue: { color: colors.text, fontWeight: "800", marginTop: 3, fontVariant: ["tabular-nums"] },
  late: { color: colors.danger },
  details: { marginTop: 12, borderTopWidth: 1, borderColor: colors.border },
  taskRow: { paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row" },
  taskName: { color: colors.text, fontWeight: "800" },
  taskMeta: { color: colors.muted, fontSize: 11, marginTop: 4, lineHeight: 16 },
  noteLine: { color: colors.text, fontSize: 12, marginTop: 6, backgroundColor: "#f8fafc", padding: 7, borderRadius: 8 },
  pagination: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  pageText: { color: colors.muted, fontWeight: "700", fontSize: 12 },
  muted: { color: colors.muted, lineHeight: 20 }
});
