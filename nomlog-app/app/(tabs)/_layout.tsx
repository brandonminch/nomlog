import React from 'react';
import { Tabs, router } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrendingUp, ListChecks, User, MessageCirclePlus } from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

type TabConfig = {
  name: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

const TABS: TabConfig[] = [
  { name: 'profile', label: 'Profile', icon: User },
  { name: 'stats', label: 'Stats', icon: TrendingUp },
  { name: 'meal-logs', label: 'Logs', icon: ListChecks },
];

type TabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigation: {
    navigate: (name: string) => void;
  };
};

const TabBar: React.FC<TabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomFadeHeight = 110 + (insets.bottom || 0);
  const screenWidth = Dimensions.get('window').width;
  const currentRouteName = state.routes[state.index]?.name;
  const currentTabName = currentRouteName
    ? currentRouteName.split('/').filter(Boolean).pop()
    : undefined;

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom || 12 }]}>
      <Svg
        pointerEvents="none"
        width={screenWidth}
        height={bottomFadeHeight}
        style={styles.bottomFade}
      >
        <Defs>
          <LinearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={screenWidth} height={bottomFadeHeight} fill="url(#bottomFade)" />
      </Svg>
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isFocused = currentTabName === tab.name;
          const Icon = tab.icon;

          return (
            <TouchableOpacity
              key={tab.name}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={() => navigation.navigate(tab.name)}
              style={styles.tabItem}
              activeOpacity={0.8}
            >
              <Icon
                size={22}
                strokeWidth={2.2}
                color={isFocused ? '#000000' : '#6b7280'}
              />
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.chatButton}
        activeOpacity={0.9}
        onPress={() => router.push('/chat')}
      >
        <MessageCirclePlus size={24} color="#ffffff" strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
      tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} />}
    >
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="stats" />
      <Tabs.Screen name="meal-logs" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginHorizontal: 2,
  },
  tabLabel: {
    marginTop: 4,
    fontSize: 11,
    color: '#6b7280',
  },
  tabLabelActive: {
    color: '#000000',
    fontWeight: '600',
  },
  chatButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 18,
  },
});

