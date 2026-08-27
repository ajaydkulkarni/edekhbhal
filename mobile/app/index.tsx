import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/lib/session";

export default function Index() {
  const session = useSession();
  if (session.loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
  return <Redirect href={session.signedIn ? "/(tabs)/work" : "/login"} />;
}
