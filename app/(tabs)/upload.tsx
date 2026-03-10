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
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as mammoth from 'mammoth';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { CustomButton } from '@/components/ui/CustomButton';
import CustomInput from '@/components/ui/CustomInput';
import { useAuthStore } from '@/stores/authStore';
import { useContentAndStudyStore } from '@/stores/contentAndStudyStore';
import { getAIProcessor } from '@/services/AIContentProcessor';
import { isAdmin } from '@/constants/AdminConfig';

// Helper function to check if extracted text looks like garbage (mostly numbers/gibberish)
const isGarbageText = (text: string): boolean => {
  if (!text || text.length < 50) return false;

  // Count different character types
  const digits = (text.match(/\d/g) || []).length;
  const letters = (text.match(/[a-zA-Zא-ת]/g) || []).length;
  const total = text.length;

  // Check for specific repeating number patterns (like "11272014" appearing many times)
  const numberMatches = text.match(/\d{6,}/g) || [];
  if (numberMatches.length > 5) {
    // Count how many times each number appears
    const numberCounts: Record<string, number> = {};
    for (const num of numberMatches) {
      numberCounts[num] = (numberCounts[num] || 0) + 1;
    }
    const maxNumRepeat = Math.max(...Object.values(numberCounts), 0);
    if (maxNumRepeat >= 5) {
      console.log(`[PDF] Number "${Object.entries(numberCounts).find(([_, v]) => v === maxNumRepeat)?.[0]}" repeats ${maxNumRepeat} times - likely garbage`);
      return true;
    }
  }

  // Check for long sequences of numbers (like "11272014 15 11272014 16")
  const longNumberSequences = text.match(/(\d{5,}\s*){3,}/g);
  if (longNumberSequences && longNumberSequences.length > 0) {
    console.log('[PDF] Detected long number sequences - likely garbage');
    return true;
  }

  // If more than 30% digits and less than 40% letters, it's probably garbage
  const digitRatio = digits / total;
  const letterRatio = letters / total;

  console.log(`[PDF] Text analysis: ${Math.round(digitRatio * 100)}% digits, ${Math.round(letterRatio * 100)}% letters`);

  if (digitRatio > 0.3 && letterRatio < 0.4) {
    console.log('[PDF] High digit ratio, low letter ratio - likely garbage');
    return true;
  }

  // Check for repeating patterns (like "11272014" repeating many times)
  const words = text.split(/\s+/);
  const wordCounts: Record<string, number> = {};
  for (const word of words) {
    if (word.length > 3) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  // If any single "word" repeats more than 10% of all words (and at least 5 times), suspicious
  const maxRepeat = Math.max(...Object.values(wordCounts), 0);
  if (maxRepeat > words.length * 0.1 && maxRepeat >= 5) {
    const repeatingWord = Object.entries(wordCounts).find(([_, v]) => v === maxRepeat)?.[0];
    console.log(`[PDF] Word "${repeatingWord}" repeating ${maxRepeat} times - likely garbage`);
    return true;
  }

  return false;
};

// Helper function to extract text from PDF locally
const extractTextFromPDFLocal = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  try {
    if (Platform.OS === 'web') {
      // @ts-ignore - pdfjsLib loaded from CDN
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
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n\n';
      }
      return fullText.trim();
    }
    throw new Error('PDF extraction not supported on mobile');
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw error;
  }
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

I18nManager.forceRTL(true);

interface UploadState {
  title: string;
  description: string;
  subject: string;
  fileContent: string;
  fileName: string;
  fileType: 'pdf' | 'text' | 'document' | 'image';
}

