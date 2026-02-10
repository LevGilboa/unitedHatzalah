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
    const aiProvider = Constants.expoConfig?.extra?.EXPO_PUBLIC_AI_PROVIDER ?? (process.env as any).EXPO_PUBLIC_AI_PROVIDER ?? '';
    const geminiApiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_GEMINI_API_KEY ?? (process.env as any).EXPO_PUBLIC_GEMINI_API_KEY ?? '';
    const groqApiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_GROQ_API_KEY ?? (process.env as any).EXPO_PUBLIC_GROQ_API_KEY ?? '';
    const groqModel = Constants.expoConfig?.extra?.EXPO_PUBLIC_GROQ_MODEL ?? (process.env as any).EXPO_PUBLIC_GROQ_MODEL ?? 'llama-3.1-70b-versatile';
    const ollamaEndpoint = Constants.expoConfig?.extra?.EXPO_PUBLIC_OLLAMA_ENDPOINT ?? (process.env as any).EXPO_PUBLIC_OLLAMA_ENDPOINT ?? 'http://localhost:11434';
    const ollamaModel = Constants.expoConfig?.extra?.EXPO_PUBLIC_OLLAMA_MODEL ?? (process.env as any).EXPO_PUBLIC_OLLAMA_MODEL ?? 'llama3.2';

    // Debug: Log what we got from environment
    console.log('[AI Config Debug] Provider:', aiProvider || 'NOT SET');
    console.log('[AI Config Debug] Gemini Key:', geminiApiKey ? `${geminiApiKey.substring(0, 10)}...` : 'NOT SET');
    console.log('[AI Config Debug] Groq Key:', groqApiKey ? `${groqApiKey.substring(0, 10)}...` : 'NOT SET');

    // Make sure fallback keys are available in process.env for AIContentProcessor
    if (geminiApiKey) {
      (process.env as any).EXPO_PUBLIC_GEMINI_API_KEY = geminiApiKey;
    }
    if (groqApiKey) {
      (process.env as any).EXPO_PUBLIC_GROQ_API_KEY = groqApiKey;
      (process.env as any).EXPO_PUBLIC_GROQ_MODEL = groqModel;
    }

    // Initialize AI processor based on provider
    if (aiProvider === 'ollama') {
      // Use Ollama for local AI (no API key needed!)
      console.log('[AI] initializeAIProcessor -> provider: ollama (local LLM)');
      initializeAIProcessor({
        provider: 'ollama',
        ollamaEndpoint: ollamaEndpoint,
        model: ollamaModel,
        // Fallback to Groq if Ollama fails
        fallbackOpenAIKey: groqApiKey,
      });
    } else if (aiProvider === 'huggingface') {
      // Use Hugging Face Inference API
      const hfApiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_HUGGINGFACE_API_KEY ?? (process.env as any).EXPO_PUBLIC_HUGGINGFACE_API_KEY ?? '';
      const hfModel = Constants.expoConfig?.extra?.EXPO_PUBLIC_HUGGINGFACE_MODEL ?? (process.env as any).EXPO_PUBLIC_HUGGINGFACE_MODEL ?? 'meta-llama/Meta-Llama-3-8B-Instruct';

      console.log('[AI] initializeAIProcessor -> provider: huggingface (with Gemini & Groq fallback)');
      initializeAIProcessor({
        provider: 'huggingface',
        apiKey: hfApiKey,
        model: hfModel,
      });
    } else if (aiProvider === 'gemini' && geminiApiKey) {
      // Use Gemini API for AI-powered exercise generation
      console.log('[AI] initializeAIProcessor -> provider: gemini (with Groq fallback)');
      initializeAIProcessor({
        provider: 'gemini',
        apiKey: geminiApiKey,
        model: 'gemini-2.0-flash',
      });
    } else if (geminiApiKey) {
      // Default to Gemini if key is provided (even without explicit provider)
      console.log('[AI] initializeAIProcessor -> provider: gemini (auto-detected, with Groq fallback)');
      initializeAIProcessor({
        provider: 'gemini',
        apiKey: geminiApiKey,
        model: 'gemini-2.0-flash',
      });
    } else if (groqApiKey) {
      // Use Groq API for AI-powered exercise generation (free!)
      console.log('[AI] initializeAIProcessor -> provider: groq');
      initializeAIProcessor({
        provider: 'groq',
        apiKey: groqApiKey,
        model: groqModel,
      });
    } else {
      // Fallback to local generation if no API key
      console.log('[AI] initializeAIProcessor -> provider: local (no API key)');
      initializeAIProcessor({
        provider: 'local',
      });
      console.warn('No AI provider configured - using basic local generation');
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
