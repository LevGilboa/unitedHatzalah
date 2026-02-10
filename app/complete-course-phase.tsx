/**
 * Complete Course Phase View
 * Shows exercises for a specific phase in the course
 * Handles exercise navigation, scoring, and phase completion
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useCompleteCourseStore } from '@/stores/completeCourseStore';
import { CoursePhase, GeneratedExercise } from '@/types/ai-learning';
import ExerciseViewer from '@/components/Exercise/ExerciseViewer';
import ConfettiCelebration from '@/components/ConfettiCelebration';
import { gameEffects } from '@/services/GameEffects';

export default function CompleteCoursePhase() {
    const router = useRouter();
    const { courseId, phaseOrder } = useLocalSearchParams<{
        courseId: string;
        phaseOrder: string;
    }>();

    const {
        getCompleteCourse,
        updatePhaseScore,
        regeneratePhase,
        currentPhase,
        setCurrentPhase,
    } = useCompleteCourseStore();

    const [phase, setPhase] = useState<CoursePhase | null>(null);
    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, boolean>>({});
    const [showResults, setShowResults] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [autoAdvance, setAutoAdvance] = useState(true);
    const [answeredCurrent, setAnsweredCurrent] = useState(false);
    const [progressAnim] = useState(new Animated.Value(0));

    useEffect(() => {
        if (courseId && phaseOrder) {
            const course = getCompleteCourse(courseId);
            if (course) {
                const phaseNum = parseInt(phaseOrder);
                const loadedPhase = course.phases.find(p => p.order === phaseNum);
                setPhase(loadedPhase || null);
                setCurrentPhase(phaseNum);
            }
        }
    }, [courseId, phaseOrder]);

    useEffect(() => {
        // Animate progress bar
        if (phase) {
            const progress = (currentExerciseIndex / phase.exercises.length) * 100;
            Animated.timing(progressAnim, {
                toValue: progress,
                duration: 300,
                useNativeDriver: false,
            }).start();
        }
    }, [currentExerciseIndex, phase]);

    const handleAnswer = useCallback((exerciseId: string, isCorrect: boolean) => {
        setAnswers(prev => ({
            ...prev,
            [exerciseId]: isCorrect,
        }));
    }, []);

    const handleNext = useCallback(() => {
        if (!phase) return;

        setAnsweredCurrent(false);
        if (currentExerciseIndex < phase.exercises.length - 1) {
            setCurrentExerciseIndex(prev => prev + 1);
        } else {
            // Phase completed
            calculateResults();
        }
    }, [currentExerciseIndex, phase]);

    const calculateResults = () => {
        if (!phase || !courseId) return;

        const correctCount = Object.values(answers).filter(Boolean).length;
        const totalCount = phase.exercises.length;
        const score = Math.round((correctCount / totalCount) * 100);

        // Update phase score in store
        updatePhaseScore(courseId, phase.order, score);

        // Show confetti if passed
        if (score >= phase.requiredScore) {
            setShowConfetti(true);
            gameEffects.onVictory();
        } else {
            gameEffects.onIncorrectAnswer();
        }

        setShowResults(true);
    };

    const handleRetry = () => {
        setCurrentExerciseIndex(0);
        setAnswers({});
        setShowResults(false);
        setShowConfetti(false);
        setAnsweredCurrent(false);
    };

    const handleRegenerateQuestions = async () => {
        if (!courseId || !phase) return;

        setIsRegenerating(true);
        const success = await regeneratePhase(courseId, phase.order);
        setIsRegenerating(false);

        if (success) {
            // Reload the phase
            const course = getCompleteCourse(courseId);
            if (course) {
                const updatedPhase = course.phases.find(p => p.order === phase.order);
                setPhase(updatedPhase || null);
            }
            handleRetry();
            Alert.alert('הצלחה', 'נוצרו שאלות חדשות!');
        } else {
            Alert.alert('שגיאה', 'לא הצלחתי ליצור שאלות חדשות');
        }
    };

    const handleContinue = () => {
        router.back();
    };

    const getResultMessage = (score: number, requiredScore: number) => {
        if (score >= 90) return { title: 'מדהים! 🌟', subtitle: 'שליטה מוחלטת בחומר!' };
        if (score >= requiredScore) return { title: 'כל הכבוד! ✨', subtitle: 'עברת את השלב בהצלחה!' };
        if (score >= 50) return { title: 'כמעט! 💪', subtitle: 'נסה שוב, אתה קרוב!' };
        return { title: 'לא נורא 📚', subtitle: 'חזור על החומר ונסה שוב' };
    };

    if (!phase) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.purple} />
                <Text style={styles.loadingText}>טוען שלב...</Text>
            </View>
        );
    }

    const currentExercise = phase.exercises[currentExerciseIndex];
    const progress = ((currentExerciseIndex + 1) / phase.exercises.length) * 100;

    if (showResults) {
        const correctCount = Object.values(answers).filter(Boolean).length;
        const score = Math.round((correctCount / phase.exercises.length) * 100);
        const passed = score >= phase.requiredScore;
        const resultMessage = getResultMessage(score, phase.requiredScore);

        return (
            <View style={styles.resultsContainer}>
                <ConfettiCelebration
                    isActive={showConfetti}
                    duration={4000}
                    pieceCount={60}
                    onComplete={() => setShowConfetti(false)}
                />

                <View style={styles.resultsCard}>
                    <Text style={styles.resultsEmoji}>
                        {passed ? '🎉' : '📚'}
                    </Text>
                    <Text style={styles.resultsTitle}>{resultMessage.title}</Text>
                    <Text style={styles.resultsSubtitle}>{resultMessage.subtitle}</Text>

                    <View style={styles.scoreCircle}>
                        <Text style={[
                            styles.scoreText,
                            { color: passed ? Colors.success : Colors.error }
                        ]}>
                            {score}%
                        </Text>
                        <Text style={styles.scoreLabel}>הציון שלך</Text>
                    </View>

                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{correctCount}</Text>
                            <Text style={styles.statLabel}>תשובות נכונות</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{phase.exercises.length - correctCount}</Text>
                            <Text style={styles.statLabel}>טעויות</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{phase.requiredScore}%</Text>
                            <Text style={styles.statLabel}>ציון מעבר</Text>
                        </View>
                    </View>

                    <View style={styles.actionButtons}>
                        {!passed && (
                            <TouchableOpacity
                                style={[styles.actionButton, styles.retryButton]}
                                onPress={handleRetry}
                            >
                                <Ionicons name="refresh" size={20} color={Colors.white} />
                                <Text style={styles.actionButtonText}>נסה שוב</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={[styles.actionButton, styles.continueButton]}
                            onPress={handleContinue}
                        >
                            <Text style={styles.actionButtonText}>
                                {passed ? 'המשך לשלב הבא' : 'חזור לקורס'}
                            </Text>
                            <Ionicons name="arrow-forward" size={20} color={Colors.white} />
                        </TouchableOpacity>
                    </View>

                    {!passed && (
                        <TouchableOpacity
                            style={styles.regenerateButton}
                            onPress={handleRegenerateQuestions}
                            disabled={isRegenerating}
                        >
                            {isRegenerating ? (
                                <ActivityIndicator size="small" color={Colors.purple} />
                            ) : (
                                <>
                                    <Ionicons name="shuffle" size={18} color={Colors.purple} />
                                    <Text style={styles.regenerateText}>צור שאלות חדשות</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                    <Ionicons name="close" size={28} color={Colors.white} />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <Text style={styles.phaseTitle}>{phase.title}</Text>
                    <Text style={styles.exerciseCount}>
                        שאלה {currentExerciseIndex + 1} מתוך {phase.exercises.length}
                    </Text>
                </View>

                <TouchableOpacity
                    style={[styles.autoAdvanceToggle, autoAdvance && styles.autoAdvanceToggleActive]}
                    onPress={() => setAutoAdvance(!autoAdvance)}
                >
                    <Ionicons
                        name={autoAdvance ? 'play-forward' : 'pause'}
                        size={16}
                        color={autoAdvance ? Colors.white : 'rgba(255,255,255,0.8)'}
                    />
                    <Text style={styles.autoAdvanceText}>
                        {autoAdvance ? 'אוטו' : 'ידני'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
                <Animated.View
                    style={[
                        styles.progressBar,
                        {
                            width: progressAnim.interpolate({
                                inputRange: [0, 100],
                                outputRange: ['0%', '100%'],
                            })
                        }
                    ]}
                />
            </View>

            {/* Exercise */}
            <View style={styles.exerciseContainer}>
                <ExerciseViewer
                    exercise={currentExercise}
                    exerciseNumber={currentExerciseIndex + 1}
                    totalExercises={phase.exercises.length}
                    subject={phase.type}
                    onAnswer={(exerciseId, answer, correct) => {
                        handleAnswer(exerciseId, correct);
                        setAnsweredCurrent(true);
                        if (autoAdvance) {
                            // Auto proceed to next after a short delay
                            setTimeout(() => {
                                setAnsweredCurrent(false);
                                if (currentExerciseIndex < phase.exercises.length - 1) {
                                    setCurrentExerciseIndex(prev => prev + 1);
                                } else {
                                    calculateResults();
                                }
                            }, 1500);
                        }
                    }}
                    onNext={handleNext}
                />

                {/* Manual Next Button (when auto-advance is off) */}
                {!autoAdvance && answeredCurrent && (
                    <TouchableOpacity
                        style={styles.manualNextButton}
                        onPress={handleNext}
                    >
                        <Text style={styles.manualNextText}>
                            {currentExerciseIndex < phase.exercises.length - 1 ? 'לשאלה הבאה ➡️' : 'סיים שלב 🏁'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundLight,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.backgroundLight,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: Colors.gray,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        paddingTop: 50,
        backgroundColor: Colors.purple,
    },
    closeButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    autoAdvanceToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.15)',
        gap: 4,
    },
    autoAdvanceToggleActive: {
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    autoAdvanceText: {
        fontSize: 12,
        color: Colors.white,
        fontWeight: '600',
    },
    phaseTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.white,
    },
    exerciseCount: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    progressContainer: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    progressBar: {
        height: '100%',
        backgroundColor: Colors.success,
    },
    manualNextButton: {
        backgroundColor: Colors.purple,
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        marginTop: 12,
        shadowColor: Colors.purple,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    manualNextText: {
        fontSize: 17,
        fontWeight: 'bold',
        color: Colors.white,
    },
    exerciseContainer: {
        flex: 1,
        padding: 16,
    },
    resultsContainer: {
        flex: 1,
        backgroundColor: Colors.backgroundLight,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    resultsCard: {
        backgroundColor: Colors.white,
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: Colors.purple,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
        width: '100%',
        maxWidth: 400,
    },
    resultsEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    resultsTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: Colors.textDark,
        marginBottom: 8,
    },
    resultsSubtitle: {
        fontSize: 16,
        color: Colors.gray,
        marginBottom: 24,
        textAlign: 'center',
    },
    scoreCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: Colors.lightGray,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    scoreText: {
        fontSize: 36,
        fontWeight: 'bold',
    },
    scoreLabel: {
        fontSize: 12,
        color: Colors.gray,
        marginTop: 4,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    statItem: {
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    statValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.textDark,
    },
    statLabel: {
        fontSize: 11,
        color: Colors.gray,
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: Colors.lightGray,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        gap: 8,
    },
    retryButton: {
        backgroundColor: Colors.gray,
    },
    continueButton: {
        backgroundColor: Colors.purple,
    },
    actionButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.white,
    },
    regenerateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        gap: 8,
    },
    regenerateText: {
        fontSize: 14,
        color: Colors.purple,
        fontWeight: '500',
    },
});
