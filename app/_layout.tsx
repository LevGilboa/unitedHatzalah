import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import 'react-native-reanimated';
import { LogBox } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import AppLoading from '@/components/AppLoading';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/configs/FirebaseConfig';
import Call from '@/components/Call';
import { useArrayStore } from '@/stores/arrStore';
import { initializeAIProcessor } from '@/services/AIContentProcessor';
import Constants from 'expo-constants';

// Suppress known warnings
LogBox.ignoreLogs([
  'Unexpected text node',
  'pointerEvents is deprecated',
  'Image: style.resizeMode is deprecated',
]);

export default function RootLayout() {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [callId, setCallId] = useState('');
  const user = useAuthStore((state) => state.user);
  const Items = useArrayStore((state) => state.items);

  useEffect(() => {
    // Get AI configuration from environment variables
    const rawProvider = Constants.expoConfig?.extra?.EXPO_PUBLIC_AI_PROVIDER ?? (process.env as any).EXPO_PUBLIC_AI_PROVIDER ?? '';
    // Trim and remove any surrounding quotes that might have been accidentally added
    const aiProvider = rawProvider.trim().replace(/^["']|["']$/g, '').toLowerCase();

    // Debug: Log what we got from environment
    console.log('[AI Config Debug] Raw Provider:', `"${rawProvider}"`);
    console.log('[AI Config Debug] Clean Provider:', `"${aiProvider}"`);

    // Initialize AI processor
    if (aiProvider === 'bedrock' || !aiProvider) {
      // AWS Bedrock via server proxy (Render.com / local server)
      console.log('[AI] initializeAIProcessor -> provider: bedrock (via server proxy)');
      initializeAIProcessor({
        provider: 'bedrock',
      });
    } else {
      // Fallback to local generation
      console.log('[AI] initializeAIProcessor -> provider: local');
      initializeAIProcessor({
        provider: 'local',
      });
      console.warn('Using basic local generation');
    }

    const callsRef = collection(db, 'calls');
    const unsubscribe = onSnapshot(
      callsRef,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            try {
              const newCall = change.doc.data();
              if (!newCall || !newCall.skill) return;

              const userBadges = user?.badges || [];
              const hasBadge = userBadges.some((badge) => badge?.title === newCall.skill);
              if (!hasBadge) return;

              const message = `קריאה חדשה לעזרה ${newCall.skill || ''} במיקום: ${newCall.location || 'לא ידוע'}`;
              setModalMessage(message);

              const callIdMap: any = {
                Fire: '1',
                CPR: '11',
                Snakes: '4',
                Stroke: '2',
              };
              setCallId(callIdMap[newCall.skill] || '');

              setModalVisible(true);
            } catch (error) {
              console.error('Error processing call:', error);
            }
          }
        });
      },
      (error) => {
        console.error('Firestore listener error:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const loading = useAuthStore((state) => state.loading);

  if (loading) {
    return <AppLoading />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>

      {/* Render the Call modal */}
      <Call visible={modalVisible} setVisible={setModalVisible} message={modalMessage} id={callId} />
    </>
  );
}
