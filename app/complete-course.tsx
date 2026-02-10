/**
 * Complete Course View
 * Shows all 5 phases of a comprehensive course
 * Duolingo-style progression with locked/unlocked phases
 */

import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useCompleteCourseStore } from '@/stores/completeCourseStore';
import { CoursePhase, CompleteCourse } from '@/types/ai-learning';

export default function CompleteCourseView() {
    const router = useRouter();
    const { courseId } = useLocalSearchParams<{ courseId: string }>();

    const {
        getCompleteCourse,
        setCurrentCompleteCourse,
        setCurrentPhase,
        getCourseProgress,
    } = useCompleteCourseStore();

    const [course, setCourse] = useState<CompleteCourse | null>(null);
    const [fadeAnim] = useState(new Animated.Value(0));

    useEffect(() => {
        if (courseId) {
            const loadedCourse = getCompleteCourse(courseId);
            setCourse(loadedCourse);
            if (loadedCourse) {
                setCurrentCompleteCourse(courseId);
            }

            // Fade in animation
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();
        }
    }, [courseId]);

    const handlePhasePress = (phase: CoursePhase) => {
        if (phase.isLocked) {
            // Show locked message
            return;
        }

        setCurrentPhase(phase.order);
        router.push({
            pathname: '/complete-course-phase' as any,
            params: {
                courseId: course?.id,
                phaseOrder: phase.order,
            },
        });
    };

    const getPhaseIcon = (phase: CoursePhase) => {
        if (phase.isLocked) return 'lock-closed';
        if (phase.isCompleted) return 'checkmark-circle';
        if (phase.attempts > 0) return 'refresh-circle';
        return 'play-circle';
    };

    const getPhaseColor = (phase: CoursePhase) => {
        if (phase.isLocked) return Colors.gray;
        if (phase.isCompleted) return Colors.success;
        return Colors.purple;
    };

    const getPhaseStatusText = (phase: CoursePhase) => {
        if (phase.isLocked) return 'נעול';
        if (phase.isCompleted) return `הושלם - ${phase.bestScore}%`;
        if (phase.attempts > 0) return `ניסיון ${phase.attempts} - ${phase.bestScore || 0}%`;
        return 'התחל';
    };

    if (!course) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.purple} />
                <Text style={styles.loadingText}>טוען קורס...</Text>
            </View>
        );
    }

    const progress = getCourseProgress(course.id);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                    <Ionicons name="arrow-forward" size={24} color={Colors.white} />
                </TouchableOpacity>
                <View style={styles.headerContent}>
                    <Text style={styles.title}>{course.title}</Text>
                    <Text style={styles.subject}>{course.subject}</Text>
                </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressSection}>
                <View style={styles.progressInfo}>
                    <Text style={styles.progressLabel}>התקדמות כללית</Text>
                    <Text style={styles.progressValue}>{progress.percentage}%</Text>
                </View>
                <View style={styles.progressBar}>
                    <Animated.View
                        style={[
                            styles.progressFill,
                            { width: `${progress.percentage}%` }
                        ]}
                    />
                </View>
                <Text style={styles.progressDetail}>
                    {progress.completed} מתוך {progress.total} שלבים הושלמו
                </Text>
            </View>

            {/* Summary Card */}
            <View style={styles.summaryCard}>
                <MaterialCommunityIcons name="book-open-variant" size={24} color={Colors.purple} />
                <View style={styles.summaryContent}>
                    <Text style={styles.summaryTitle}>סיכום החומר</Text>
                    <Text style={styles.summaryText} numberOfLines={3}>
                        {course.summary}
                    </Text>
                </View>
            </View>

            {/* Phases */}
            <ScrollView
                style={styles.phasesContainer}
                contentContainerStyle={styles.phasesContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.sectionTitle}>שלבי הלמידה</Text>

                {course.phases.map((phase, index) => (
                    <Animated.View
                        key={phase.id}
                        style={[
                            styles.phaseCard,
                            {
                                opacity: fadeAnim,
                                transform: [{
                                    translateY: fadeAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [50 * (index + 1), 0],
                                    }),
                                }],
                            },
                        ]}
                    >
                        <TouchableOpacity
                            style={[
                                styles.phaseButton,
                                phase.isLocked && styles.phaseButtonLocked,
                                phase.isCompleted && styles.phaseButtonCompleted,
                            ]}
                            onPress={() => handlePhasePress(phase)}
                            disabled={phase.isLocked}
                        >
                            {/* Phase Number Badge */}
                            <View style={[
                                styles.phaseBadge,
                                { backgroundColor: getPhaseColor(phase) }
                            ]}>
                                <Text style={styles.phaseBadgeText}>{phase.order}</Text>
                            </View>

                            {/* Phase Content */}
                            <View style={styles.phaseContent}>
                                <Text style={[
                                    styles.phaseTitle,
                                    phase.isLocked && styles.phaseTitleLocked
                                ]}>
                                    {phase.title}
                                </Text>
                                <Text style={[
                                    styles.phaseDescription,
                                    phase.isLocked && styles.phaseDescriptionLocked
                                ]}>
                                    {phase.description}
                                </Text>
                                <View style={styles.phaseStats}>
                                    <View style={styles.phaseStat}>
                                        <Ionicons name="help-circle-outline" size={16} color={Colors.gray} />
                                        <Text style={styles.phaseStatText}>{phase.exercises.length} שאלות</Text>
                                    </View>
                                    <View style={styles.phaseStat}>
                                        <Ionicons name="time-outline" size={16} color={Colors.gray} />
                                        <Text style={styles.phaseStatText}>~{phase.estimatedTime} דק'</Text>
                                    </View>
                                    <View style={styles.phaseStat}>
                                        <Ionicons name="trophy-outline" size={16} color={Colors.gray} />
                                        <Text style={styles.phaseStatText}>נדרש: {phase.requiredScore}%</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Status Icon */}
                            <View style={styles.phaseStatus}>
                                <Ionicons
                                    name={getPhaseIcon(phase) as any}
                                    size={32}
                                    color={getPhaseColor(phase)}
                                />
                                <Text style={[
                                    styles.phaseStatusText,
                                    { color: getPhaseColor(phase) }
                                ]}>
                                    {getPhaseStatusText(phase)}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {/* Connector Line (except for last phase) */}
                        {index < course.phases.length - 1 && (
                            <View style={[
                                styles.connector,
                                course.phases[index + 1].isLocked && styles.connectorLocked,
                            ]} />
                        )}
                    </Animated.View>
                ))}

                {/* Mastery Badge */}
                {course.status === 'completed' && (
                    <View style={styles.masteryBadge}>
                        <MaterialCommunityIcons name="medal" size={48} color={Colors.warning} />
                        <Text style={styles.masteryTitle}>מזל טוב! 🎉</Text>
                        <Text style={styles.masteryText}>
                            סיימת את הקורס ברמת שליטה של {course.masteryLevel}%
                        </Text>
                    </View>
                )}
            </ScrollView>
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
        padding: 16,
        paddingTop: 50,
        backgroundColor: Colors.purple,
    },
    headerContent: {
        flex: 1,
        marginLeft: 16,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: Colors.white,
        textAlign: 'right',
    },
    subject: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'right',
        marginTop: 4,
    },
    progressSection: {
        padding: 20,
        backgroundColor: Colors.white,
        margin: 16,
        borderRadius: 16,
        shadowColor: Colors.purple,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    progressInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textDark,
    },
    progressValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.purple,
    },
    progressBar: {
        height: 12,
        backgroundColor: Colors.lightGray,
        borderRadius: 6,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.purple,
        borderRadius: 6,
    },
    progressDetail: {
        fontSize: 12,
        color: Colors.gray,
        textAlign: 'center',
        marginTop: 8,
    },
    summaryCard: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: Colors.white,
        marginHorizontal: 16,
        borderRadius: 12,
        shadowColor: Colors.purple,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    summaryContent: {
        flex: 1,
        marginLeft: 12,
    },
    summaryTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textDark,
        marginBottom: 4,
    },
    summaryText: {
        fontSize: 13,
        color: Colors.gray,
        lineHeight: 20,
        textAlign: 'right',
    },
    phasesContainer: {
        flex: 1,
    },
    phasesContent: {
        padding: 16,
        paddingBottom: 32,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.textDark,
        marginBottom: 16,
        textAlign: 'right',
    },
    phaseCard: {
        marginBottom: 8,
    },
    phaseButton: {
        flexDirection: 'row',
        backgroundColor: Colors.white,
        borderRadius: 16,
        padding: 16,
        shadowColor: Colors.purple,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    phaseButtonLocked: {
        backgroundColor: Colors.lightGray,
        opacity: 0.7,
    },
    phaseButtonCompleted: {
        borderColor: Colors.success,
    },
    phaseBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    phaseBadgeText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.white,
    },
    phaseContent: {
        flex: 1,
    },
    phaseTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.textDark,
        textAlign: 'right',
    },
    phaseTitleLocked: {
        color: Colors.gray,
    },
    phaseDescription: {
        fontSize: 13,
        color: Colors.gray,
        marginTop: 4,
        textAlign: 'right',
    },
    phaseDescriptionLocked: {
        color: Colors.gray,
    },
    phaseStats: {
        flexDirection: 'row',
        marginTop: 8,
        gap: 12,
    },
    phaseStat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    phaseStatText: {
        fontSize: 12,
        color: Colors.gray,
    },
    phaseStatus: {
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 12,
    },
    phaseStatusText: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 4,
    },
    connector: {
        width: 3,
        height: 24,
        backgroundColor: Colors.purple,
        alignSelf: 'center',
        marginVertical: -4,
        borderRadius: 2,
    },
    connectorLocked: {
        backgroundColor: Colors.lightGray,
    },
    masteryBadge: {
        alignItems: 'center',
        padding: 24,
        backgroundColor: Colors.white,
        borderRadius: 16,
        marginTop: 16,
        shadowColor: Colors.warning,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 6,
    },
    masteryTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.textDark,
        marginTop: 8,
    },
    masteryText: {
        fontSize: 16,
        color: Colors.gray,
        textAlign: 'center',
        marginTop: 4,
    },
});
