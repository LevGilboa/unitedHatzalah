import { Tabs } from 'expo-router';
import * as React from 'react';
import { I18nManager } from 'react-native';

import { Colors } from '@/constants/Colors';
import {
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import UserStats from '@/components/Header/UserStatsBar';

// Ensure the layout is RTL
I18nManager.forceRTL(true);

export default function TabLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <>
      {isAuthenticated ? <UserStats flameCount={0} diamondCount={0} heartCount={0} /> : null}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: 'gray',
          tabBarStyle: { backgroundColor: Colors.white },

          // Align items to have label before icon
          tabBarItemStyle: {
            flexDirection: 'row', // Set to 'row' to have label first in RTL
            alignItems: 'center',
          },
          tabBarLabelStyle: {
            marginRight: 6, // Space between label and icon
            fontSize: 12,
          },
        }}
      >
        {/* Upload Content Tab - NEW */}
        <Tabs.Screen
          name="upload"
          options={{
            title: 'העלאה',
            tabBarIcon: ({ color }) => (
              <Ionicons name="cloud-upload" size={24} color={color} />
            ),
          }}
        />

        {/* My Content Tab - NEW */}
        <Tabs.Screen
          name="my-content"
          options={{
            title: 'הקבצים שלי',
            tabBarIcon: ({ color }) => (
              <Ionicons name="document-text" size={24} color={color} />
            ),
          }}
        />

        {/* דיונים ושאלות (Discussions) Tab */}
        <Tabs.Screen
          name="community"
          options={{
            title: 'דיונים',
            tabBarIcon: ({ color }) => (
              <Ionicons name="chatbubbles" size={24} color={color} />
            ),
          }}
        />

        {/* Hide events tab */}
        <Tabs.Screen
          name="events"
          options={{
            href: null,
          }}
        />
        {/* פרופיל (Profile) Tab - HIDDEN, moved to settings */}
        <Tabs.Screen
          name="profile"
          options={{
            href: null,
          }}
        />

        {/* ליגה (League) Tab */}
        <Tabs.Screen
          name="league"
          options={{
            title: 'ליגה',
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons name="trophy" size={24} color={color} />
            ),
          }}
        />

        {/* ראשי (Home) Tab */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'למידה',
            tabBarIcon: ({ color }) => (
              <Ionicons name="home" size={24} color={color} />
            ),
          }}
        />
        {/* SOS (emergency) Tab - HIDDEN */}
        <Tabs.Screen
          name="emergency"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </>
  );
}