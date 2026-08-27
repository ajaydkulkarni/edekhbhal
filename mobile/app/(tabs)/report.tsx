import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Card, colors, ScreenHeader } from "@/components/Ui";

type ReportOccurrence = {
  id: string;
  scheduleName: string;
  workAreaName: string;
  propertyName: string;
  scheduledStartAt: string;
  startedAt: string | null;
  completedAt: string | null;
  plannedDurationMinutes: number;
  actualDurationSeconds: number | null;
  tasks: Array<{
    sequence: number;
    name: string;
    plannedDurationMinutes: number;
    actualDurationSeconds: number | null;
    status: string;
    evidenceCount: number;
  }>;
};

function duration(seconds: number | null) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ReportScreen() {
  const session = useSession();
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);
  const [items, setItems] = useState<ReportOccurrence[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ occurrences: ReportOccurrence[] }>("/api/mobile/reports/my-performance?days=7");
      setItems(data.occurrences);
    } catch (error) {
      Alert.alert("Report", error instanceof Error ? error.message : "Unable to load report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return <View style={styles.screen}>
    <ScreenHeader organizationName={membership?.organizationName} title="My Performance" subtitle="Last 7 days" />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {!items.length ? <Card><Text style={styles.muted}>No completed Schedule work is available for this period.</Text></Card> : items.map((item) => <Card key={item.id}>
        <Text style={styles.schedule}>{item.scheduleName}</Text>
        <Text style={styles.location}>{item.propertyName} · {item.workAreaName}</Text>
        <View style={styles.summaryRow}>
          <View><Text style={styles.label}>Planned</Text><Text style={styles.value}>{item.plannedDurationMinutes} min</Text></View>
          <View><Text style={styles.label}>Actual</Text><Text style={styles.value}>{duration(item.actualDurationSeconds)}</Text></View>
        </View>
        <View style={styles.tableHead}><Text style={[styles.th,{flex:1}]}>Task</Text><Text style={styles.th}>Actual</Text></View>
        {item.tasks.map((task) => <View key={`${item.id}-${task.sequence}`} style={styles.taskRow}>
          <Text style={[styles.taskName,{flex:1}]}>{task.sequence}. {task.name}</Text>
          <Text style={styles.taskTime}>{duration(task.actualDurationSeconds)}</Text>
        </View>)}
      </Card>)}
    </ScrollView>
  </View>;
}

const styles=StyleSheet.create({screen:{flex:1,backgroundColor:colors.bg},content:{padding:16,gap:12},schedule:{fontSize:18,fontWeight:"800",color:colors.text},location:{color:colors.muted,marginTop:4},summaryRow:{flexDirection:"row",justifyContent:"space-between",marginVertical:14,paddingVertical:12,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border},label:{fontSize:11,color:colors.muted,fontWeight:"700",textTransform:"uppercase"},value:{fontSize:16,fontWeight:"800",color:colors.text,marginTop:2},tableHead:{flexDirection:"row",paddingBottom:6},th:{fontSize:11,fontWeight:"800",color:colors.muted,textTransform:"uppercase"},taskRow:{flexDirection:"row",gap:10,borderTopWidth:1,borderColor:colors.border,paddingVertical:9},taskName:{color:colors.text},taskTime:{fontVariant:["tabular-nums"],color:colors.text,fontWeight:"700"},muted:{color:colors.muted}});
