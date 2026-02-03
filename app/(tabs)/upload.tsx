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
import mammoth from 'mammoth';
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

// Helper function to extract text from PDF locally using pdf-parse
const extractTextFromPDFLocal = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  try {
    // For web, we'll use pdf.js via CDN
    if (Platform.OS === 'web') {
      // @ts-ignore - pdfjsLib loaded from CDN
      let pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      
      if (!pdfjsLib) {
        // Load pdf.js dynamically
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
      let totalChars = 0;
      
      console.log(`[PDF] Document has ${pdf.numPages} pages`);
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Better text reconstruction with proper spacing
        let pageText = '';
        let lastY = -1;
        
        for (const item of textContent.items) {
          const textItem = item as any;
          const currentY = textItem.transform ? textItem.transform[5] : 0;
          
          // Add newline if Y position changed significantly (different line)
          if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
            pageText += '\n';
          } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
            pageText += ' ';
          }
          
          pageText += textItem.str;
          lastY = currentY;
        }
        
        const trimmedPage = pageText.trim();
        console.log(`[PDF] Page ${i}: ${trimmedPage.length} chars`);
        totalChars += trimmedPage.length;
        
        if (trimmedPage) {
          fullText += trimmedPage + '\n\n';
        }
      }
      
      console.log(`[PDF] Total extracted: ${totalChars} chars from ${pdf.numPages} pages`);
      
      // Check if extraction yielded meaningful content
      const result = fullText.trim();
      if (result.length < 100 && pdf.numPages > 0) {
        // Very little text extracted - probably scanned PDF
        throw new Error('SCANNED_PDF');
      }
      
      return result;
    } else {
      // For native, we need a different approach
      throw new Error('PDF extraction not supported on mobile - please paste text manually');
    }
  } catch (error: any) {
    console.error('PDF extraction error:', error);
    if (error.message === 'SCANNED_PDF') {
      throw error;
    }
    throw error;
  }
};

