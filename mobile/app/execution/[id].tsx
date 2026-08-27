import RenderHtml from "react-native-render-html";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { apiFetch } from "@/lib/api";
import type { Occurrence, OccurrenceTask } from "@/lib/types";
import { useSession } from "@/lib/session";
import { EvidenceCamera } from "@/components/EvidenceCamera";
import { NoteModal } from "@/components/NoteModal";
import { RunningTimer } from "@/components/RunningTimer";
import { Card, colors, Pill, PrimaryButton, ScreenHeader, SecondaryButton } from "@/components/Ui";

export default function ExecutionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);
  const { width } = useWindowDimensions();
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [loading, setLoading] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [taskNoteOpen, setTaskNoteOpen] = useState(false);
  const [scheduleNoteOpen, setScheduleNoteOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<{ occurrence: Occurrence }>(`/api/mobile/occurrences/${id}`);
      setOccurrence(data.occurrence);
    } catch (error) {
      Alert.alert("Current Work", error instanceof Error ? error.message : "Unable to load current work.");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const currentTask = useMemo(() => {
    if (!occurrence) return null;
    return occurrence.tasks.find((task) => task.status === "IN_PROGRESS") ?? null;
  }, [occurrence]);

  async function completeTask() {
    if (!currentTask) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ occurrence: Occurrence; scheduleCompleted: boolean }>(`/api/mobile/occurrence-tasks/${currentTask.id}/complete`, { method: "POST" });
      setOccurrence(data.occurrence);
      setInstructionsOpen(true);
      if (data.scheduleCompleted) {
        Alert.alert("Schedule Complete", "All Tasks are complete. eDekhbhal will now show the next available Work Area.", [
          { text: "Next Work", onPress: () => router.replace("/(tabs)/work") }
        ]);
      }
    } catch (error) {
      Alert.alert("Complete Task", error instanceof Error ? error.message : "Unable to complete Task.");
    } finally {
      setLoading(false);
    }
  }

  async function addTaskNote(note: string) {
    if (!currentTask) return;
    await apiFetch(`/api/mobile/occurrence-tasks/${currentTask.id}/notes`, { method: "POST", body: JSON.stringify({ note }) });
    await load();
  }

  async function addScheduleNote(note: string) {
    if (!occurrence) return;
    await apiFetch(`/api/mobile/occurrences/${occurrence.id}/notes`, { method: "POST", body: JSON.stringify({ note }) });
    await load();
  }

  if (!occurrence) {
    return <View style={styles.screen}><ScreenHeader organizationName={membership?.organizationName} title="Loading Work…"/><View style={{padding:16}}><Card><Text style={styles.muted}>Loading current Schedule.</Text></Card></View></View>;
  }

  if (!currentTask && occurrence.status === "COMPLETED") {
    return <View style={styles.screen}><ScreenHeader organizationName={membership?.organizationName} title="Schedule Complete" subtitle={occurrence.workAreaName}/><View style={{padding:16}}><Card><Text style={styles.taskTitle}>All Tasks are complete.</Text><Text style={styles.muted}>Actual Schedule duration</Text><RunningTimer startedAt={occurrence.startedAt} stoppedAt={occurrence.completedAt} style={styles.bigTimer}/><PrimaryButton title="Next Available Work" onPress={() => router.replace("/(tabs)/work")}/></Card></View></View>;
  }

  if (!currentTask) {
    return <View style={styles.screen}><ScreenHeader organizationName={membership?.organizationName} title={occurrence.workAreaName}/><View style={{padding:16}}><Card><Text style={styles.muted}>No active Task is available for this Schedule.</Text></Card></View></View>;
  }

  const evidenceSaved = currentTask.evidence.length > 0;
  const requiredType = currentTask.evidenceTypeRequired ?? (currentTask.evidenceRule === "PHOTO" ? "PHOTO" : currentTask.evidenceRule === "VIDEO" ? "VIDEO" : "EITHER");
  const progress = occurrence.taskCount ? Math.round((occurrence.completedTaskCount / occurrence.taskCount) * 100) : 0;

  return <View style={styles.screen}>
    <ScreenHeader organizationName={membership?.organizationName} title={occurrence.workAreaName} subtitle={occurrence.propertyName} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.taskNav}>
        <Text style={styles.navText}>← Previous</Text>
        <Text style={styles.taskIndex}>Task {currentTask.sequence} of {occurrence.taskCount}</Text>
        <Text style={styles.navText}>Next →</Text>
      </View>

      <Card>
        <Pill>IN PROGRESS</Pill>
        <Text style={styles.taskTitle}>{currentTask.name}</Text>
        <Pressable onPress={() => setInstructionsOpen((v) => !v)} style={styles.instructionsToggle}>
          <Text style={styles.instructionsLabel}>Task Instructions</Text>
          <Text style={styles.toggleText}>{instructionsOpen ? "Minimize ▲" : "Expand ▼"}</Text>
        </Pressable>
        {instructionsOpen ? <View style={styles.instructionsBox}>
          <RenderHtml contentWidth={Math.max(250, width - 70)} source={{ html: currentTask.descriptionHtml || "<p>No instructions.</p>" }} baseStyle={{ color: colors.text, fontSize: 16, lineHeight: 23 }} />
        </View> : null}

        <View style={styles.timerGrid}>
          <View style={styles.timerCard}><Text style={styles.timerLabel}>Task Time</Text><RunningTimer startedAt={currentTask.actualStartAt} stoppedAt={currentTask.actualEndAt} style={styles.timerValue}/><Text style={styles.timerHint}>Planned {currentTask.plannedDurationMinutes} min</Text></View>
          <View style={styles.timerCard}><Text style={styles.timerLabel}>Overall Time</Text><RunningTimer startedAt={occurrence.startedAt} stoppedAt={occurrence.completedAt} style={styles.timerValue}/><Text style={styles.timerHint}>Schedule timer continues</Text></View>
        </View>

        <View style={styles.evidenceBlock}>
          <Text style={styles.sectionTitle}>Evidence</Text>
          {!currentTask.evidenceRequired ? <Text style={styles.ok}>No evidence required for this performance.</Text> : evidenceSaved ? <Text style={styles.ok}>✓ Required {currentTask.evidence[0]?.type.toLowerCase()} evidence saved from camera.</Text> : <>
            <Text style={styles.required}>Required: {requiredType === "EITHER" ? "Photo or Video" : requiredType}</Text>
            <PrimaryButton title={requiredType === "VIDEO" ? "Record Video" : requiredType === "PHOTO" ? "Take Picture" : "Capture Evidence"} onPress={() => setEvidenceOpen(true)} />
            <Text style={styles.galleryWarning}>Photo gallery selection is not available. Evidence must be captured live.</Text>
          </>}
        </View>

        <View style={styles.noteButtons}>
          <SecondaryButton title="+ Add Task Note" onPress={() => setTaskNoteOpen(true)} />
          <SecondaryButton title="+ Add Schedule Note" onPress={() => setScheduleNoteOpen(true)} />
        </View>

        <View style={styles.progressTrack}><View style={[styles.progressBar,{width:`${Math.max(4,progress)}%`}]} /></View>
        <Text style={styles.progressText}>{occurrence.completedTaskCount} of {occurrence.taskCount} Tasks complete</Text>

        <PrimaryButton title={currentTask.sequence === occurrence.taskCount ? "Complete Final Task" : "Complete Task"} onPress={completeTask} busy={loading} disabled={currentTask.evidenceRequired && !evidenceSaved} />
      </Card>

      {(currentTask.notes.length || occurrence.notes.length) ? <Card>
        <Text style={styles.sectionTitle}>Notes recorded</Text>
        {currentTask.notes.map((note) => <Text style={styles.noteLine} key={note.id}>Task: {note.note}</Text>)}
        {occurrence.notes.map((note) => <Text style={styles.noteLine} key={note.id}>Schedule: {note.note}</Text>)}
      </Card> : null}
    </ScrollView>

    <View style={styles.footerNav}>
      <Pressable onPress={() => router.push("/(tabs)/scan")}><Text style={styles.footerLink}>Scan</Text></Pressable>
      <Pressable onPress={() => router.push("/(tabs)/work")}><Text style={styles.footerLink}>My Work</Text></Pressable>
      <Pressable onPress={() => router.push("/(tabs)/report")}><Text style={styles.footerLink}>Report</Text></Pressable>
      <Pressable onPress={() => router.push("/(tabs)/profile")}><Text style={styles.footerLink}>Profile</Text></Pressable>
    </View>

    <NoteModal visible={taskNoteOpen} title="Add Task Note" onClose={() => setTaskNoteOpen(false)} onSave={addTaskNote}/>
    <NoteModal visible={scheduleNoteOpen} title="Add Schedule Note" onClose={() => setScheduleNoteOpen(false)} onSave={addScheduleNote}/>
    <EvidenceCamera visible={evidenceOpen} taskId={currentTask.id} allowedType={requiredType as any} onClose={() => setEvidenceOpen(false)} onSaved={load}/>
  </View>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},content:{padding:14,gap:12,paddingBottom:92},taskNav:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},navText:{color:colors.muted,fontSize:12},taskIndex:{fontWeight:"800",color:colors.text},taskTitle:{fontSize:21,lineHeight:28,fontWeight:"900",color:colors.text,marginTop:12},instructionsToggle:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:12,borderBottomWidth:1,borderColor:colors.border},instructionsLabel:{fontWeight:"800",color:colors.text},toggleText:{color:colors.primary,fontWeight:"700",fontSize:12},instructionsBox:{paddingVertical:10},timerGrid:{flexDirection:"row",gap:10,marginVertical:10},timerCard:{flex:1,backgroundColor:"#f8fafc",borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12},timerLabel:{fontSize:11,textTransform:"uppercase",color:colors.muted,fontWeight:"800"},timerValue:{fontSize:20,fontWeight:"900",color:colors.text,fontVariant:["tabular-nums"],marginTop:5},bigTimer:{fontSize:30,fontWeight:"900",color:colors.text,fontVariant:["tabular-nums"],marginBottom:18},timerHint:{fontSize:11,color:colors.muted,marginTop:4},evidenceBlock:{borderTopWidth:1,borderColor:colors.border,paddingTop:14,marginTop:6,gap:10},sectionTitle:{fontSize:16,fontWeight:"800",color:colors.text},required:{fontWeight:"800",color:colors.danger},ok:{color:"#16733c",fontWeight:"700"},galleryWarning:{fontSize:12,color:colors.muted,textAlign:"center"},noteButtons:{gap:8,marginTop:14},progressTrack:{height:12,borderRadius:999,backgroundColor:"#e5e7eb",overflow:"hidden",marginTop:18},progressBar:{height:"100%",backgroundColor:"#7fc28d"},progressText:{textAlign:"center",fontSize:12,color:colors.muted,marginVertical:8},noteLine:{paddingVertical:7,borderTopWidth:1,borderColor:colors.border,color:colors.text},muted:{color:colors.muted,marginVertical:12},footerNav:{position:"absolute",bottom:0,left:0,right:0,height:72,backgroundColor:"white",borderTopWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",justifyContent:"space-around",paddingBottom:8},footerLink:{color:colors.primary,fontWeight:"700"}
});
