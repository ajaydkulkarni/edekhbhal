import {Tabs} from "expo-router";
import {Text,type ColorValue} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {colors} from "@/components/Ui";
import {useI18n} from "@/lib/i18n";
function Icon({symbol,color}:{symbol:string;color:ColorValue}){return <Text style={{fontSize:19,lineHeight:22,color,fontWeight:"900"}}>{symbol}</Text>}
export default function TabsLayout(){const{t}=useI18n();const insets=useSafeAreaInsets(),bottomInset=Math.max(insets.bottom,10);return <Tabs screenOptions={{headerShown:false,tabBarHideOnKeyboard:true,tabBarActiveTintColor:colors.primary,tabBarInactiveTintColor:"#7d9094",tabBarLabelStyle:{fontSize:11,lineHeight:14,fontWeight:"800",marginTop:2},tabBarItemStyle:{paddingTop:6},tabBarStyle:{height:62+bottomInset,paddingBottom:bottomInset,paddingTop:5,backgroundColor:"#ffffff",borderTopColor:colors.border,borderTopWidth:1,elevation:16}}}><Tabs.Screen name="work" options={{title:t("myWork"),tabBarIcon:({color})=><Icon symbol="✓" color={color}/>}}/><Tabs.Screen name="scan" options={{title:t("scan"),tabBarIcon:({color})=><Icon symbol="⌗" color={color}/>}}/><Tabs.Screen name="report" options={{title:t("report"),tabBarIcon:({color})=><Icon symbol="＋" color={color}/>}}/><Tabs.Screen name="profile" options={{title:t("profile"),tabBarIcon:({color})=><Icon symbol="●" color={color}/>}}/></Tabs>}
