/**
 * Complete Course View
 * Shows all 5 phases of a comprehensive course
 * Duolingo-style progression with locked/unlocked phases
 */

import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useCompleteCourseStore } from '@/stores/completeCourseStore';
import { CoursePhase, CompleteCourse } from '@/types/ai-learning';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
}

// ─── AI Chat Helper ───────────────────────────────────────────────────────────

async function askAI(
    question: string,
    courseContent: string,
    courseSummary: string,
    chatHistory: ChatMessage[]
): Promise<string> {
    const systemPrompt = `אתה עוזר לימוד חכם המסייע לתלמיד להבין חומר לימוד.
ענה על שאלות התלמיד בעברית בצורה ברורה, מפורטת ומועילה.
התבסס על תוכן הקורס הבא:

סיכום הקורס:
${courseSummary}

תוכן הקורס (חלקי):
${courseContent.slice(0, 6000)}

כללים:
- ענה תמיד בעברית
- הסבר בצורה ברורה ומובנת
- אם השאלה לא קשורה לחומר, ציין זאת בנימוס
- השתמש בדוגמאות כשרלוונטי`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.slice(-6).map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: question },
    ];

    // Try Gemini first
    const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (geminiKey) {
        try {
            const geminiMessages = messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: geminiMessages,
                        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
                    }),
                }
            );
            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
            }
        } catch (e) {
            console.error('Gemini Q&A error:', e);
        }
    }

    // Fallback: Groq
    const groqKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
    const groqModel = process.env.EXPO_PUBLIC_GROQ_MODEL || 'llama-3.1-70b-versatile';
    if (groqKey) {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey}`,
                },
                body: JSON.stringify({
                    model: groqModel,
                    messages,
                    temperature: 0.7,
                    max_tokens: 1024,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                const text = data.choices?.[0]?.message?.content;
                if (text) return text;
            }
        } catch (e) {
            console.error('Groq Q&A error:', e);
        }
    }

    // Fallback: Ollama
    const ollamaEndpoint = process.env.EXPO_PUBLIC_OLLAMA_ENDPOINT;
    const ollamaModel = process.env.EXPO_PUBLIC_OLLAMA_MODEL || 'mistral';
    if (ollamaEndpoint) {
        try {
            const baseUrl = ollamaEndpoint.replace(/\/$/, '');
            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': '69420',
                },
                body: JSON.stringify({
                    model: ollamaModel,
                    messages,
                    temperature: 0.7,
                    max_tokens: 1024,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                const text = data.choices?.[0]?.message?.content;
                if (text) return text;
            }
        } catch (e) {
            console.error('Ollama Q&A error:', e);
        }
    }

    return 'מצטער, לא הצלחתי לקבל תשובה כרגע. אנא בדוק את חיבור האינטרנט ונסה שנית.';
}

// ─── Main Component ───────────────────────────────────────────────────────────

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

    // Summary modal state
    const [summaryModalVisible, setSummaryModalVisible] = useState(false);

    // Chat / Q&A agent state
    const [chatModalVisible, setChatModalVisible] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const flatListRef = useRef<FlatList>(null);

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

    // ── Chat handlers ──

    const handleOpenChat = () => {
        if (chatMessages.length === 0) {
            // Welcome message
            setChatMessages([
                {
                    id: 'welcome',
                    role: 'assistant',
                    text: `שלום! אני העוזר הלימודי שלך לקורס "${course?.title}".\nאשמח לענות על כל שאלה שיש לך על החומר. מה תרצה לדעת? 😊`,
                    timestamp: Date.now(),
                },
            ]);
        }
        setChatModalVisible(true);
    };

    const handleSendMessage = async () => {
        const question = chatInput.trim();
        if (!question || isChatLoading || !course) return;

        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: 'user',
            text: question,
            timestamp: Date.now(),
        };

        setChatMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setIsChatLoading(true);

        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        try {
            const answer = await askAI(
                question,
                course.originalContent || '',
                course.summary || '',
                [...chatMessages, userMsg]
            );

            const assistantMsg: ChatMessage = {
                id: `a-${Date.now()}`,
                role: 'assistant',
                text: answer,
                timestamp: Date.now(),
            };

            setChatMessages(prev => [...prev, assistantMsg]);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        } catch (e) {
            console.error('Chat error:', e);
        } finally {
            setIsChatLoading(false);
        }
    };

    // ── Render ──

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
                    {/* Read More Button */}
                    <TouchableOpacity
                        style={styles.readMoreButton}
                        onPress={() => setSummaryModalVisible(true)}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.readMoreText}>קרא עוד</Text>
                        <Ionicons name="chevron-down" size={14} color={Colors.purple} />
                    </TouchableOpacity>
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

            {/* Floating AI Chat Button */}
            <TouchableOpacity
                style={styles.chatFab}
                onPress={handleOpenChat}
                activeOpacity={0.85}
            >
                <MaterialCommunityIcons name="robot-excited" size={26} color={Colors.white} />
                <Text style={styles.chatFabText}>שאל את הAI</Text>
            </TouchableOpacity>

            {/* ── Summary Modal ── */}
            <Modal
                visible={summaryModalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => setSummaryModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        {/* Modal Header */}
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>סיכום הקורס המלא</Text>
                            <TouchableOpacity
                                style={styles.modalCloseBtn}
                                onPress={() => setSummaryModalVisible(false)}
                            >
                                <Ionicons name="close" size={22} color={Colors.textDark} />
                            </TouchableOpacity>
                        </View>

                        {/* Key Topics */}
                        {course.keyTopics && course.keyTopics.length > 0 && (
                            <View style={styles.keyTopicsContainer}>
                                <Text style={styles.keyTopicsLabel}>נושאים מרכזיים:</Text>
                                <View style={styles.keyTopicsRow}>
                                    {course.keyTopics.slice(0, 8).map((topic, i) => (
                                        <View key={i} style={styles.topicChip}>
                                            <Text style={styles.topicChipText}>{topic}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Scrollable Summary */}
                        <ScrollView
                            style={styles.modalScrollView}
                            showsVerticalScrollIndicator={true}
                            contentContainerStyle={{ paddingBottom: 16 }}
                        >
                            <Text style={styles.modalSummaryText}>{course.summary}</Text>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Chat / Q&A Agent Modal ── */}
            <Modal
                visible={chatModalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => setChatModalVisible(false)}
            >
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
                >
                    <View style={styles.chatModalOverlay}>
                        <View style={styles.chatModalContainer}>
                            {/* Chat Header */}
                            <View style={styles.chatHeader}>
                                <View style={styles.chatHeaderLeft}>
                                    <View style={styles.chatAvatarSmall}>
                                        <MaterialCommunityIcons name="robot-excited" size={20} color={Colors.white} />
                                    </View>
                                    <View>
                                        <Text style={styles.chatHeaderTitle}>עוזר לימוד AI</Text>
                                        <Text style={styles.chatHeaderSub}>{course.title}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={styles.modalCloseBtn}
                                    onPress={() => setChatModalVisible(false)}
                                >
                                    <Ionicons name="close" size={22} color={Colors.textDark} />
                                </TouchableOpacity>
                            </View>

                            {/* Messages */}
                            <FlatList
                                ref={flatListRef}
                                data={chatMessages}
                                keyExtractor={item => item.id}
                                style={styles.chatMessagesList}
                                contentContainerStyle={{ padding: 12 }}
                                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                                renderItem={({ item }) => (
                                    <View style={[
                                        styles.messageBubbleWrapper,
                                        item.role === 'user' ? styles.userBubbleWrapper : styles.assistantBubbleWrapper,
                                    ]}>
                                        {item.role === 'assistant' && (
                                            <View style={styles.chatAvatarTiny}>
                                                <MaterialCommunityIcons name="robot-excited" size={14} color={Colors.white} />
                                            </View>
                                        )}
                                        <View style={[
                                            styles.messageBubble,
                                            item.role === 'user' ? styles.userBubble : styles.assistantBubble,
                                        ]}>
                                            <Text style={[
                                                styles.messageText,
                                                item.role === 'user' ? styles.userMessageText : styles.assistantMessageText,
                                            ]}>
                                                {item.text}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                                ListFooterComponent={
                                    isChatLoading ? (
                                        <View style={[styles.messageBubbleWrapper, styles.assistantBubbleWrapper]}>
                                            <View style={styles.chatAvatarTiny}>
                                                <MaterialCommunityIcons name="robot-excited" size={14} color={Colors.white} />
                                            </View>
                                            <View style={[styles.messageBubble, styles.assistantBubble, styles.typingBubble]}>
                                                <ActivityIndicator size="small" color={Colors.purple} />
                                                <Text style={styles.typingText}>חושב...</Text>
                                            </View>
                                        </View>
                                    ) : null
                                }
                            />

                            {/* Input Area */}
                            <View style={styles.chatInputRow}>
                                <TextInput
                                    style={styles.chatInput}
                                    placeholder="שאל שאלה על החומר..."
                                    placeholderTextColor={Colors.gray}
                                    value={chatInput}
                                    onChangeText={setChatInput}
                                    multiline
                                    maxLength={500}
                                    textAlign="right"
                                    onSubmitEditing={handleSendMessage}
                                    returnKeyType="send"
                                    editable={!isChatLoading}
                                />
                                <TouchableOpacity
                                    style={[
                                        styles.sendButton,
                                        (!chatInput.trim() || isChatLoading) && styles.sendButtonDisabled,
                                    ]}
                                    onPress={handleSendMessage}
                                    disabled={!chatInput.trim() || isChatLoading}
                                >
                                    <Ionicons name="send" size={20} color={Colors.white} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
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

    // ── Summary Card ──
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
    readMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-end',
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 5,
        backgroundColor: Colors.backgroundOverlay,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.purple,
        gap: 4,
    },
    readMoreText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.purple,
    },

    // ── Phases ──
    phasesContainer: {
        flex: 1,
    },
    phasesContent: {
        padding: 16,
        paddingBottom: 100, // extra space for FAB
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

    // ── Floating Action Button ──
    chatFab: {
        position: 'absolute',
        bottom: 24,
        left: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.purple,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 32,
        shadowColor: Colors.purple,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
        gap: 8,
    },
    chatFabText: {
        color: Colors.white,
        fontWeight: '700',
        fontSize: 15,
    },

    // ── Shared Modal Components ──
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalContainer: {
        backgroundColor: Colors.white,
        borderRadius: 20,
        width: '100%',
        maxHeight: '80%',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 18,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: Colors.purple,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: 'bold',
        color: Colors.white,
        textAlign: 'right',
    },
    modalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalScrollView: {
        padding: 18,
    },
    modalSummaryText: {
        fontSize: 15,
        color: Colors.textDark,
        lineHeight: 26,
        textAlign: 'right',
    },

    // ── Key Topics ──
    keyTopicsContainer: {
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 8,
    },
    keyTopicsLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.gray,
        textAlign: 'right',
        marginBottom: 8,
    },
    keyTopicsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        justifyContent: 'flex-end',
    },
    topicChip: {
        backgroundColor: Colors.backgroundOverlay,
        borderRadius: 16,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: Colors.purple,
    },
    topicChipText: {
        fontSize: 12,
        color: Colors.purple,
        fontWeight: '500',
    },

    // ── Chat Modal ──
    chatModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    chatModalContainer: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '85%',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 20,
    },
    chatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        paddingTop: 18,
        backgroundColor: Colors.purple,
    },
    chatHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    chatAvatarSmall: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    chatHeaderTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.white,
    },
    chatHeaderSub: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.75)',
        maxWidth: 200,
    },
    chatMessagesList: {
        flex: 1,
        backgroundColor: Colors.backgroundLight,
    },
    messageBubbleWrapper: {
        flexDirection: 'row',
        marginVertical: 4,
        alignItems: 'flex-end',
    },
    userBubbleWrapper: {
        justifyContent: 'flex-end',
    },
    assistantBubbleWrapper: {
        justifyContent: 'flex-start',
        gap: 6,
    },
    chatAvatarTiny: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: Colors.purple,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 2,
    },
    messageBubble: {
        maxWidth: '75%',
        borderRadius: 16,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 1,
    },
    userBubble: {
        backgroundColor: Colors.purple,
        borderBottomRightRadius: 4,
    },
    assistantBubble: {
        backgroundColor: Colors.white,
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    typingBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
    },
    typingText: {
        fontSize: 13,
        color: Colors.gray,
        fontStyle: 'italic',
    },
    messageText: {
        fontSize: 14,
        lineHeight: 22,
    },
    userMessageText: {
        color: Colors.white,
        textAlign: 'right',
    },
    assistantMessageText: {
        color: Colors.textDark,
        textAlign: 'right',
    },
    chatInputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        padding: 12,
        backgroundColor: Colors.white,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        gap: 10,
    },
    chatInput: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
        backgroundColor: Colors.lightGray,
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 14,
        color: Colors.textDark,
        textAlignVertical: 'center',
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.purple,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.purple,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
        elevation: 5,
    },
    sendButtonDisabled: {
        backgroundColor: Colors.lightGray,
        shadowOpacity: 0,
        elevation: 0,
    },
});
