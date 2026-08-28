import RenderHtml from "react-native-render-html";
import * as Speech from "expo-speech";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { apiFetch } from "@/lib/api";
import type { Occurrence } from "@/lib/types";
import { useSession } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { useOccurrenceTranslation } from "@/lib/contentTranslation";
import { EvidenceCamera } from "@/components/EvidenceCamera";
import { NoteModal } from "@/components/NoteModal";
import { RunningTimer } from "@/components/RunningTimer";
import { Card, colors, Pill, PrimaryButton, ScreenHeader, SecondaryButton } from "@/components/Ui";

function plainTextFromHtml(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function speechChunks(value: string, max = 2400) {
  const text = value.trim();
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!sentence) continue;
    if ((current + " " + sentence).trim().length <= max) {
      current = (current + " " + sentence).trim();
      continue;
    }
    if (current) chunks.push(current);
    if (sentence.length <= max) current = sentence;
    else {
      for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max));
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export default function ExecutionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const { t, info, language } = useI18n();
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);
  const { width } = useWindowDimensions();
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [loading, setLoading] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [taskNoteOpen, setTaskNoteOpen] = useState(false);
  const [scheduleNoteOpen, setScheduleNoteOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const speechRunRef = useRef(0);
  const translation = useOccurrenceTranslation(occurrence?.id, session.user?.preferredLanguage);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<{ occurrence: Occurrence }>(`/api/mobile/occurrences/${id}`);
      setOccurrence(data.occurrence);
    } catch (error) {
      Alert.alert(t("currentWork"), error instanceof Error ? error.message : "Unable to load current work.");
    }
  }, [id, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { void Speech.stop(); }, []);

  const currentTask = useMemo(() => {
    if (!occurrence) return null;
    return occurrence.tasks.find((task) => task.status === "IN_PROGRESS") ?? null;
  }, [occurrence]);

  const translatedTask = currentTask
    ? translation.data?.tasks.find((task) => task.id === currentTask.id) ?? null
    : null;
  const displayTaskName = translatedTask?.nameTranslated ? translatedTask.name : currentTask?.name ?? "";
  const translatedDescription = translatedTask?.descriptionTranslated ? translatedTask.descriptionText : null;

  async function stopReading() {
    speechRunRef.current += 1;
    await Speech.stop();
    setSpeaking(false);
  }

  async function readInstructions() {
    if (!currentTask) return;
    await Speech.stop();
    const runId = speechRunRef.current + 1;
    speechRunRef.current = runId;
    const sourceDescription = plainTextFromHtml(currentTask.descriptionHtml);
    const translationComplete = Boolean(
      translatedTask?.nameTranslated
      && (!sourceDescription || translatedTask.descriptionTranslated)
    );
    const spokenDescription = translationComplete ? translatedTask?.descriptionText ?? "" : sourceDescription;
    const spokenName = translationComplete ? translatedTask?.name ?? currentTask.name : currentTask.name;
    const chunks = speechChunks(`${spokenName}. ${spokenDescription}`);
    if (!chunks.length) return;

    const languageCode = translationComplete ? info.speechLocale : "en-US";
    setSpeaking(true);

    const speakNext = (index: number) => {
      if (speechRunRef.current !== runId) return;
      if (index >= chunks.length) {
        setSpeaking(false);
        return;
      }
      Speech.speak(chunks[index], {
        language: languageCode,
        rate: 0.92,
        onDone: () => speakNext(index + 1),
        onStopped: () => { if (speechRunRef.current === runId) setSpeaking(false); },
        onError: () => { if (speechRunRef.current === runId) setSpeaking(false); }
      });
    };

    speakNext(0);
  }

  async function completeTask() {
    if (!currentTask) return;
    setLoading(true);
    await stopReading();
    try {
      const data = await apiFetch<{ occurrence: Occurrence; scheduleCompleted: boolean }>(`/api/mobile/occurrence-tasks/${currentTask.id}/complete`, { method: "POST" });
      setOccurrence(data.occurrence);
      setInstructionsOpen(true);
      if (data.scheduleCompleted) {
        Alert.alert(t("scheduleComplete"), t("allTasksComplete"), [
          { text: t("nextAvailableWork"), onPress: () => router.replace("/(tabs)/work") }
        ]);
      }
    } catch (error) {
      Alert.alert(t("completeTask"), error instanceof Error ? error.message : "Unable to complete Task.");
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
    return <View style={styles.screen}><ScreenHeader organizationName={membership?.organizationName} title={t("loadingWork")}/><View style={{padding:16}}><Card><Text style={styles.muted}>{t("loadingWork")}</Text></Card></View></View>;
  }

  if (!currentTask && occurrence.status === "COMPLETED") {
    return <View style={styles.screen}><ScreenHeader organizationName={membership?.organizationName} title={t("scheduleComplete")} subtitle={occurrence.workAreaName}/><View style={{padding:16}}><Card><Text style={styles.taskTitle}>{t("allTasksComplete")}</Text><Text style={styles.muted}>{t("actualScheduleDuration")}</Text><RunningTimer startedAt={occurrence.startedAt} stoppedAt={occurrence.completedAt} style={styles.bigTimer}/><PrimaryButton title={t("nextAvailableWork")} onPress={() => router.replace("/(tabs)/work")}/></Card></View></View>;
  }

  if (!currentTask) {
    return <View style={styles.screen}><ScreenHeader organizationName={membership?.organizationName} title={occurrence.workAreaName}/><View style={{padding:16}}><Card><Text style={styles.muted}>{t("noActiveTask")}</Text></Card></View></View>;
  }

  const evidenceSaved = currentTask.evidence.length > 0;
  const requiredType = currentTask.evidenceTypeRequired ?? (currentTask.evidenceRule === "PHOTO" ? "PHOTO" : currentTask.evidenceRule === "VIDEO" ? "VIDEO" : "EITHER");
  const progress = occurrence.taskCount ? Math.round((occurrence.completedTaskCount / occurrence.taskCount) * 100) : 0;
  const sourceDescriptionText = plainTextFromHtml(currentTask.descriptionHtml);
  const translationUnavailable = Boolean(
    language !== "en"
    && translation.data
    && (!translatedTask?.nameTranslated || (Boolean(sourceDescriptionText) && !translatedTask?.descriptionTranslated))
  );

  return <View style={styles.screen}>
    <ScreenHeader organizationName={membership?.organizationName} title={occurrence.workAreaName} subtitle={occurrence.propertyName} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.taskNav}>
        <Text style={styles.navText}>← {t("previous")}</Text>
        <Text style={styles.taskIndex}>{t("taskOf")} {currentTask.sequence} {t("of")} {occurrence.taskCount}</Text>
        <Text style={styles.navText}>{t("next")} →</Text>
      </View>

      <Card>
        <Pill>{t("inProgress")}</Pill>
        <Text style={styles.taskTitle}>{displayTaskName}</Text>
        {translatedTask?.nameTranslated && translatedTask.name !== currentTask.name ? <Text style={styles.sourceName}>{t("englishSource")}: {currentTask.name}</Text> : null}
        {translationUnavailable ? <Text style={styles.translationWarning}>{t("translationUnavailable")}</Text> : null}

        <View style={styles.speakerRow}>
          <View style={{ flex: 1 }}><SecondaryButton title={`🔊 ${t("readAloud")}`} onPress={readInstructions} /></View>
          {speaking ? <View style={{ flex: 1 }}><SecondaryButton title={`■ ${t("stopReading")}`} onPress={stopReading} /></View> : null}
        </View>

        <Pressable onPress={() => setInstructionsOpen((v) => !v)} style={styles.instructionsToggle}>
          <Text style={styles.instructionsLabel}>{t("taskInstructions")}</Text>
          <Text style={styles.toggleText}>{instructionsOpen ? `${t("minimize")} ▲` : `${t("expand")} ▼`}</Text>
        </Pressable>
        {instructionsOpen ? <View style={styles.instructionsBox}>
          {translatedDescription ? <>
            <Text style={styles.translatedText}>{translatedDescription || t("noInstructions")}</Text>
            <Text style={styles.sourceLabel}>{t("englishSource")}</Text>
            <RenderHtml contentWidth={Math.max(250, width - 70)} source={{ html: currentTask.descriptionHtml || `<p>${t("noInstructions")}</p>` }} baseStyle={{ color: colors.muted, fontSize: 13, lineHeight: 19 }} />
          </> : <RenderHtml contentWidth={Math.max(250, width - 70)} source={{ html: currentTask.descriptionHtml || `<p>${t("noInstructions")}</p>` }} baseStyle={{ color: colors.text, fontSize: 16, lineHeight: 23 }} />}
        </View> : null}

        <View style={styles.timerGrid}>
          <View style={styles.timerCard}><Text style={styles.timerLabel}>{t("taskTime")}</Text><RunningTimer startedAt={currentTask.actualStartAt} stoppedAt={currentTask.actualEndAt} style={styles.timerValue}/><Text style={styles.timerHint}>{t("planned")} {currentTask.plannedDurationMinutes} {t("minuteShort")}</Text></View>
          <View style={styles.timerCard}><Text style={styles.timerLabel}>{t("overallTime")}</Text><RunningTimer startedAt={occurrence.startedAt} stoppedAt={occurrence.completedAt} style={styles.timerValue}/><Text style={styles.timerHint}>{t("scheduleTimerContinues")}</Text></View>
        </View>

        <View style={styles.evidenceBlock}>
          <Text style={styles.sectionTitle}>{t("evidence")}</Text>
          {!currentTask.evidenceRequired ? <Text style={styles.ok}>{t("noEvidenceRequired")}</Text> : evidenceSaved ? <Text style={styles.ok}>✓ {t("evidenceSaved")}</Text> : <>
            <Text style={styles.required}>{t("required")}: {requiredType === "EITHER" ? t("photoOrVideo") : requiredType === "PHOTO" ? t("photo") : t("video")}</Text>
            <PrimaryButton title={requiredType === "VIDEO" ? t("recordVideo") : requiredType === "PHOTO" ? t("takePicture") : t("captureEvidence")} onPress={() => setEvidenceOpen(true)} />
            <Text style={styles.galleryWarning}>{t("liveEvidenceOnly")}</Text>
          </>}
        </View>

        <View style={styles.noteButtons}>
          <SecondaryButton title={`+ ${t("addTaskNote")}`} onPress={() => setTaskNoteOpen(true)} />
          <SecondaryButton title={`+ ${t("addScheduleNote")}`} onPress={() => setScheduleNoteOpen(true)} />
        </View>

        <View style={styles.progressTrack}><View style={[styles.progressBar,{width:`${Math.max(4,progress)}%`}]} /></View>
        <Text style={styles.progressText}>{occurrence.completedTaskCount} {t("of")} {occurrence.taskCount} {t("tasks")}</Text>

        <PrimaryButton title={currentTask.sequence === occurrence.taskCount ? t("completeFinalTask") : t("completeTask")} onPress={completeTask} busy={loading} disabled={currentTask.evidenceRequired && !evidenceSaved} />
      </Card>

      {(currentTask.notes.length || occurrence.notes.length) ? <Card>
        <Text style={styles.sectionTitle}>{t("notesRecorded")}</Text>
        {currentTask.notes.map((note) => <Text style={styles.noteLine} key={note.id}>{t("task")}: {note.note}</Text>)}
        {occurrence.notes.map((note) => <Text style={styles.noteLine} key={note.id}>{t("schedule")}: {note.note}</Text>)}
      </Card> : null}
    </ScrollView>

    <View style={styles.footerNav}>
      <Pressable onPress={() => router.push("/(tabs)/scan")}><Text style={styles.footerLink}>{t("scan")}</Text></Pressable>
      <Pressable onPress={() => router.push("/(tabs)/work")}><Text style={styles.footerLink}>{t("myWork")}</Text></Pressable>
      <Pressable onPress={() => router.push("/(tabs)/report")}><Text style={styles.footerLink}>{t("report")}</Text></Pressable>
      <Pressable onPress={() => router.push("/(tabs)/profile")}><Text style={styles.footerLink}>{t("profile")}</Text></Pressable>
    </View>

    <NoteModal visible={taskNoteOpen} title={t("addTaskNote")} onClose={() => setTaskNoteOpen(false)} onSave={addTaskNote}/>
    <NoteModal visible={scheduleNoteOpen} title={t("addScheduleNote")} onClose={() => setScheduleNoteOpen(false)} onSave={addScheduleNote}/>
    <EvidenceCamera visible={evidenceOpen} taskId={currentTask.id} allowedType={requiredType as any} onClose={() => setEvidenceOpen(false)} onSaved={load}/>
  </View>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},content:{padding:14,gap:12,paddingBottom:92},taskNav:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},navText:{color:colors.muted,fontSize:12},taskIndex:{fontWeight:"800",color:colors.text},taskTitle:{fontSize:21,lineHeight:28,fontWeight:"900",color:colors.text,marginTop:12},sourceName:{fontSize:11,color:colors.muted,marginTop:3},translationWarning:{backgroundColor:"#fff7e6",borderWidth:1,borderColor:"#f5d28a",color:"#7a5200",padding:9,borderRadius:9,marginTop:10,fontSize:12,lineHeight:17},speakerRow:{flexDirection:"row",gap:8,marginTop:12},instructionsToggle:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:12,borderBottomWidth:1,borderColor:colors.border},instructionsLabel:{fontWeight:"800",color:colors.text},toggleText:{color:colors.primary,fontWeight:"700",fontSize:12},instructionsBox:{paddingVertical:10},translatedText:{color:colors.text,fontSize:17,lineHeight:25},sourceLabel:{color:colors.muted,fontSize:10,fontWeight:"800",textTransform:"uppercase",marginTop:14,marginBottom:2},timerGrid:{flexDirection:"row",gap:10,marginVertical:10},timerCard:{flex:1,backgroundColor:"#f8fafc",borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12},timerLabel:{fontSize:11,textTransform:"uppercase",color:colors.muted,fontWeight:"800"},timerValue:{fontSize:20,fontWeight:"900",color:colors.text,fontVariant:["tabular-nums"],marginTop:5},bigTimer:{fontSize:30,fontWeight:"900",color:colors.text,fontVariant:["tabular-nums"],marginBottom:18},timerHint:{fontSize:11,color:colors.muted,marginTop:4},evidenceBlock:{borderTopWidth:1,borderColor:colors.border,paddingTop:14,marginTop:6,gap:10},sectionTitle:{fontSize:16,fontWeight:"800",color:colors.text},required:{fontWeight:"800",color:colors.danger},ok:{color:"#16733c",fontWeight:"700"},galleryWarning:{fontSize:12,color:colors.muted,textAlign:"center"},noteButtons:{gap:8,marginTop:14},progressTrack:{height:12,borderRadius:999,backgroundColor:"#e5e7eb",overflow:"hidden",marginTop:18},progressBar:{height:"100%",backgroundColor:"#7fc28d"},progressText:{textAlign:"center",fontSize:12,color:colors.muted,marginVertical:8},noteLine:{paddingVertical:7,borderTopWidth:1,borderColor:colors.border,color:colors.text},muted:{color:colors.muted,marginVertical:12},footerNav:{position:"absolute",bottom:0,left:0,right:0,height:72,backgroundColor:"white",borderTopWidth:1,borderColor:colors.border,flexDirection:"row",alignItems:"center",justifyContent:"space-around",paddingBottom:8},footerLink:{color:colors.primary,fontWeight:"700"}
});
