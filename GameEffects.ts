import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

/**
 * Manages game-related sound and haptic feedback.
 * This class pre-loads sounds to ensure they play instantly.
 */
class GameEffects {
    private sounds: { [key: string]: Audio.Sound | null } = {
        correct: null,
        incorrect: null,
        select: null,
        victory: null,
    };

    private isLoaded = false;

    constructor() {
        this.loadSounds();
    }

    /**
     * Loads all the necessary sound files into memory.
     */
    private async loadSounds() {
        try {
            // To change the sound for a correct answer,
            // 1. Add your new sound file (e.g., 'new-correct-sound.mp3') to the 'assets/sounds' folder.
            // 2. Change the require path below to point to your new file.
            const { sound: correctSound } = await Audio.Sound.createAsync(
                require('@/assets/sounds/new-correct-sound.mp3') // <-- שנה את שם הקובץ כאן
            );
            this.sounds.correct = correctSound;

            const { sound: incorrectSound } = await Audio.Sound.createAsync(
                require('@/assets/sounds/incorrect-answer.m4a')
            );
            this.sounds.incorrect = incorrectSound;

            const { sound: selectSound } = await Audio.Sound.createAsync(
                require('@/assets/sounds/select-option.m4a')
            );
            this.sounds.select = selectSound;

            const { sound: victorySound } = await Audio.Sound.createAsync(
                require('@/assets/sounds/victory.mp3')
            );
            this.sounds.victory = victorySound;

            this.isLoaded = true;
        } catch (error) {
            console.error('Failed to load game sounds:', error);
        }
    }

    private async playSound(soundName: keyof typeof this.sounds) {
        if (!this.isLoaded) return;
        try {
            const soundObject = this.sounds[soundName];
            if (soundObject) {
                await soundObject.replayAsync();
            }
        } catch (error) {
            console.error(`Failed to play sound: ${soundName}`, error);
        }
    }

    public onCorrectAnswer() {
        this.playSound('correct');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    public onIncorrectAnswer() {
        this.playSound('incorrect');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    public onSelect() {
        this.playSound('select');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    public onVictory() {
        this.playSound('victory');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
}

export const gameEffects = new GameEffects();