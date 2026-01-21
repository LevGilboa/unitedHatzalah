import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useContentAndStudyStore } from '@/stores/contentAndStudyStore';
import { useAuthStore } from '@/stores/authStore';
import ExerciseViewer from '@/components/Exercise/ExerciseViewer';
import { GeneratedExercise } from '@/types/ai-learning';
import { getAIProcessor } from '@/services/AIContentProcessor';

I18nManager.forceRTL(true);

export default function StudySet() {
  const router = useRouter();
  const { setId } = useLocalSearchParams();
  const user = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);
  const { currentSet, fetchStudySet, fetchGoodQuestionExamples, submitQuestionFeedback, updateStudySet, loading } = useContentAndStudyStore();

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [correctAnswers, setCorrectAnswers] = useState<Record<string, boolean>>({});
  const [skippedQuestions, setSkippedQuestions] = useState<Set<string>>(new Set());
  const [reportedRepetitive, setReportedRepetitive] = useState<Set<string>>(new Set());
  const [badReadingCount, setBadReadingCount] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [generatedExercises, setGeneratedExercises] = useState<GeneratedExercise[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showFinalScore, setShowFinalScore] = useState(false);

  // First, load the study set metadata
  useEffect(() => {
    console.log('study-set: setId =', setId);
    if (setId && typeof setId === 'string') {
      fetchStudySet(setId);
    }
  }, [setId]);

  // Then, generate new exercises when study set is loaded
  useEffect(() => {
    console.log('study-set: useEffect triggered, currentSet =', {
      id: currentSet?.id,
      title: currentSet?.title,
      exercisesCount: currentSet?.exercises?.length,
      hasOriginalContent: !!currentSet?.originalContent,
    });
    console.log('study-set: generatedExercises.length =', generatedExercises.length, 'isGenerating =', isGenerating);

    const generateNewExercises = async () => {
      // If no originalContent, use stored exercises directly
      if (!currentSet?.originalContent) {
        console.log('No originalContent, using stored exercises:', currentSet?.exercises?.length || 0);
        if (currentSet?.exercises && currentSet.exercises.length > 0) {
          setGeneratedExercises(currentSet.exercises);
        }
        return;
      }

      if (!user) {
        // If no user, just use stored exercises
        setGeneratedExercises(currentSet.exercises || []);
        return;
      }

      setIsGenerating(true);
      setGenerationError(null);

      try {
        // Fetch good examples and bad examples (including repetitive) to improve AI generation
        const { fetchBadQuestionExamples } = useContentAndStudyStore.getState();
        const goodExamples = await fetchGoodQuestionExamples(currentSet.subject, 5);
        const badExamples = await fetchBadQuestionExamples(currentSet.subject, 10); // Include repetitive

        const processor = getAIProcessor();

        // Get previous questions from stored exercises to avoid repetition
        const previousQuestions = currentSet.exercises?.map(ex => ex.question) || [];

        const response = await processor.processContent({
          contentId: currentSet.contentId,
          userId: user.email || '',
          title: currentSet.title,
          content: currentSet.originalContent,
          subject: currentSet.subject,
          preferredExerciseTypes: [
            'multiple-choice',
            'fill-blank',
            'true-false',
            'matching',
          ],
          targetDifficulty: ['easy', 'medium', 'hard'],
          numberOfExercises: 10,
          previousQuestions: previousQuestions, // Pass previous questions to avoid repetition
        }, goodExamples, badExamples);

        if (response.exercises && response.exercises.length > 0) {
          setGeneratedExercises(response.exercises);
        } else {
          // Fallback to stored exercises if generation fails
          setGeneratedExercises(currentSet.exercises || []);
        }
      } catch (error) {
        console.error('Error generating new exercises:', error);
        setGenerationError('שגיאה ביצירת שאלות חדשות, משתמש בשאלות קיימות');
        // Fallback to stored exercises
        setGeneratedExercises(currentSet.exercises || []);
      } finally {
        setIsGenerating(false);
      }
    };

    if (currentSet && !generatedExercises.length && !isGenerating) {
      generateNewExercises();
    }
  }, [currentSet, user]);

  if (loading || isGenerating) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>טוען...</Text>
      </View>
    );
  }

  if (!currentSet || generatedExercises.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={60} color={Colors.gray} />
          <Text style={styles.emptyTitle}>אין תרגילים</Text>
          <Text style={styles.emptyText}>
            לא נמצאו תרגילים למערך זה. אנא חזור לדף ההעלאה והעלה קובץ.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/(tabs)/upload')}
          >
            <Text style={styles.backButtonText}>לדף ההעלאה</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const exercises = generatedExercises;
  const currentExercise = exercises[currentExerciseIndex];
  const progress = ((currentExerciseIndex + 1) / exercises.length) * 100;

  const handleAnswerSubmit = (answer: any) => {
    setUserAnswers((prev) => ({
      ...prev,
      [currentExercise.id]: answer,
    }));
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
      setShowExplanation(false);
    } else {
      // Finished all exercises - show score
      setShowFinalScore(true);
    }
  };

  const handleSkip = () => {
    // Mark current question as skipped
    setSkippedQuestions(prev => new Set(prev).add(currentExercise.id));
    // Move to next question
    if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
      setShowExplanation(false);
    } else {
      // Finished all exercises - show score
      setShowFinalScore(true);
    }
  };

  const handleReportRepetitive = async () => {
    // Mark question as reported
    setReportedRepetitive(prev => new Set(prev).add(currentExercise.id));
    
    // Submit feedback to Firebase so AI can learn to avoid similar questions
    if (user) {
      try {
        await submitQuestionFeedback({
          exerciseId: currentExercise.id,
          userId: user.email || '',
          rating: 'bad',
          reason: 'repetitive',
          questionText: currentExercise.question,
          questionType: currentExercise.type,
          subject: currentSet?.subject || '',
        });
        console.log('Repetitive question reported:', currentExercise.question);
      } catch (error) {
        console.error('Error submitting repetitive feedback:', error);
      }
    }
    
    // Show brief confirmation
    Alert.alert('🔄 דווח', 'תודה! השאלה סומנה כחזרתית ולא תופיע שוב', [{ text: 'אוקי' }]);
    
    // Skip to next question (like skip behavior)
    setSkippedQuestions(prev => new Set(prev).add(currentExercise.id));
    if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
      setShowExplanation(false);
    } else {
      setShowFinalScore(true);
    }
  };

  // Function to regenerate exercises from content
  const regenerateExercises = async () => {
    if (!currentSet?.originalContent) {
      window.alert('אין תוכן מקורי לקריאה מחדש');
      return;
    }

    // Save current exercises in case regeneration fails
    const previousExercises = [...generatedExercises];
    
    // Get all previous questions to avoid them
    const previousQuestions = previousExercises.map(ex => ex.question);
    
    setIsGenerating(true);
    setGenerationError(null);
    setBadReadingCount(0); // Reset counter
    setCurrentExerciseIndex(0);
    setShowExplanation(false);
    setSkippedQuestions(new Set()); // Reset skipped
    setUserAnswers({}); // Reset answers
    setCorrectAnswers({}); // Reset correct answers

    try {
      const { fetchBadQuestionExamples } = useContentAndStudyStore.getState();
      const goodExamples = await fetchGoodQuestionExamples(currentSet.subject, 5);
      const badExamples = await fetchBadQuestionExamples(currentSet.subject, 10);

      const processor = getAIProcessor();
      const userId = user?.email || `guest-${Date.now()}`;

      console.log('Regenerating with previousQuestions:', previousQuestions.length);

      const response = await processor.processContent({
        contentId: currentSet.contentId,
        userId: userId,
        title: currentSet.title,
        content: currentSet.originalContent,
        subject: currentSet.subject,
        preferredExerciseTypes: [
          'multiple-choice',
          'fill-blank',
          'true-false',
          'matching',
        ],
        targetDifficulty: ['easy', 'medium', 'hard'],
        numberOfExercises: 10,
        previousQuestions: previousQuestions, // Pass ALL previous questions to avoid them
        forceNewQuestions: true, // Flag to tell AI to create completely different questions
      }, goodExamples, badExamples);

      if (response.exercises && response.exercises.length > 0) {
        console.log('New exercises generated:', response.exercises.length);
        setGeneratedExercises(response.exercises);
        window.alert('✅ השאלות נוצרו מחדש!');
      } else {
        // Restore previous exercises
        setGeneratedExercises(previousExercises);
        setGenerationError('לא הצלחנו ליצור שאלות חדשות');
        window.alert('לא הצלחנו ליצור שאלות חדשות. ממשיכים עם השאלות הקיימות.');
      }
    } catch (error) {
      console.error('Error regenerating exercises:', error);
      // Restore previous exercises
      setGeneratedExercises(previousExercises);
      setGenerationError('שגיאה בקריאה מחדש של הקובץ');
      window.alert('שגיאה בקריאה מחדש. ממשיכים עם השאלות הקיימות.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReportBadReading = async () => {
    const newCount = badReadingCount + 1;
    console.log('handleReportBadReading called! Count:', newCount);
    setBadReadingCount(newCount);

    // Submit feedback silently
    if (user) {
      try {
        await submitQuestionFeedback({
          exerciseId: currentExercise.id,
          userId: user.email || '',
          rating: 'bad',
          reason: 'bad-reading',
          questionText: currentExercise.question,
          questionType: currentExercise.type,
          subject: currentSet?.subject || '',
        });
      } catch (error) {
        console.error('Error submitting bad reading feedback:', error);
      }
    }

    // Skip current question
    setSkippedQuestions(prev => new Set(prev).add(currentExercise.id));

    // After 3 reports, offer to re-read the file
    if (newCount >= 3) {
      const shouldRegenerate = window.confirm(
        'דיווחת 3 פעמים על קריאה שגויה.\nהאם לנסות לקרוא את הקובץ מחדש וליצור שאלות חדשות?'
      );
      
      if (shouldRegenerate) {
        regenerateExercises();
      } else {
        // Move to next question
        if (currentExerciseIndex < exercises.length - 1) {
          setCurrentExerciseIndex(currentExerciseIndex + 1);
          setShowExplanation(false);
        } else {
          setShowFinalScore(true);
        }
      }
    } else {
      // Just skip to next question silently (like skip behavior)
      if (currentExerciseIndex < exercises.length - 1) {
        setCurrentExerciseIndex(currentExerciseIndex + 1);
        setShowExplanation(false);
      } else {
        setShowFinalScore(true);
      }
    }
  };

  // Calculate score (excluding skipped questions)
  const totalAnswered = Object.keys(correctAnswers).filter(id => !skippedQuestions.has(id)).length;
  const totalCorrect = Object.entries(correctAnswers)
    .filter(([id, correct]) => !skippedQuestions.has(id) && correct)
    .length;
  const actualQuestionsCount = exercises.length - skippedQuestions.size;
  const scorePercentage = actualQuestionsCount > 0 ? Math.round((totalCorrect / actualQuestionsCount) * 100) : 0;

  const getScoreEmoji = (percentage: number) => {
    if (percentage >= 90) return '🏆';
    if (percentage >= 70) return '🎉';
    if (percentage >= 50) return '👍';
    return '💪';
  };

  const getScoreMessage = (percentage: number) => {
    if (percentage >= 90) return 'מצוין! שליטה מלאה בחומר!';
    if (percentage >= 70) return 'טוב מאוד! כמעט שם!';
    if (percentage >= 50) return 'לא רע! המשך להתאמן!';
    return 'כדאי לחזור על החומר';
  };

  const handlePrevious = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(currentExerciseIndex - 1);
      setShowExplanation(false);
    }
  };

  // Show final score screen
  if (showFinalScore) {
    return (
      <View style={styles.container}>
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreEmoji}>{getScoreEmoji(scorePercentage)}</Text>
          <Text style={styles.scoreTitle}>סיימת את הלמידה!</Text>
          
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>הציון שלך</Text>
            <Text style={styles.scoreNumber}>{scorePercentage}</Text>
            <Text style={styles.scoreOutOf}>מתוך 100</Text>
          </View>
          
          <View style={styles.scoreDetails}>
            <View style={styles.scoreDetailRow}>
              <Text style={styles.scoreDetailLabel}>תשובות נכונות:</Text>
              <Text style={styles.scoreDetailValue}>{totalCorrect} מתוך {actualQuestionsCount}</Text>
            </View>
            {skippedQuestions.size > 0 && (
              <View style={styles.scoreDetailRow}>
                <Text style={styles.scoreDetailLabel}>שאלות שדילגת:</Text>
                <Text style={[styles.scoreDetailValue, { color: '#999' }]}>{skippedQuestions.size}</Text>
              </View>
            )}
            <View style={styles.scoreDetailRow}>
              <Text style={styles.scoreDetailLabel}>נושא:</Text>
              <Text style={styles.scoreDetailValue}>{currentSet.subject}</Text>
            </View>
          </View>
          
          <Text style={styles.scoreMessage}>{getScoreMessage(scorePercentage)}</Text>
          
          <View style={styles.scoreButtons}>
            <TouchableOpacity
              style={[styles.scoreButton, styles.scoreButtonPrimary]}
              onPress={() => {
                setShowFinalScore(false);
                setCurrentExerciseIndex(0);
                setUserAnswers({});
                setCorrectAnswers({});
                setSkippedQuestions(new Set());
                setShowExplanation(false);
              }}
            >
              <Ionicons name="refresh" size={20} color="white" />
              <Text style={styles.scoreButtonTextPrimary}>תרגל שוב</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.scoreButton, styles.scoreButtonSecondary]}
              onPress={() => router.back()}
            >
              <Ionicons name="home" size={20} color={Colors.accent} />
              <Text style={styles.scoreButtonTextSecondary}>חזור לבית</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={Colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>{currentSet.title}</Text>
          <Text style={styles.subject}>{currentSet.subject}</Text>
        </View>
        <View style={styles.spacer} />
      </View>

      {/* Generation Error Notice */}
      {generationError && (
        <View style={styles.errorNotice}>
          <Ionicons name="information-circle" size={16} color="#ff9800" />
          <Text style={styles.errorNoticeText}>{generationError}</Text>
        </View>
      )}

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressInfo}>
          <Text style={styles.progressText}>
            תרגיל {currentExerciseIndex + 1} מתוך {exercises.length}
          </Text>
          <Text style={styles.progressPercentage}>{Math.round(progress)}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${progress}%` }]}
          />
        </View>
      </View>

      {/* Exercise Viewer */}
      <View style={styles.exerciseContainer}>
        <ExerciseViewer
          exercise={currentExercise}
          exerciseNumber={currentExerciseIndex + 1}
          totalExercises={exercises.length}
          subject={currentSet.subject}
          onAnswer={(id, answer, correct) => {
            // Only count if not already answered
            const isNewAnswer = !userAnswers[id];
            
            setUserAnswers((prev) => ({
              ...prev,
              [id]: answer,
            }));
            setCorrectAnswers((prev) => ({
              ...prev,
              [id]: correct,
            }));
            setShowExplanation(true);
            
            // Update completedExercises in Firebase (only for authenticated users and new answers)
            if (isNewAnswer && !isGuest && setId && typeof setId === 'string' && !setId.startsWith('local-')) {
              const newCompletedCount = Object.keys(userAnswers).length + 1;
              updateStudySet(setId, { completedExercises: newCompletedCount }).catch(console.error);
            }
          }}
          onNext={handleNext}
          onPrevious={currentExerciseIndex > 0 ? handlePrevious : undefined}
          onSkip={handleSkip}
          onReportRepetitive={handleReportRepetitive}
          onReportBadReading={handleReportBadReading}
        />
      </View>

      {/* Explanation Section */}
      {showExplanation && (
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationTitle}>הסבר:</Text>
          <Text style={styles.explanationText}>
            {currentExercise.explanation}
          </Text>
          {currentExercise.keywords && (
            <View style={styles.keywordsContainer}>
              <Text style={styles.keywordsTitle}>קונספטים חשובים:</Text>
              <Text style={styles.keywordsText}>
                {Array.isArray(currentExercise.keywords)
                  ? currentExercise.keywords.join(', ')
                  : currentExercise.keywords}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
  },
  subject: {
    fontSize: 12,
    color: Colors.gray,
    marginTop: 4,
  },
  spacer: {
    width: 28,
  },
  progressSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.accent,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 4,
  },
  exerciseContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  explanationContainer: {
    marginHorizontal: 20,
    marginVertical: 12,
    padding: 16,
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  explanationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.accent,
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 14,
    color: Colors.textDark,
    lineHeight: 20,
  },
  keywordsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
  },
  keywordsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gray,
    marginBottom: 6,
  },
  keywordsText: {
    fontSize: 12,
    color: Colors.textDark,
    fontStyle: 'italic',
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 16,
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  navButtonDisabled: {
    borderColor: Colors.lightGray,
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.accent,
  },
  navButtonTextDisabled: {
    color: Colors.gray,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: Colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  nextButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  finishButton: {
    backgroundColor: '#4CAF50',
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: Colors.accent,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.gray,
    marginTop: 16,
  },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorNoticeText: {
    fontSize: 13,
    color: '#e65100',
    flex: 1,
    textAlign: 'right',
  },
  // Score screen styles
  scoreContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.white,
  },
  scoreEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  scoreTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginBottom: 24,
    textAlign: 'center',
  },
  scoreCard: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    width: '80%',
    maxWidth: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  scoreLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  scoreNumber: {
    fontSize: 72,
    fontWeight: 'bold',
    color: 'white',
  },
  scoreOutOf: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  scoreDetails: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 16,
  },
  scoreDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  scoreDetailLabel: {
    fontSize: 15,
    color: Colors.gray,
  },
  scoreDetailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  scoreMessage: {
    fontSize: 18,
    color: Colors.accent,
    fontWeight: '600',
    marginBottom: 32,
    textAlign: 'center',
  },
  scoreButtons: {
    width: '100%',
    gap: 12,
  },
  scoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  scoreButtonPrimary: {
    backgroundColor: Colors.accent,
  },
  scoreButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  scoreButtonTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  scoreButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.accent,
  },
});