export default function UploadContent() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { uploadContent, updateContentStatus } = useContentAndStudyStore();
  const [state, setState] = useState<UploadState>({
    title: '',
    description: '',
    subject: '',
    fileContent: '',
    fileName: '',
    fileType: 'text',
  });
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Debug: Check if user is authenticated
  useEffect(() => {
    console.log('Upload page loaded. User:', user ? user.email : 'Not logged in');
    console.log('Is admin:', isAdmin(user?.email), 'Email:', user?.email);
    if (!user) {
      console.warn('User not authenticated - upload will not work');
    }
  }, [user]);

  const handlePickFile = async () => {
    let isPDF = false;
    let isWord = false;
    try {
      console.log('Starting file picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/plain',
          'text/*',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword'
        ],
        copyToCacheDirectory: true,
      });
      console.log('File picker result:', result);

      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0];
        setUploadProgress('קריאת קובץ...');

        isPDF = file.mimeType?.includes('pdf') || file.name.endsWith('.pdf');
        isWord = file.mimeType?.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx');

        let fileContentResult = '';

        try {
          if (isPDF || isWord) {
            setUploadProgress(`מחלץ טקסט מ-${isPDF ? 'PDF' : 'Word'}...`);
            let arrayBuffer: ArrayBuffer;
            if (Platform.OS === 'web') {
              if (file.file) {
                arrayBuffer = await file.file.arrayBuffer();
              } else if (file.uri) {
                const response = await fetch(file.uri);
                arrayBuffer = await response.arrayBuffer();
              } else {
                throw new Error('לא ניתן לקרוא את הקובץ');
              }

              if (isPDF) {
                fileContentResult = await extractTextFromPDFLocal(arrayBuffer);
              } else {
                fileContentResult = await extractTextFromWord(arrayBuffer);
              }
              console.log(`${isPDF ? 'PDF' : 'DOCX'} text extracted, length:`, fileContentResult.length);
            } else {
              Alert.alert(
                'קובץ לא נתמך',
                'חילוץ קבצים מורכבים לא נתמך במובייל. אנא העתק והדבק את הטקסט באופן ידני.',
                [{ text: 'הבנתי' }]
              );
              setUploadProgress('');
              return;
            }
          } else {
            // Handle plain text files
            console.log('Reading text file, Platform:', Platform.OS);
            if (Platform.OS === 'web') {
              if (file.file) {
                fileContentResult = await file.file.text();
              } else if (file.uri) {
                const response = await fetch(file.uri);
                fileContentResult = await response.text();
              } else {
                throw new Error('לא ניתן לקרוא את הקובץ בדפדפן זה');
              }
            } else {
              fileContentResult = await FileSystem.readAsStringAsync(
                file.uri,
                { encoding: FileSystem.EncodingType.UTF8 }
              );
            }
          }
        } catch (error: any) {
          console.error('File reading error:', error);

          const errorMessage = error.message || '';
          const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('429');
          const isScannedPDF = errorMessage === 'SCANNED_PDF';
          const isEmptyWord = errorMessage === 'EMPTY_DOCUMENT';

          if (isScannedPDF) {
            Alert.alert(
              '📷 PDF סרוק',
              'נראה שה-PDF מכיל תמונות ולא טקסט (PDF סרוק).\n\nמה לעשות:\n1. פתח את ה-PDF במחשב\n2. סמן וגרר את הטקסט (Ctrl+A)\n3. העתק (Ctrl+C)\n4. לחץ "הדבק טקסט" כאן והדבק (Ctrl+V)',
              [{ text: 'הבנתי' }]
            );
          } else if (isEmptyWord) {
            Alert.alert(
              '📄 מסמך ריק',
              'נראה שמסמך ה-Word ריק או מכיל רק תמונות.\n\nאנא העתק את הטקסט ידנית והדבק דרך כפתור "הדבק טקסט".',
              [{ text: 'הבנתי' }]
            );
          } else if (isQuotaError) {
            Alert.alert(
              'מכסת API נגמרה',
              'המערכת הגיעה למגבלת הבקשות. אנא המתן דקה ונסה שוב.',
              [{ text: 'הבנתי' }]
            );
          } else {
            Alert.alert(
              'שגיאה בקריאת קובץ',
              isPDF
                ? 'לא הצלחנו לחלץ טקסט מה-PDF. אנא נסה להעתיק את הטקסט ידנית.'
                : isWord
                  ? 'לא הצלחנו לחלץ טקסט מה-Word. אנא נסה להעתיק את הטקסט ידנית.'
                  : 'לא הצלחנו לקרוא את הקובץ. אנא נסה להעתיק את הטקסט ידנית.',
              [{ text: 'הבנתי' }]
            );
          }
          setUploadProgress('');
          return;
        }

        if (!fileContentResult || fileContentResult.trim().length === 0) {
          Alert.alert(
            'קובץ ריק',
            'הקובץ שבחרת ריק או לא ניתן לקריאה.',
            [{ text: 'הבנתי' }]
          );
          setUploadProgress('');
          return;
        }

        console.log('File loaded successfully:', file.name, 'Content length:', fileContentResult.length);

        setState((prev) => ({
          ...prev,
          fileContent: fileContentResult,
          fileName: file.name,
          fileType: isPDF ? 'pdf' : isWord ? 'document' : 'text',
        }));

        setUploadProgress('');
        Alert.alert('הצלחה', `הקובץ "${file.name}" נטען בהצלחה`);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      const errorMsg = error instanceof Error ? error.message : 'אירעה שגיאה בעת בחירת הקובץ';
      Alert.alert('שגיאה', errorMsg);
    } finally {
      setUploadProgress('');
    }
  };

  const handlePasteText = () => {
    setShowPasteModal(true);
    setPastedText('');
  };

  const handlePasteConfirm = () => {
    if (pastedText.trim()) {
      setState((prev) => ({
        ...prev,
        fileContent: pastedText,
        fileName: `text-${Date.now()}`,
        fileType: 'text',
      }));
      setShowPasteModal(false);
      setPastedText('');
      Alert.alert('הצלחה', 'הטקסט נטען בהצלחה');
    } else {
      Alert.alert('שגיאה', 'אנא הזן טקסט');
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) {
      Alert.alert('שגיאה', 'אנא הזן קישור תקין');
      return;
    }

    try {
      setUploadProgress('טוען תוכן מהקישור...');
      setShowUrlModal(false);
      setLoading(true);

      const processor = getAIProcessor();
      const content = await processor.fetchContentFromUrl(urlInput);

      if (!content || content.length < 50) {
        throw new Error('לא נמצא תוכן מספיק בקישור זה');
      }

      setState((prev) => ({
        ...prev,
        fileContent: content,
        fileName: `url-${new URL(urlInput).hostname}`,
        fileType: 'text',
        description: `מקור: ${urlInput}`
      }));

      setUrlInput('');
      Alert.alert('הצלחה', 'התוכן נטען בהצלחה מהקישור');
    } catch (error) {
      console.error('URL fetch error:', error);
      Alert.alert('שגיאה', `לא הצלחנו לטעון את הקישור.\n${error instanceof Error ? error.message : ''}`);
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  const validateForm = (): boolean => {
    console.log('Validating form:', {
      title: state.title,
      subject: state.subject,
      fileContentLength: state.fileContent.length
    });

    // Title and subject are optional - AI will generate them if not provided
    if (!state.fileContent.trim()) {
      console.log('Validation failed: missing content');
      Alert.alert('שגיאה', 'אנא העלה או הדבק תוכן ללימוד');
      return false;
    }
    console.log('Form validation passed');
    return true;
  };

  const handleUploadAndProcess = async () => {
    console.log('Starting upload process...');
    console.log('User:', user?.email);
    console.log('State:', { title: state.title, subject: state.subject, fileContentLength: state.fileContent.length });

    if (!validateForm()) {
      console.log('Form validation failed');
      return;
    }

    // No longer require authentication - guest mode is supported

    try {
      setLoading(true);
      const isGuest = useAuthStore.getState().isGuest;
      const userId = user?.email || `guest-${Date.now()}`;

      // Auto-generate title and subject if not provided
      let finalTitle = state.title.trim();
      let finalSubject = state.subject.trim();

      if (!finalTitle || !finalSubject) {
        setUploadProgress('מארגן את תוכן הקובץ...');
        const processor = getAIProcessor();
        const autoGenerated = await processor.generateTitleAndSubject(state.fileContent);
        if (!finalTitle) finalTitle = autoGenerated.title;
        if (!finalSubject) finalSubject = autoGenerated.subject;
        console.log('Auto-generated:', { finalTitle, finalSubject });
      }

      let contentId = `local-${Date.now()}`;

      if (!isGuest) {
        // Only save to Firebase for authenticated users
        setUploadProgress('העלאת קובץ...');
        console.log('Uploading to Firestore...');

        contentId = await uploadContent({
          userId: userId,
          fileName: state.fileName || `content-${Date.now()}`,
          fileType: state.fileType,
          fileUrl: `gs://bucket/${state.fileName}`,
          title: finalTitle,
          description: state.description,
          subject: finalSubject,
          uploadedAt: Date.now(),
          status: 'processing',
        });

        console.log('Content uploaded successfully, ID:', contentId);
      } else {
        console.log('Guest mode - skipping Firebase upload');
      }

      setUploadProgress('עיבוד התוכן בעזרת AI...');

      // Fetch good question examples for this subject to improve AI generation
      const { fetchGoodQuestionExamples, fetchBadQuestionExamples } = useContentAndStudyStore.getState();
      const goodExamples = await fetchGoodQuestionExamples(finalSubject, 5);
      const badExamples = await fetchBadQuestionExamples(finalSubject, 5);
      console.log('Good examples found:', goodExamples.length);
      console.log('Bad examples found:', badExamples.length);

      // Process content with AI, using good and bad examples for better questions
      const processor = getAIProcessor();
      const response = await processor.processContent({
        contentId,
        userId: userId,
        title: finalTitle,
        content: state.fileContent,
        subject: finalSubject,
        preferredExerciseTypes: [
          'multiple-choice',
          'true-false',
          'matching',
        ],
        targetDifficulty: ['easy', 'medium', 'hard'],
        numberOfExercises: 10,
      }, goodExamples, badExamples);

      console.log('AI processing complete. Exercises:', response.exercises?.length);

      if (!response.exercises || response.exercises.length === 0) {
        throw new Error('לא הצלחנו ליצור תרגילים מהתוכן');
      }

      // Create study set from generated exercises
      setUploadProgress('יצירת מערך תרגול...');

      const studySetData = {
        userId: userId,
        contentId,
        title: finalTitle,
        description: response.summary || '',
        subject: finalSubject,
        exercises: response.exercises,
        originalContent: state.fileContent, // Save content for regenerating exercises
        completedExercises: 0,
        totalExercises: response.exercises.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      console.log('Creating study set with data:', {
        ...studySetData,
        exercises: `${studySetData.exercises.length} exercises`,
      });

      let setId: string;

      if (!isGuest) {
        // Save to Firebase for authenticated users
        const { createStudySet } = useContentAndStudyStore.getState();
        setId = await createStudySet(studySetData);
        console.log('Study set created in Firebase, ID:', setId);

        // Update content status
        await updateContentStatus(contentId, 'completed');
      } else {
        // For guests, store locally and use local ID
        setId = `local-${Date.now()}`;
        // Store in local state for the session
        const { setLocalStudySet } = useContentAndStudyStore.getState();
        if (setLocalStudySet) {
          setLocalStudySet({ ...studySetData, id: setId });
        }
        console.log('Study set stored locally for guest, ID:', setId);
      }

      setUploadProgress('');
      Alert.alert(
        'הצלחה!',
        `תוכן "${finalTitle}" עובד בהצלחה. נוצרו ${response.exercises.length} תרגילים${isGuest ? '\n\n💡 התחבר כדי לשמור את ההתקדמות שלך!' : ''}`,
        [
          {
            text: 'התחל ללמוד',
            onPress: () => {
              // Navigate to study set with ID
              router.push(`/study-set?setId=${setId}`);
            },
          },
          { text: 'חזור לבית', onPress: () => router.back() },
        ]
      );

      // Reset form
      setState({
        title: '',
        description: '',
        subject: '',
        fileContent: '',
        fileName: '',
        fileType: 'text',
      });
    } catch (error) {
      console.error('Error processing content:', error);
      Alert.alert(
        'שגיאה',
        `אירעה שגיאה: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`
      );
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  const SUBJECTS = [
    'מתמטיקה',
    'פיזיקה',
    'כימיה',
    'ביולוגיה',
    'ספרות',
    'היסטוריה',
    'גיאוגרפיה',
    'תכנות',
    'אנגלית',
    'אומנות',
    'ספורט',
    'אחר',
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)')}
          style={{ alignSelf: 'flex-end' }}
        >
          <Ionicons name="chevron-forward" size={28} color="black" />
        </TouchableOpacity>
        <Text style={styles.title}>העלאת חומר לימוד</Text>
        {/* Admin Button - only visible to admins */}
        {isAdmin(user?.email) ? (
          <TouchableOpacity
            onPress={() => router.push('/admin')}
            style={styles.adminButton}
          >
            <Ionicons name="settings-outline" size={24} color={Colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Title Input */}
      <View style={styles.section}>
        <Text style={styles.label}>כותרת החומר (אופציונלי)</Text>
        <CustomInput
          placeholder="לדוגמה: פרק 3 - התהליך הפוטוסינתטי"
          handleTextChange={(text: string) => setState((prev) => ({ ...prev, title: text }))}
          value={state.title}
        />
      </View>

      {/* Subject Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>תחום ידע (אופציונלי - יזוהה אוטומטית)</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.subjectScroll}
        >
          {SUBJECTS.map((subject) => (
            <TouchableOpacity
              key={subject}
              style={[
                styles.subjectChip,
                state.subject === subject && styles.subjectChipActive,
              ]}
              onPress={() => setState((prev) => ({ ...prev, subject }))}
              disabled={loading}
            >
              <Text
                style={[
                  styles.subjectChipText,
                  state.subject === subject && styles.subjectChipTextActive,
                ]}
              >
                {subject}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Description Input */}
      <View style={styles.section}>
        <Text style={styles.label}>תיאור (אופציונלי)</Text>
        <CustomInput
          placeholder="תיאור קצר של התוכן"
          handleTextChange={(text: string) => setState((prev) => ({ ...prev, description: text }))}
          value={state.description}
        />
      </View>

      {/* File Upload Section */}
      <View style={styles.section}>
        <Text style={styles.label}>העלאת קובץ</Text>
        <Text style={styles.fileTypeHint}>
          📄 ניתן להעלות קבצי PDF ו-Word (docx), אך הקריאה תתבצע במיטבה בקבצי Word
        </Text>

        {state.fileContent ? (
          <View style={styles.uploadedFile}>
            <Text style={styles.uploadedFileName}>{state.fileName}</Text>
            <Text style={styles.uploadedFileSize}>
              {state.fileContent.length} תווים
            </Text>
            <View style={styles.uploadedFileButtons}>
              {isAdmin(user?.email) && (
                <TouchableOpacity
                  style={styles.previewButton}
                  onPress={() => setShowPreviewModal(true)}
                  disabled={loading}
                >
                  <Ionicons name="eye" size={16} color="white" />
                  <Text style={styles.previewButtonText}>בדיקה</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() =>
                  setState((prev) => ({
                    ...prev,
                    fileContent: '',
                    fileName: '',
                  }))
                }
                disabled={loading}
              >
                <Text style={styles.removeButtonText}>הסר</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <CustomButton
              title="בחר קובץ"
              handlePress={handlePickFile}
              disabled={loading}
              backgroundColor={Colors.accent}
            />
            <View style={styles.dividerContainer}>
              <Text style={styles.divider}>או</Text>
            </View>
            <CustomButton
              title="הדבק טקסט"
              handlePress={handlePasteText}
              disabled={loading}
              backgroundColor={Colors.secondary}
            />
            <View style={styles.dividerContainer}>
              <Text style={styles.divider}>או</Text>
            </View>
            <CustomButton
              title="🌐 ייבא מקישור (URL)"
              handlePress={() => setShowUrlModal(true)}
              disabled={loading}
              backgroundColor={Colors.primary}
            />
            <View style={styles.dividerContainer}>
              <Text style={styles.divider}>או</Text>
            </View>
            <CustomButton
              title="📁 אל הקבצים שלי"
              handlePress={() => router.push('/(tabs)/my-content')}
              disabled={loading}
              backgroundColor="#4CAF50"
            />
            <View style={styles.dividerContainer}>
              <Text style={styles.divider}>או</Text>
            </View>
            <CustomButton
              title="🚀 בניית קורס מלא (5 שלבים)"
              handlePress={() => router.push('/create-complete-course' as any)}
              disabled={loading}
              backgroundColor={Colors.purple}
            />
          </>
        )}
      </View>

      {/* Upload Progress */}
      {!!uploadProgress && (
        <View style={styles.progressSection}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.progressText}>{uploadProgress}</Text>
        </View>
      )}

      {/* Upload Button - only show when file is loaded */}
      {!!state.fileContent && (
        <CustomButton
          title={loading ? 'מעבד...' : 'לחץ כדי להעלות'}
          handlePress={handleUploadAndProcess}
          disabled={loading}
          backgroundColor={Colors.accent}
        />
      )}

      <View style={{ height: 40 }} />

      {/* Paste Text Modal */}
      <Modal
        visible={showPasteModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPasteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>הדבק טקסט</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="הדבק או הקלד את התוכן כאן..."
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
                <Text style={[styles.modalButtonText, { color: 'white' }]}>אישור</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* URL Input Modal */}
      <Modal
        visible={showUrlModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowUrlModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>ייבא מקישור</Text>
            <Text style={styles.modalSubtitle}>הזן כתובת אתר (למשל כתבה או מאמר):</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 50, textAlign: 'left' }]}
              placeholder="https://example.com/article..."
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              keyboardType="url"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowUrlModal(false)}
              >
                <Text style={styles.modalButtonText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleUrlSubmit}
              >
                <Text style={[styles.modalButtonText, { color: 'white' }]}>ייבא</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Preview Content Modal (Admin Only) */}
      <Modal
        visible={showPreviewModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPreviewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.previewModalContent]}>
            <View style={styles.previewModalHeader}>
              <Ionicons name="eye" size={24} color={Colors.accent} />
              <Text style={styles.modalTitle}>בדיקת תוכן לפני עיבוד</Text>
            </View>
            <Text style={styles.previewFileName}>{state.fileName}</Text>
            <Text style={styles.previewCharCount}>{state.fileContent.length} תווים</Text>
            <ScrollView style={styles.previewScrollView}>
              <Text style={styles.previewText} selectable>
                {state.fileContent}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.previewCloseButton}
              onPress={() => setShowPreviewModal(false)}
            >
              <Text style={styles.previewCloseButtonText}>סגור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  adminButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#FFF3E0',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  fileTypeHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  subjectScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  subjectChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  subjectChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  subjectChipText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  subjectChipTextActive: {
    color: Colors.white,
  },
  uploadedFile: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  uploadedFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  uploadedFileSize: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  removeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#ff6b6b',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  removeButtonText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    textAlign: 'center',
    color: '#ccc',
    marginVertical: 12,
    fontSize: 12,
  },
  dividerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  progressSection: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  progressText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 200,
    textAlign: 'right',
    backgroundColor: '#f9f9f9',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonConfirm: {
    backgroundColor: Colors.accent,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  uploadedFileButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.accent,
    borderRadius: 8,
  },
  previewButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  previewModalContent: {
    maxHeight: '90%',
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  previewFileName: {
    fontSize: 14,
    color: Colors.accent,
    textAlign: 'center',
    fontWeight: '500',
  },
  previewCharCount: {
    fontSize: 12,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 12,
  },
  previewScrollView: {
    maxHeight: 400,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9f9f9',
    marginBottom: 16,
  },
  previewText: {
    fontSize: 14,
    color: Colors.text,
    textAlign: 'right',
    lineHeight: 22,
  },
  previewCloseButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewCloseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
