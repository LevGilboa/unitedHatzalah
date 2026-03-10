// Dynamic Expo configuration
// This file replaces app.json to allow environment-based configuration

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Vercel automatically sets VERCEL=1 in its build environment.
// GitHub Pages does NOT set this, so we use it to distinguish deployments.
const IS_VERCEL = !!process.env.VERCEL;

export default {
    expo: {
        name: "Wizzy",
        slug: "wizzy",
        version: "1.0.0",
        orientation: "portrait",
        icon: "./assets/images/wizzy-icon.png",
        userInterfaceStyle: "automatic",
        newArchEnabled: true,
        ios: {
            supportsTablet: true,
            infoPlist: {
                NSCameraUsageDescription: "This app requires access to your camera.",
                NSPhotoLibraryUsageDescription: "This app requires access to your photo library."
            }
        },
        android: {
            adaptiveIcon: {
                foregroundImage: "./assets/images/wizzy-icon.png",
                backgroundColor: "#C4B5E0"
            },
            permissions: [
                "android.permission.CAMERA",
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.RECORD_AUDIO"
            ],
            package: "com.elevateHOA.health"
        },
        web: {
            bundler: "metro",
            output: "static",
            favicon: "./assets/images/wizzy-favicon.png"
        },
        plugins: [
            "expo-router",
            [
                "expo-splash-screen",
                {
                    image: "./assets/images/splash-icon.png",
                    imageWidth: 200,
                    resizeMode: "contain",
                    backgroundColor: "#ffffff"
                }
            ],
            [
                "expo-image-picker",
                {
                    photosPermission: "This app requires access to your photos.",
                    cameraPermission: "This app requires access to your camera."
                }
            ]
        ],
        experiments: {
            typedRoutes: true,
            // baseUrl is only needed for GitHub Pages (served under /unitedHatzalah).
            // On Vercel the app runs at root /, so no baseUrl is needed there.
            ...(IS_PRODUCTION && !IS_VERCEL && { baseUrl: "/unitedHatzalah" })
        },
        extra: {
            router: {
                // Expo Router needs 'origin' in production to construct absolute URLs correctly.
                // Without it: "TypeError: Failed to construct 'URL': Invalid URL" → blank screen.
                ...(IS_VERCEL && { origin: "https://united-hatzalah.vercel.app" }),
                asyncRoutes: false
            },
            eas: {
                projectId: "d10248c4-1c0b-4d84-9360-cbf0071b20be"
            },
            // ⚠️  AI API keys are NOT here — they live only in Vercel Environment Variables
            // and are accessed by /api/ai-chat.js (Vercel Serverless Function).
            // Only non-secret config mapping:
            EXPO_PUBLIC_AI_PROVIDER: process.env.AI_PROVIDER || process.env.EXPO_PUBLIC_AI_PROVIDER,
            EXPO_PUBLIC_GROQ_MODEL: process.env.GROQ_MODEL || process.env.EXPO_PUBLIC_GROQ_MODEL,
            EXPO_PUBLIC_HUGGINGFACE_MODEL: process.env.HUGGINGFACE_MODEL || process.env.EXPO_PUBLIC_HUGGINGFACE_MODEL,
            EXPO_PUBLIC_OLLAMA_ENDPOINT: process.env.OLLAMA_ENDPOINT || process.env.EXPO_PUBLIC_OLLAMA_ENDPOINT,
            EXPO_PUBLIC_OLLAMA_MODEL: process.env.OLLAMA_MODEL || process.env.EXPO_PUBLIC_OLLAMA_MODEL,
            EXPO_PUBLIC_PROXY_URL: process.env.PROXY_URL || process.env.EXPO_PUBLIC_PROXY_URL || "https://united-hatzalah.vercel.app",
        }
    }
};
