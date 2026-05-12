declare namespace NodeJS {
    interface ProcessEnv {
        EXPO_PUBLIC_HUGGINGFACE_API_KEY: string;
        EXPO_PUBLIC_AI_API_KEY: string;
        EXPO_PUBLIC_PROXY_URL: string;
        // Add other env vars here as needed
    }
}
