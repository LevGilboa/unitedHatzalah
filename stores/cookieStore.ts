/**
 * Cookie Store
 * Manages virtual currency (cookies) for gamification
 * Users earn cookies by completing exercises, phases, and courses
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CookieTransaction {
    id: string;
    amount: number;
    reason: string;
    timestamp: number;
    type: 'earn' | 'spend';
}

interface CookieStore {
    // State
    totalCookies: number;
    transactions: CookieTransaction[];
    dailyStreak: number;
    lastActivityDate: string; // YYYY-MM-DD format

    // Actions
    addCookies: (amount: number, reason: string) => void;
    spendCookies: (amount: number, reason: string) => boolean;
    checkDailyStreak: () => void;
    getCookieHistory: (limit?: number) => CookieTransaction[];
    getTodayEarnings: () => number;
}

export const useCookieStore = create<CookieStore>()(
    persist(
        (set, get) => ({
            // Initial state
            totalCookies: 0,
            transactions: [],
            dailyStreak: 0,
            lastActivityDate: '',

            // Add cookies (earn)
            addCookies: (amount: number, reason: string) => {
                // Disabled per user request
                return;
            },

            // Spend cookies
            spendCookies: (amount: number, reason: string) => {
                const { totalCookies } = get();

                if (totalCookies < amount) {
                    console.log(`❌ Not enough cookies. Have: ${totalCookies}, Need: ${amount}`);
                    return false;
                }

                const transaction: CookieTransaction = {
                    id: `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    amount,
                    reason,
                    timestamp: Date.now(),
                    type: 'spend',
                };

                set(state => ({
                    totalCookies: state.totalCookies - amount,
                    transactions: [transaction, ...state.transactions].slice(0, 100),
                }));

                console.log(`🍪 -${amount} cookies: ${reason}`);
                return true;
            },

            // Check and update daily streak
            checkDailyStreak: () => {
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                const { lastActivityDate, dailyStreak, addCookies } = get();

                if (lastActivityDate === today) {
                    // Already checked in today
                    return;
                }

                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];

                if (lastActivityDate === yesterdayStr) {
                    // Streak continues
                    const newStreak = dailyStreak + 1;
                    set({ dailyStreak: newStreak, lastActivityDate: today });

                    // Bonus cookies for streak
                    const streakBonus = Math.min(newStreak * 5, 50); // Max 50 bonus
                    addCookies(streakBonus, `רצף ${newStreak} ימים! 🔥`);
                } else {
                    // Streak broken or first time
                    set({ dailyStreak: 1, lastActivityDate: today });
                    addCookies(10, 'כניסה יומית ראשונה! 🎉');
                }
            },

            // Get transaction history
            getCookieHistory: (limit = 10) => {
                return get().transactions.slice(0, limit);
            },

            // Get today's earnings
            getTodayEarnings: () => {
                const today = new Date().toISOString().split('T')[0];
                const todayStart = new Date(today).getTime();

                return get().transactions
                    .filter(t => t.type === 'earn' && t.timestamp >= todayStart)
                    .reduce((sum, t) => sum + t.amount, 0);
            },
        }),
        {
            name: 'wizzy-cookies-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

// Cookie earning rates
export const COOKIE_REWARDS = {
    CORRECT_ANSWER: 2,
    WRONG_ANSWER: 1, // Participation reward
    COMPLETE_EXERCISE: 5,
    COMPLETE_PHASE_PASS: 20,
    COMPLETE_PHASE_PERFECT: 50, // 100% score
    COMPLETE_COURSE: 100,
    DAILY_LOGIN: 10,
    STREAK_BONUS: 5, // Per day in streak
    REGENERATE_QUESTIONS: -10, // Cost to regenerate
};
