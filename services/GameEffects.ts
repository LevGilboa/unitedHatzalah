/**
 * Game Effects Service
 * Handles sound effects, haptics, and animations for the learning game
 */

import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

// Sound cache to avoid reloading
const soundCache: { [key: string]: Audio.Sound | null } = {};

// Sound files - loaded locally for instant playback
const SOUND_FILES = {
    correct: require('@/assets/sounds/new-correct-sound.m4a'), // This is your new sound
    incorrect: require('@/assets/sounds/incorrect-answer.m4a'),
    //click: require('@/assets/sounds/select-option.m4a'),
    //victory: require('@/assets/sounds/victory.mp3'),
    // Make sure you have a 'level-up.mp3' file in your assets/sounds folder
    //levelUp: require('@/assets/sounds/level-up.mp3'),
    //heartLost: require('@/assets/sounds/incorrect-answer.m4a'), // Reuses incorrect sound
};

export type SoundType = keyof typeof SOUND_FILES | string;

class GameEffectsService {
    private initialized = false;
    private soundsEnabled = true;
    private hapticsEnabled = true;

    async initialize() {
        if (this.initialized) return;

        try {
            // Set audio mode for game sounds
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: false,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
            });

            // Pre-load all sounds into the cache for instant playback
            console.log('🎵 Pre-loading game sounds...');
            for (const key of Object.keys(SOUND_FILES)) {
                const type = key as SoundType;
                if (!soundCache[type]) {
                    try {
                        const { sound } = await Audio.Sound.createAsync(SOUND_FILES[type]);
                        soundCache[type] = sound;
                    } catch (e) {
                        console.log(`Sound '${type}' failed to load or is missing. Skipping.`);
                        soundCache[type] = null;
                    }
                }
            }

            this.initialized = true;
            console.log('🎮 GameEffects initialized');
        } catch (error) {
            console.error('Failed to initialize audio system:', error);
        }
    }

    /**
     * Play a sound effect
     */
    async playSound(type: SoundType, volume: number = 0.5) {
        if (!this.soundsEnabled) return;

        try {
            // Ensure sounds are loaded
            await this.initialize();

            const soundObject = soundCache[type];
            if (soundObject) {
                await soundObject.setVolumeAsync(volume);
                await soundObject.replayAsync(); // Replays from the beginning
            }
        } catch (error) {
            // Ignore playback errors
        }
    }

    /**
     * Trigger haptic feedback
     */
    async triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') {
        if (!this.hapticsEnabled) return;

        try {
            if (Platform.OS === 'web') {
                // Web vibration fallback
                if ('vibrate' in navigator) {
                    switch (type) {
                        case 'light':
                            navigator.vibrate(10);
                            break;
                        case 'medium':
                            navigator.vibrate(20);
                            break;
                        case 'heavy':
                            navigator.vibrate(40);
                            break;
                        case 'success':
                            navigator.vibrate([10, 50, 10]);
                            break;
                        case 'warning':
                            navigator.vibrate([20, 30, 20]);
                            break;
                        case 'error':
                            navigator.vibrate([50, 20, 50]);
                            break;
                    }
                }
                return;
            }

            // Native haptics
            switch (type) {
                case 'light':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    break;
                case 'medium':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    break;
                case 'heavy':
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    break;
                case 'success':
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    break;
                case 'warning':
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    break;
                case 'error':
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    break;
            }
        } catch (error) {
            console.log('Haptic feedback failed:', error);
        }
    }

    /**
     * Play effect for correct answer
     */
    async onCorrectAnswer() {
        await Promise.all([
            this.playSound('correct', 0.6),
            this.triggerHaptic('success'),
        ]);
    }

    /**
     * Play effect for incorrect answer
     */
    async onIncorrectAnswer() {
        await Promise.all([
            this.playSound('incorrect', 0.5),
            this.triggerHaptic('error'),
        ]);
    }

    /**
     * Play effect for button click/selection
     */
    async onSelect() {
        await Promise.all([
            this.playSound('click', 0.3),
            this.triggerHaptic('light'),
        ]);
    }

    /**
     * Play effect for victory/perfect score
     */
    async onVictory() {
        await Promise.all([
            this.playSound('victory', 0.7),
            this.triggerHaptic('success'),
        ]);
    }

    /**
     * Play effect for level up or heart earned
     */
    async onLevelUp() {
        await Promise.all([
            this.playSound('levelUp', 0.6),
            this.triggerHaptic('success'),
        ]);
    }

    /**
     * Play effect for losing a heart
     */
    async onHeartLost() {
        await Promise.all([
            this.playSound('heartLost', 0.5),
            this.triggerHaptic('warning'),
        ]);
    }

    /**
     * Enable/disable sounds
     */
    setSoundsEnabled(enabled: boolean) {
        this.soundsEnabled = enabled;
    }

    /**
     * Enable/disable haptics
     */
    setHapticsEnabled(enabled: boolean) {
        this.hapticsEnabled = enabled;
    }

    /**
     * Cleanup all sounds
     */
    async cleanup() {
        for (const key of Object.keys(soundCache)) {
            try {
                await soundCache[key]?.unloadAsync();
                soundCache[key] = null;
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }
}

// Singleton instance
export const gameEffects = new GameEffectsService();
