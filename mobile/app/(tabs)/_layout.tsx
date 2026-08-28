import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "@/components/Ui";
import { useI18n } from "@/lib/i18n";

function Icon({ symbol }: { symbol: string }) { return <Text style={{ fontSize: 20 }}>{symbol}</Text>; }

export default function TabsLayout() {
  const { t } = useI18n();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarStyle: { height: 66, paddingBottom: 8, paddingTop: 6 } }}>
    <Tabs.Screen name="work" options={{ title: t("myWork"), tabBarIcon: () => <Icon symbol="✓"/> }} />
    <Tabs.Screen name="scan" options={{ title: t("scan"), tabBarIcon: () => <Icon symbol="⌕"/> }} />
    <Tabs.Screen name="report" options={{ title: t("report"), tabBarIcon: () => <Icon symbol="▤"/> }} />
    <Tabs.Screen name="profile" options={{ title: t("profile"), tabBarIcon: () => <Icon symbol="◉"/> }} />
  </Tabs>;
}
