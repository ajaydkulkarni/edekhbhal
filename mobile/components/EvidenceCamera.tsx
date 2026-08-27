import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { File } from "expo-file-system";
import React, { useRef, useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { colors, PrimaryButton, SecondaryButton } from "./Ui";

export type CaptureType = "PHOTO" | "VIDEO";

type UploadTicket = {
  signedUrl: string;
  path: string;
  token: string;
  bucket: string;
  type: CaptureType;
  mimeType: string;
  maxSizeBytes: number;
};

export function EvidenceCamera({
  visible,
  taskId,
  allowedType,
  onClose,
  onSaved
}: {
  visible: boolean;
  taskId: string;
  allowedType: "PHOTO" | "VIDEO" | "EITHER";
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [captureType, setCaptureType] = useState<CaptureType>(allowedType === "VIDEO" ? "VIDEO" : "PHOTO");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  async function ensurePermissions(type: CaptureType) {
    let cameraGranted = cameraPermission?.granted;
    if (!cameraGranted) cameraGranted = (await requestCameraPermission()).granted;
    if (!cameraGranted) throw new Error("Camera permission is required.");

    if (type === "VIDEO") {
      let micGranted = microphonePermission?.granted;
      if (!micGranted) micGranted = (await requestMicrophonePermission()).granted;
      if (!micGranted) throw new Error("Microphone permission is required for video evidence.");
    }
  }

  async function uploadCapturedFile(uri: string, type: CaptureType) {
    const file = new File(uri);
    const reportedType = file.type?.toLowerCase();
    const mimeType = type === "PHOTO"
      ? (["image/jpeg", "image/png"].includes(reportedType) ? reportedType : "image/jpeg")
      : (["video/mp4", "video/quicktime"].includes(reportedType)
          ? reportedType
          : (Platform.OS === "ios" && uri.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4"));
    const ticket = await apiFetch<UploadTicket>(`/api/mobile/occurrence-tasks/${taskId}/evidence/upload-url`, {
      method: "POST",
      body: JSON.stringify({ type, mimeType, sizeBytes: file.size })
    });

    if (file.size > ticket.maxSizeBytes) throw new Error("Captured evidence is larger than the allowed upload size.");
    const body = await file.arrayBuffer();
    const upload = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: {
        "content-type": mimeType,
        "cache-control": "max-age=3600",
        "x-upsert": "false"
      },
      body: body as any
    });
    if (!upload.ok) throw new Error(`Evidence upload failed (${upload.status}).`);

    await apiFetch(`/api/mobile/occurrence-tasks/${taskId}/evidence/confirm`, {
      method: "POST",
      body: JSON.stringify({
        type,
        storagePath: ticket.path,
        mimeType,
        sizeBytes: file.size,
        metadata: {
          captureSource: "CAMERA",
          mobilePlatform: Platform.OS,
          maxVideoDurationSeconds: type === "VIDEO" ? 30 : null
        }
      })
    });
  }

  async function capturePhoto() {
    try {
      setBusy(true);
      await ensurePermissions("PHOTO");
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.72 });
      if (!photo?.uri) throw new Error("No photo was captured.");
      await uploadCapturedFile(photo.uri, "PHOTO");
      await onSaved();
      onClose();
    } catch (error) {
      Alert.alert("Evidence", error instanceof Error ? error.message : "Unable to save photo evidence.");
    } finally {
      setBusy(false);
    }
  }

  async function captureVideo() {
    try {
      setBusy(true);
      await ensurePermissions("VIDEO");
      setRecording(true);
      const video = await cameraRef.current?.recordAsync({ maxDuration: 30 });
      setRecording(false);
      if (!video?.uri) throw new Error("No video was captured.");
      await uploadCapturedFile(video.uri, "VIDEO");
      await onSaved();
      onClose();
    } catch (error) {
      setRecording(false);
      Alert.alert("Evidence", error instanceof Error ? error.message : "Unable to save video evidence.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.title}>Capture Evidence</Text>
        <Pressable onPress={onClose} disabled={busy}><Text style={styles.close}>Close</Text></Pressable>
      </View>

      {allowedType === "EITHER" ? <View style={styles.typeRow}>
        <Pressable style={[styles.typeButton, captureType === "PHOTO" && styles.typeSelected]} onPress={() => setCaptureType("PHOTO")} disabled={busy}>
          <Text style={captureType === "PHOTO" ? styles.typeSelectedText : styles.typeText}>Photo</Text>
        </Pressable>
        <Pressable style={[styles.typeButton, captureType === "VIDEO" && styles.typeSelected]} onPress={() => setCaptureType("VIDEO")} disabled={busy}>
          <Text style={captureType === "VIDEO" ? styles.typeSelectedText : styles.typeText}>Video</Text>
        </Pressable>
      </View> : null}

      <CameraView ref={cameraRef} style={styles.camera} facing="back" mode={captureType === "VIDEO" ? "video" : "picture"} />

      <View style={styles.bottom}>
        <Text style={styles.help}>Evidence must be captured live. The app does not provide access to the photo gallery.</Text>
        {captureType === "VIDEO" ? (
          recording ? <PrimaryButton title="Stop Recording" onPress={() => cameraRef.current?.stopRecording()} />
          : <PrimaryButton title="Record Video (max 30 sec)" onPress={captureVideo} busy={busy} />
        ) : <PrimaryButton title="Take Photo" onPress={capturePhoto} busy={busy} />}
        <SecondaryButton title="Cancel" onPress={onClose} disabled={busy} />
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topbar: { backgroundColor: "#fff", paddingTop: 52, paddingHorizontal: 18, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  close: { color: colors.primary, fontWeight: "700" },
  typeRow: { backgroundColor: "#fff", flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingBottom: 12 },
  typeButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, alignItems: "center" },
  typeSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { color: colors.text, fontWeight: "700" },
  typeSelectedText: { color: "#fff", fontWeight: "800" },
  camera: { flex: 1 },
  bottom: { backgroundColor: "#fff", padding: 18, gap: 10 },
  help: { color: colors.muted, textAlign: "center", lineHeight: 19 }
});
