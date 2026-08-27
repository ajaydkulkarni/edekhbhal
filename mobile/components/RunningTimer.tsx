import React, { useEffect, useState } from "react";
import { Text } from "react-native";

function format(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RunningTimer({ startedAt, stoppedAt, style }: { startedAt: string | null; stoppedAt?: string | null; style?: any }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt || stoppedAt) return;
    const handle = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(handle);
  }, [startedAt, stoppedAt]);

  if (!startedAt) return <Text style={style}>00:00:00</Text>;
  const start = new Date(startedAt).getTime();
  const end = stoppedAt ? new Date(stoppedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return <Text style={style}>{format(seconds)}</Text>;
}
