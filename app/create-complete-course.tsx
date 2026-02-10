/**
 * Create Complete Course Page
 * Upload content and generate a comprehensive 5-phase course
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    I18nManager,
    Platform,
    Modal,
    TextInput,
    Animated,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as mammoth from 'mammoth';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { CustomButton } from '@/components/ui/CustomButton';
import CustomInput from '@/components/ui/CustomInput';
import { useAuthStore } from '@/stores/authStore';
import { useCompleteCourseStore } from '@/stores/completeCourseStore';

I18nManager.forceRTL(true);

// Helper function to extract text from PDF
const extractTextFromPDF = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    if (Platform.OS === 'web') {
        // @ts-ignore
        let pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;

        if (!pdfjsLib) {
            await new Promise<void>((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Failed to load PDF.js'));
                document.head.appendChild(script);
            });
        }

        // @ts-ignore
        const pdfjs = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            let pageText = '';
            let lastY = -1;

            for (const item of textContent.items) {
                const textItem = item as any;
                const currentY = textItem.transform ? textItem.transform[5] : 0;

                if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
                    pageText += '\n';
                } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
                    pageText += ' ';
                }

                pageText += textItem.str;
                lastY = currentY;
            }

            if (pageText.trim()) {
                fullText += pageText.trim() + '\n\n';
            }
        }

        return fullText.trim();
    }
    throw new Error('PDF extraction not supported on mobile');
};

// Helper function to extract text from Word documents using mammoth
const extractTextFromWord = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    try {
        console.log('[Word] Starting text extraction...');
        if (Platform.OS === 'web') {
            const result = await mammoth.extractRawText({ arrayBuffer });
            const text = result.value;

            console.log(`[Word] Extracted ${text.length} characters`);

            if (result.messages && result.messages.length > 0) {
                console.log('[Word] Extraction messages:', result.messages);
            }

            if (!text || text.trim().length < 50) {
                throw new Error('EMPTY_DOCUMENT');
            }

            return text.trim();
        }
        throw new Error('Word extraction not supported on mobile');
    } catch (error: any) {
        console.error('[Word] Extraction error:', error);
        if (error.message === 'EMPTY_DOCUMENT') {
            throw error;
        }
        throw new Error('WORD_EXTRACTION_FAILED');
    }
};

export default function CreateCompleteCourse() {
    const router = useRouter();
    const user = useAuthStore((state) => state.user);
    const {
        generateCompleteCourse,
        isGenerating,
        generationProgress,
        generationMessage,
        error,
        clearError,
    } = useCompleteCourseStore();

    const [title, setTitle] = useState('');
    const [subject, setSubject] = useState('');
    const [fileContent, setFileContent] = useState('');
    const [fileName, setFileName] = useState('');
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pastedText, setPastedText] = useState('');
    const [uploadProgress, setUploadProgress] = useState('');
    const [progressAnim] = useState(new Animated.Value(0));

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: generationProgress,
            duration: 500,
            useNativeDriver: false,
        }).start();
    }, [generationProgress]);

    const handlePickFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'text/plain',
                    'text/*',
                    'application/pdf',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/msword',
                ],
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets.length > 0) {
                const file = result.assets[0];
                setUploadProgress('קריאת קובץ...');

                const isPDF = file.mimeType?.includes('pdf') || file.name.endsWith('.pdf');
                const isWord = file.mimeType?.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx');
                let content = '';

                if (isPDF || isWord) {
                    if (Platform.OS === 'web') {
                        setUploadProgress(`מחלץ טקסט מ-${isPDF ? 'PDF' : 'Word'}...`);
                        let arrayBuffer: ArrayBuffer;
                        if (file.file) {
                            arrayBuffer = await file.file.arrayBuffer();
                        } else if (file.uri) {
                            const response = await fetch(file.uri);
                            arrayBuffer = await response.arrayBuffer();
                        } else {
                            throw new Error('לא ניתן לקרוא את הקובץ');
                        }

                        if (isPDF) {
                            content = await extractTextFromPDF(arrayBuffer);
                        } else {
                            content = await extractTextFromWord(arrayBuffer);
                        }
                    } else {
                        Alert.alert(
                            'קובץ לא נתמך',
                            'חילוץ קבצים מורכבים לא נתמך במובייל. אנא העתק והדבק את הטקסט.',
                            [{ text: 'הבנתי' }]
                        );
                        setUploadProgress('');
                        return;
                    }
                } else {
                    if (Platform.OS === 'web') {
                        if (file.file) {
                            content = await file.file.text();
                        } else if (file.uri) {
                            const response = await fetch(file.uri);
                            content = await response.text();
                        }
                    } else {
                        content = await FileSystem.readAsStringAsync(file.uri, {
                            encoding: FileSystem.EncodingType.UTF8,
                        });
                    }
                }

                if (!content || content.trim().length === 0) {
                    Alert.alert('קובץ ריק', 'הקובץ ריק או לא ניתן לקריאה.');
                    setUploadProgress('');
                    return;
                }

                setFileContent(content);
                setFileName(file.name);
                setUploadProgress('');
                Alert.alert('הצלחה', `"${file.name}" נטען (${content.length} תווים)`);
            }
        } catch (error) {
            console.error('Error picking file:', error);
            Alert.alert('שגיאה', 'אירעה שגיאה בעת בחירת הקובץ');
            setUploadProgress('');
        }
    };

    const handlePasteConfirm = () => {
        if (pastedText.trim()) {
            setFileContent(pastedText);
            setFileName(`text-${Date.now()}`);
            setShowPasteModal(false);
            setPastedText('');
            Alert.alert('הצלחה', 'הטקסט נטען בהצלחה');
        } else {
            Alert.alert('שגיאה', 'אנא הזן טקסט');
        }
    };

    const handleCreateCourse = async () => {
        if (!fileContent.trim()) {
            Alert.alert('שגיאה', 'אנא העלה או הדבק תוכן ללימוד');
            return;
        }

        clearError();
        const userId = user?.email || `guest-${Date.now()}`;
        const contentId = `content-${Date.now()}`;

        const finalTitle = title.trim() || `קורס מ-${fileName || 'תוכן חדש'}`;
        const finalSubject = subject.trim() || 'כללי';

        const course = await generateCompleteCourse({
            contentId,
            userId,
            title: finalTitle,
            content: fileContent,
            subject: finalSubject,
        });

        if (course) {
            Alert.alert(
                'הקורס נוצר! 🎉',
                `"${course.title}" מוכן עם ${course.totalExercises} תרגילים ב-5 שלבים.`,
                [
                    {
                        text: 'התחל ללמוד',
                        onPress: () => router.push({
                            pathname: '/complete-course' as any,
                            params: { courseId: course.id },
                        }),
                    },
                    { text: 'חזור', style: 'cancel' },
                ]
            );

            // Reset form
            setTitle('');
            setSubject('');
            setFileContent('');
            setFileName('');
        } else if (error) {
            Alert.alert('שגיאה', error);
        }
    };

    const SUBJECTS = [
        'מתמטיקה', 'פיזיקה', 'כימיה', 'ביולוגיה', 'ספרות',
        'היסטוריה', 'גיאוגרפיה', 'תכנות', 'אנגלית', 'אחר',
    ];

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                    <Ionicons name="arrow-forward" size={24} color={Colors.white} />
                </TouchableOpacity>
                <View style={styles.headerContent}>
                    <Text style={styles.headerTitle}>יצירת קורס מקיף</Text>
                    <Text style={styles.headerSubtitle}>5 שלבים לשליטה מלאה בחומר</Text>
                </View>
                <MaterialCommunityIcons name="school" size={28} color={Colors.white} />
            </View>

            {/* Generation Progress */}
            {isGenerating && (
                <View style={styles.generationOverlay}>
                    <View style={styles.generationCard}>
                        <ActivityIndicator size="large" color={Colors.purple} />
                        <Text style={styles.generationMessage}>{generationMessage}</Text>
                        <View style={styles.progressBarContainer}>
                            <Animated.View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        width: progressAnim.interpolate({
                                            inputRange: [0, 100],
                                            outputRange: ['0%', '100%'],
                                        })
                                    }
                                ]}
                            />
                        </View>
                        <Text style={styles.progressPercent}>{Math.round(generationProgress)}%</Text>
                    </View>
                </View>
            )}

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Info Card */}
                <View style={styles.infoCard}>
                    <MaterialCommunityIcons name="information-outline" size={24} color={Colors.purple} />
                    <Text style={styles.infoText}>
                        העלה חומר לימוד ונייצר לך קורס מלא עם 5 שלבים: היכרות, תרגול, העמקה, חזרה, ומבחן סיכום.{'\n'}
                        בסוף הקורס תדע את החומר ישר והפוך! 🎓
                    </Text>
                </View>

                {/* Title Input */}
                <View style={styles.section}>
                    <Text style={styles.label}>שם הקורס (אופציונלי)</Text>
                    <CustomInput
                        placeholder="לדוגמה: ביולוגיה - פרק 3"
                        handleTextChange={setTitle}
                        value={title}
                    />
                </View>

                {/* Subject Selection */}
                <View style={styles.section}>
                    <Text style={styles.label}>תחום (אופציונלי)</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.subjectScroll}
                    >
                        {SUBJECTS.map((sub) => (
                            <TouchableOpacity
                                key={sub}
                                style={[
                                    styles.subjectChip,
                                    subject === sub && styles.subjectChipActive,
                                ]}
                                onPress={() => setSubject(subject === sub ? '' : sub)}
                            >
                                <Text style={[
                                    styles.subjectChipText,
                                    subject === sub && styles.subjectChipTextActive,
                                ]}>
                                    {sub}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* File Upload */}
                <View style={styles.section}>
                    <Text style={styles.label}>תוכן הלימוד</Text>

                    {fileContent ? (
                        <View style={styles.uploadedFile}>
                            <View style={styles.fileInfo}>
                                <Ionicons name="document-text" size={24} color={Colors.purple} />
                                <View style={styles.fileDetails}>
                                    <Text style={styles.fileName}>{fileName}</Text>
                                    <Text style={styles.fileSize}>{fileContent.length} תווים</Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={styles.removeButton}
                                onPress={() => {
                                    setFileContent('');
                                    setFileName('');
                                }}
                            >
                                <Ionicons name="close-circle" size={24} color={Colors.error} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.uploadButtons}>
                            <TouchableOpacity style={styles.uploadButton} onPress={handlePickFile}>
                                <Ionicons name="cloud-upload" size={32} color={Colors.purple} />
                                <Text style={styles.uploadButtonText}>בחר קובץ</Text>
                                <Text style={styles.uploadButtonHint}>PDF, Word או TXT</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.uploadButton}
                                onPress={() => setShowPasteModal(true)}
                            >
                                <Ionicons name="clipboard" size={32} color={Colors.purple} />
                                <Text style={styles.uploadButtonText}>הדבק טקסט</Text>
                                <Text style={styles.uploadButtonHint}>העתק והדבק</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {uploadProgress && (
                        <View style={styles.uploadProgressContainer}>
                            <ActivityIndicator size="small" color={Colors.purple} />
                            <Text style={styles.uploadProgressText}>{uploadProgress}</Text>
                        </View>
                    )}
                </View>

                {/* Create Course Button */}
                {fileContent && !isGenerating && (
                    <View style={styles.createSection}>
                        <TouchableOpacity
                            style={styles.createButton}
                            onPress={handleCreateCourse}
                        >
                            <MaterialCommunityIcons name="rocket-launch" size={24} color={Colors.white} />
                            <Text style={styles.createButtonText}>צור קורס מקיף</Text>
                        </TouchableOpacity>

                        <Text style={styles.createHint}>
                            ייווצרו כ-50 שאלות ב-5 שלבים
                        </Text>
                    </View>
                )}

                {/* Course Structure Preview */}
                <View style={styles.previewSection}>
                    <Text style={styles.previewTitle}>מבנה הקורס:</Text>
                    {[
                        { icon: '📖', title: 'שלב 1: היכרות', desc: '5 שאלות קלות' },
                        { icon: '📝', title: 'שלב 2: תרגול בסיסי', desc: '10 שאלות בינוניות' },
                        { icon: '🧠', title: 'שלב 3: העמקה', desc: '10 שאלות מאתגרות' },
                        { icon: '🔄', title: 'שלב 4: חזרה חכמה', desc: '10 שאלות מעורבות' },
                        { icon: '🏆', title: 'שלב 5: מבחן סיכום', desc: '15 שאלות מסכמות' },
                    ].map((phase, index) => (
                        <View key={index} style={styles.previewPhase}>
                            <Text style={styles.previewIcon}>{phase.icon}</Text>
                            <View style={styles.previewPhaseContent}>
                                <Text style={styles.previewPhaseTitle}>{phase.title}</Text>
                                <Text style={styles.previewPhaseDesc}>{phase.desc}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>

            {/* Paste Modal */}
            <Modal
                visible={showPasteModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowPasteModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>הדבק טקסט</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="הדבק את התוכן כאן..."
                            multiline
                            numberOfLines={10}
                            value={pastedText}
                            onChangeText={setPastedText}
                            textAlignVertical="top"
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setShowPasteModal(false)}
                            >
                                <Text style={styles.modalButtonText}>ביטול</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonConfirm]}
                                onPress={handlePasteConfirm}
                            >
                                <Text style={[styles.modalButtonText, { color: Colors.white }]}>אישור</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundLight,
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
        marginHorizontal: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.white,
        textAlign: 'right',
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'right',
        marginTop: 2,
    },
    generationOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    generationCard: {
        backgroundColor: Colors.white,
        borderRadius: 20,
        padding: 32,
        alignItems: 'center',
        width: '85%',
        maxWidth: 350,
    },
    generationMessage: {
        fontSize: 16,
        color: Colors.textDark,
        marginTop: 16,
        textAlign: 'center',
        fontWeight: '500',
    },
    progressBarContainer: {
        width: '100%',
        height: 8,
        backgroundColor: Colors.lightGray,
        borderRadius: 4,
        marginTop: 20,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: Colors.purple,
        borderRadius: 4,
    },
    progressPercent: {
        fontSize: 14,
        color: Colors.gray,
        marginTop: 8,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    infoCard: {
        flexDirection: 'row',
        backgroundColor: Colors.backgroundOverlay,
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
    },
    infoText: {
        flex: 1,
        marginLeft: 12,
        fontSize: 14,
        color: Colors.textDark,
        lineHeight: 22,
        textAlign: 'right',
    },
    section: {
        marginBottom: 20,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textDark,
        marginBottom: 10,
        textAlign: 'right',
    },
    subjectScroll: {
        marginHorizontal: -4,
    },
    subjectChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: Colors.white,
        marginHorizontal: 4,
        borderWidth: 2,
        borderColor: Colors.border,
    },
    subjectChipActive: {
        backgroundColor: Colors.purple,
        borderColor: Colors.purple,
    },
    subjectChipText: {
        fontSize: 14,
        color: Colors.text,
        fontWeight: '500',
    },
    subjectChipTextActive: {
        color: Colors.white,
    },
    uploadButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    uploadButton: {
        flex: 1,
        backgroundColor: Colors.white,
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: Colors.border,
        borderStyle: 'dashed',
    },
    uploadButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textDark,
        marginTop: 8,
    },
    uploadButtonHint: {
        fontSize: 12,
        color: Colors.gray,
        marginTop: 4,
    },
    uploadedFile: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: Colors.white,
        borderRadius: 12,
        padding: 16,
        borderWidth: 2,
        borderColor: Colors.success,
    },
    fileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    fileDetails: {
        marginLeft: 12,
    },
    fileName: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textDark,
    },
    fileSize: {
        fontSize: 12,
        color: Colors.gray,
        marginTop: 2,
    },
    removeButton: {
        padding: 4,
    },
    uploadProgressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
        gap: 8,
    },
    uploadProgressText: {
        fontSize: 14,
        color: Colors.purple,
    },
    createSection: {
        alignItems: 'center',
        marginVertical: 20,
    },
    createButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.purple,
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 16,
        gap: 10,
        shadowColor: Colors.purple,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    createButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.white,
    },
    createHint: {
        fontSize: 13,
        color: Colors.gray,
        marginTop: 8,
    },
    previewSection: {
        backgroundColor: Colors.white,
        borderRadius: 16,
        padding: 20,
        marginTop: 10,
    },
    previewTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.textDark,
        marginBottom: 16,
        textAlign: 'right',
    },
    previewPhase: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: Colors.lightGray,
    },
    previewIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    previewPhaseContent: {
        flex: 1,
    },
    previewPhaseTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textDark,
        textAlign: 'right',
    },
    previewPhaseDesc: {
        fontSize: 12,
        color: Colors.gray,
        textAlign: 'right',
        marginTop: 2,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: Colors.white,
        borderRadius: 16,
        padding: 20,
        width: '100%',
        maxHeight: '80%',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.textDark,
        textAlign: 'center',
        marginBottom: 16,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        minHeight: 200,
        textAlign: 'right',
        backgroundColor: Colors.lightGray,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    modalButtonCancel: {
        backgroundColor: Colors.lightGray,
    },
    modalButtonConfirm: {
        backgroundColor: Colors.purple,
    },
    modalButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textDark,
    },
});
