import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import type { Occurrence } from "@/lib/types";
import { Card, colors, PrimaryButton, ScreenHeader } from "@/components/Ui";

export default function ScanScreen() {
  const session = useSession();
  const { t } = useI18n();
  const membership = session.memberships.find((m) => m.organizationId === session.organizationId);
  const [permission, requestPermission] = useCameraPermissions();
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [queueState, setQueueState] = useState<string>("EMPTY");
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ state: string; occurrence: Occurrence | null }>("/api/mobile/queue/next");
      setQueueState(data.state);
      setOccurrence(data.occurrence);
      if (data.state === "IN_PROGRESS" && data.occurrence) router.replace(`/execution/${data.occurrence.id}`);
    } catch (error) {
      Alert.alert(t("scan"), error instanceof Error ? error.message : "Unable to load current work.");
    }
  }, [t]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function scanned(value: string) {
    if (scanning || !occurrence) return;
    setScanning(true);
    try {
      const data = await apiFetch<{ occurrence: Occurrence }>(`/api/mobile/occurrences/${occurrence.id}/scan`, {
        method: "POST",
        body: JSON.stringify({ scannedValue: value })
      });
      router.replace(`/execution/${data.occurrence.id}`);
    } catch (error) {
      Alert.alert("QR Code", error instanceof Error ? error.message : "Unable to validate QR Code.", [
        { text: t("tryAgain"), onPress: () => setScanning(false) }
      ]);
    }
  }

  if (!occurrence || queueState === "AVAILABLE" || queueState === "EMPTY") {
    return <View style={styles.screen}><ScreenHeader organizationName={membership?.organizationName} title={t("scan")} subtitle={t("workAreaQr")}/><View style={styles.pad}><Card><Text style={styles.title}>{t("claimFirst")}</Text><Text style={styles.help}>{t("claimFirstHelp")}</Text><PrimaryButton title={t("goToMyWork")} onPress={() => router.push("/(tabs)/work")}/></Card></View></View>;
  }

  if (!permission?.granted) {
    return <View style={styles.screen}><ScreenHeader organizationName={membership?.organizationName} title={t("scan")}/><View style={styles.pad}><Card><Text style={styles.title}>{t("cameraPermissionRequired")}</Text><Text style={styles.help}>{t("cameraPermissionHelp")}</Text><PrimaryButton title={t("allowCamera")} onPress={requestPermission}/></Card></View></View>;
  }

  return <View style={styles.screen}>
    <ScreenHeader organizationName={membership?.organizationName} title={occurrence.workAreaName} subtitle={occurrence.propertyName}/>
    <CameraView
      style={styles.camera}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={scanning ? undefined : (event) => scanned(event.data)}
    />
    <View style={styles.overlay}><Text style={styles.scanText}>{scanning ? t("validatingWorkArea") : t("pointCamera")}</Text></View>
  </View>;
}

const styles=StyleSheet.create({screen:{flex:1,backgroundColor:colors.bg},pad:{padding:16},camera:{flex:1},overlay:{position:"absolute",left:20,right:20,bottom:90,backgroundColor:"rgba(0,0,0,.72)",padding:14,borderRadius:12},scanText:{color:"white",textAlign:"center",fontWeight:"700"},title:{fontSize:18,fontWeight:"800",color:colors.text},help:{color:colors.muted,lineHeight:20,marginVertical:14}});