// Helper function to extract text from Word documents using mammoth
const extractTextFromWord = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  try {
    console.log('[Word] Starting text extraction...');
    
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
  const [pastedText, setPastedText] = useState('');
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
    try {
      console.log('Starting file picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/plain', 
          'text/*', 
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        copyToCacheDirectory: true,
      });
      console.log('File picker result:', result);

      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0];
        setUploadProgress('קריאת קובץ...');

        const isPDF = file.mimeType?.includes('pdf') || file.name.endsWith('.pdf');
        const isWord = file.mimeType?.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx');
        const isDocx = file.name.endsWith('.docx') || file.mimeType?.includes('openxmlformats');
        const isOldDoc = file.name.endsWith('.doc') && !file.name.endsWith('.docx');
        
        // Old .doc format is not supported - only .docx
        if (isOldDoc) {
          setUploadProgress('');
          Alert.alert(
            'פורמט לא נתמך',
            'קבצי .doc (Word ישן) אינם נתמכים. אנא שמור את הקובץ כ-.docx או העתק והדבק את הטקסט.',
            [{ text: 'הבנתי' }]
          );
          return;
        }

        let fileContent = '';

        try {
          if (isWord || isDocx) {
            // Extract text from Word document using mammoth
            setUploadProgress('מחלץ טקסט מ-Word...');
            console.log('Extracting text from Word document...');
            
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
              
              fileContent = await extractTextFromWord(arrayBuffer);
              console.log('Word text extracted, length:', fileContent.length);
            } else {
              // Mobile - try to extract using base64
              try {
                const base64 = await FileSystem.readAsStringAsync(file.uri, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                const binaryString = atob(base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                arrayBuffer = bytes.buffer;
                fileContent = await extractTextFromWord(arrayBuffer);
                console.log('Word text extracted on mobile, length:', fileContent.length);
              } catch (mobileError) {
                console.error('Mobile Word extraction failed:', mobileError);
                Alert.alert(
                  'שגיאה בחילוץ Word',
                  'לא הצלחנו לחלץ טקסט מהקובץ במובייל. אנא העתק את הטקסט ידנית דרך כפתור "הדבק טקסט".',
                  [{ text: 'הבנתי' }]
                );
                setUploadProgress('');
                return;
              }
            }
          } else if (isPDF) {
            // Extract text from PDF locally using pdf.js
            setUploadProgress('מחלץ טקסט מ-PDF...');
            console.log('Extracting text from PDF locally...');
            
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
              
              fileContent = await extractTextFromPDFLocal(arrayBuffer);
              console.log('PDF text extracted, length:', fileContent.length);
            } else {
              // Mobile - show message to paste text
              Alert.alert(
                'קובץ PDF',
                'חילוץ PDF לא נתמך במובייל. אנא פתח את ה-PDF, העתק את הטקסט והדבק אותו דרך כפתור "הדבק טקסט".',
                [{ text: 'הבנתי' }]
              );
              setUploadProgress('');
              return;
            }
          } else {
            // Handle plain text files
            console.log('Reading text file, Platform:', Platform.OS);
            console.log('File object:', file);
            console.log('File.file exists:', !!file.file);
            
            if (Platform.OS === 'web') {
              if (file.file) {
                console.log('Reading file via file.file.text()...');
                fileContent = await file.file.text();
                console.log('File content read, length:', fileContent.length);
              } else if (file.uri) {
                // Fallback: try to fetch the file URI
                console.log('Trying to fetch file URI:', file.uri);
                const response = await fetch(file.uri);
                fileContent = await response.text();
                console.log('File content fetched, length:', fileContent.length);
              } else {
                throw new Error('לא ניתן לקרוא את הקובץ בדפדפן זה');
              }
            } else {
              fileContent = await FileSystem.readAsStringAsync(
                file.uri,
                { encoding: FileSystem.EncodingType.UTF8 }
              );
            }
          }
        } catch (error) {
          console.error('File reading error:', error);
          
          const errorMessage = error instanceof Error ? error.message : '';
          const isQuotaError = errorMessage === 'QUOTA_EXCEEDED' || errorMessage.includes('quota') || errorMessage.includes('429');
          const isScannedPDF = errorMessage === 'SCANNED_PDF';
          const isEmptyWord = errorMessage === 'EMPTY_DOCUMENT';
          const isWordError = errorMessage === 'WORD_EXTRACTION_FAILED';
          
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
          } else if (isWordError) {
            Alert.alert(
              'שגיאה בחילוץ Word',
              'לא הצלחנו לחלץ טקסט מקובץ ה-Word. אנא נסה:\n1. לשמור את הקובץ שוב כ-.docx\n2. או להעתיק את הטקסט ידנית דרך כפתור "הדבק טקסט".',
              [{ text: 'הבנתי' }]
            );
          } else if (isQuotaError) {
            Alert.alert(
              'מכסת API נגמרה',
              'המערכת הגיעה למגבלת הבקשות. אנא המתן דקה ונסה שוב, או העתק את הטקסט ידנית דרך כפתור "הדבק טקסט".',
              [{ text: 'הבנתי' }]
            );
          } else {
            Alert.alert(
              'שגיאה בקריאת קובץ',
              isPDF 
                ? 'לא הצלחנו לחלץ טקסט מה-PDF. אנא נסה להעתיק את הטקסט ידנית דרך כפתור "הדבק טקסט".'
                : isWord
                  ? 'לא הצלחנו לחלץ טקסט מה-Word. אנא נסה להעתיק את הטקסט ידנית דרך כפתור "הדבק טקסט".'
                  : 'לא הצלחנו לקרוא את הקובץ. אנא נסה להעתיק את הטקסט ידנית דרך כפתור "הדבק טקסט".',
              [{ text: 'הבנתי' }]
            );
          }
          setUploadProgress('');
          return;
        }

        if (!fileContent || fileContent.trim().length === 0) {
          Alert.alert(
            'קובץ ריק',
            'הקובץ שבחרת ריק או לא ניתן לקריאה. אנא נסה קובץ אחר או השתמש בכפתור "הדבק טקסט".',
            [{ text: 'הבנתי' }]
          );
          setUploadProgress('');
          return;
        }

        console.log('File loaded successfully:', file.name, 'Type:', isPDF ? 'pdf' : isWord ? 'document' : 'text', 'Content length:', fileContent.length);
        
        setState((prev) => ({
          ...prev,
          fileContent,
          fileName: file.name,
          fileType: isPDF ? 'pdf' : isWord ? 'document' : 'text',
        }));

        setUploadProgress('');
        Alert.alert('הצלחה', `הקובץ "${file.name}" נטען בהצלחה (${fileContent.length} תווים)`);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      const errorMsg = error instanceof Error ? error.message : 'אירעה שגיאה בעת בחירת הקובץ';
      Alert.alert('שגיאה', errorMsg);
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
        setUploadProgress('מזהה כותרת ותחום באופן אוטומטי...');
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
              title="📁 אל הקבצים שלי"
              handlePress={() => router.push('/(tabs)/my-content')}
              disabled={loading}
              backgroundColor="#4CAF50"
            />
          </>
        )}
      </View>

      {/* Upload Progress */}
      {uploadProgress && (
        <View style={styles.progressSection}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.progressText}>{uploadProgress}</Text>
        </View>
      )}

      {/* Upload Button - only show when file is loaded */}
      {state.fileContent && (
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
