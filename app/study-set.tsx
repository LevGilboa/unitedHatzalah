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
  const { currentSet, fetchStudySet, fetchGoodQuestionExamples, loading } = useContentAndStudyStore();

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [generatedExercises, setGeneratedExercises] = useState<GeneratedExercise[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

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
        // Fetch good examples to improve AI generation
        const goodExamples = await fetchGoodQuestionExamples(currentSet.subject, 5);

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
        }, goodExamples);

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
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>
          {isGenerating ? 'מייצר שאלות חדשות...' : 'טוען תרגילים...'}
        </Text>
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
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>חזור</Text>
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
      // Finished all exercises
      Alert.alert(
        'כל הכבוד! 🎉',
        `סיימת ${exercises.length} תרגילים בהצלחה!`,
        [
          {
            text: 'חזור לבית',
            onPress: () => router.back(),
          },
          {
            text: 'חזור לתחום',
            onPress: () => router.back(),
          },
        ]
      );
    }
  };

  const handlePrevious = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(currentExerciseIndex - 1);
      setShowExplanation(false);
    }
  };

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
            setUserAnswers((prev) => ({
              ...prev,
              [id]: answer,
            }));
            setShowExplanation(true);
          }}
          onNext={handleNext}
          onPrevious={currentExerciseIndex > 0 ? handlePrevious : undefined}
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

      {/* Navigation Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.navButton,
            currentExerciseIndex === 0 && styles.navButtonDisabled,
          ]}
          onPress={handlePrevious}
          disabled={currentExerciseIndex === 0}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={
              currentExerciseIndex === 0 ? Colors.lightGray : Colors.accent
            }
          />
          <Text
            style={[
              styles.navButtonText,
              currentExerciseIndex === 0 && styles.navButtonTextDisabled,
            ]}
          >
            הקודם
          </Text>
        </TouchableOpacity>

        {!showExplanation ? (
          <TouchableOpacity
            style={[styles.submitButton]}
            onPress={() => {
              Alert.alert('תשובה', 'אנא בחר תשובה קודם');
            }}
          >
            <Text style={styles.submitButtonText}>שלח תשובה</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.nextButton,
              currentExerciseIndex === exercises.length - 1 &&
              styles.finishButton,
            ]}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>
              {currentExerciseIndex === exercises.length - 1
                ? 'סיים'
                : 'הבא'}
            </Text>
            <Ionicons
              name={
                currentExerciseIndex === exercises.length - 1
                  ? 'checkmark-circle'
                  : 'chevron-forward'
              }
              size={24}
              color="white"
            />
          </TouchableOpacity>
        )}
      </View>

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
  loadingText: {
    fontSize: 14,
    color: Colors.gray,
    marginTop: 12,
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
});
