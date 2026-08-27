import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "@/components/Ui";

function Icon({ symbol }: { symbol: string }) { return <Text style={{ fontSize: 20 }}>{symbol}</Text>; }

export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarStyle: { height: 66, paddingBottom: 8, paddingTop: 6 } }}>
    <Tabs.Screen name="work" options={{ title: "My Work", tabBarIcon: () => <Icon symbol="✓"/> }} />
    <Tabs.Screen name="scan" options={{ title: "Scan", tabBarIcon: () => <Icon symbol="⌕"/> }} />
    <Tabs.Screen name="report" options={{ title: "Report", tabBarIcon: () => <Icon symbol="▤"/> }} />
    <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: () => <Icon symbol="◉"/> }} />
  </Tabs>;
}
