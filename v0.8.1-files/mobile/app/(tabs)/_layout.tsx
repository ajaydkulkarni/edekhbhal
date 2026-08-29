import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/components/Ui";
import { useI18n } from "@/lib/i18n";

function Icon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 20, lineHeight: 22, color, fontWeight: "800" }}>{symbol}</Text>;
}

export default function TabsLayout() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return <Tabs
    screenOptions={{
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarActiveBackgroundColor: "#eef5fc",
      tabBarLabelStyle: {
        fontSize: 12,
        lineHeight: 15,
        fontWeight: "700",
        marginTop: 1
      },
      tabBarItemStyle: {
        paddingTop: 5
      },
      tabBarStyle: {
        height: 58 + bottomInset,
        paddingBottom: bottomInset,
        paddingTop: 4,
        backgroundColor: colors.card,
        borderTopColor: colors.border,
        borderTopWidth: 1,
        elevation: 12
      }
    }}
  >
    <Tabs.Screen name="work" options={{ title: t("myWork"), tabBarIcon: ({ color }) => <Icon symbol="✓" color={color} /> }} />
    <Tabs.Screen name="scan" options={{ title: t("scan"), tabBarIcon: ({ color }) => <Icon symbol="⌕" color={color} /> }} />
    <Tabs.Screen name="report" options={{ title: t("report"), tabBarIcon: ({ color }) => <Icon symbol="▤" color={color} /> }} />
    <Tabs.Screen name="profile" options={{ title: t("profile"), tabBarIcon: ({ color }) => <Icon symbol="●" color={color} /> }} />
  </Tabs>;
}
