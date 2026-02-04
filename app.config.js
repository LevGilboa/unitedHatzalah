// Dynamic Expo configuration
// This file replaces app.json to allow environment-based configuration

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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
            // Only set baseUrl for production builds (GitHub Pages)
            ...(IS_PRODUCTION && { baseUrl: "/unitedHatzalah" })
        },
        extra: {
            router: {
                // Only set origin for production builds (GitHub Pages)
                // During development, this should be empty/undefined to use localhost
                ...(IS_PRODUCTION && { origin: "https://levgilboa.github.io" }),
                asyncRoutes: false
            },
            eas: {
                projectId: "d10248c4-1c0b-4d84-9360-cbf0071b20be"
            },
            // Pass environment variables through expo config
            EXPO_PUBLIC_GROQ_API_KEY: process.env.EXPO_PUBLIC_GROQ_API_KEY
        }
    }
};
