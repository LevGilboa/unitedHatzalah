import AppLoading from '@/components/AppLoading';
import ChoiceExercise from '@/components/Lesson/Exercise/ChoiceExercise';
import FinishScreen from '@/components/Lesson/FinishScreen';
import LessonBar from '@/components/Lesson/LessonBar';
import useLessonStore from '@/stores/lessonStore';
import { Exercise, Lesson } from '@/types/data';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { getAIProcessor } from '@/services/AIContentProcessor';
import { convertExercises } from '@/services/ExerciseConverter';
import { Colors } from '@/constants/Colors';

export default function LessonScreen() {
  const router = useRouter();
  const { fetchLesson } = useLessonStore();
  const { lessonId } = useLocalSearchParams() as { lessonId: string };

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [heartCount, setHeartCount] = useState(5);
  const [step, setStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [endLesson, setEndLesson] = useState(false);
  const [startTime] = useState(Date.now()); // Track when lesson started
  const [timeSpent, setTimeSpent] = useState('0 שניות'); // Track time spent

  useEffect(() => {
    if (!lessonId) return;
    const getLesson = async () => {
      console.log('Fetching lesson:', lessonId);
      const fetchedLesson = await fetchLesson(lessonId);
      console.log('Fetched lesson:', fetchedLesson);
      if (fetchedLesson) {
        setLesson(fetchedLesson);

        // ALWAYS generate new exercises if we have originalContent
        // This ensures fresh, unique questions each time
        if (fetchedLesson.originalContent) {
          console.log('🎯 Generating NEW exercises from originalContent (AI-powered)');
          generateExercises(fetchedLesson);
        } else if (fetchedLesson.exercises && fetchedLesson.exercises.length > 0) {
          // Use pre-existing exercises only for legacy courses without originalContent
          console.log('Using pre-existing exercises (legacy course):', fetchedLesson.exercises.length);
          setExercises(fetchedLesson.exercises);
        } else {
          // No exercises available
          console.log('No exercises available for this lesson');
          setGenerationError('אין תרגילים זמינים לשיעור זה');
        }
      }
    };
    getLesson();
  }, [lessonId]);

  const generateExercises = async (lessonData: Lesson) => {
    if (!lessonData.originalContent) return;

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const processor = getAIProcessor();

      // Get previous questions from stored exercises to avoid repetition
      const previousQuestions = lessonData.exercises?.map(ex => ex.question) || [];

      const response = await processor.processContent({
        contentId: lessonData.id,
        userId: 'lesson-user',
        title: lessonData.name || 'שיעור',
        content: lessonData.originalContent,
        subject: lessonData.subject || 'כללי',
        preferredExerciseTypes: ['multiple-choice', 'true-false'],
        targetDifficulty: ['easy', 'medium', 'hard'],
        numberOfExercises: 5,
        previousQuestions: previousQuestions, // Pass previous questions to avoid repetition
      });

      if (response.exercises && response.exercises.length > 0) {
        // Convert AI exercises to lesson exercise format
        const converted = convertExercises(response.exercises);
        setExercises(converted);
      } else {
        setGenerationError('לא הצלחנו ליצור תרגילים');
      }
    } catch (error) {
      console.error('Error generating exercises:', error);
      setGenerationError('שגיאה ביצירת תרגילים');
    } finally {
      setIsGenerating(false);
    }
  };

  // Show loading while fetching lesson
  if (!lesson) return <AppLoading />;

  // Show loading while generating exercises
  if (isGenerating) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>🤖 AI יוצר שאלות חדשות...</Text>
        <Text style={styles.loadingSubtext}>כל פעם שאלות שונות ומקוריות!</Text>
      </View>
    );
  }

  // Show error if generation failed or no exercises
  if (generationError || exercises.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{generationError || 'אין תרגילים זמינים לשיעור זה'}</Text>
        <Text style={styles.errorSubtext}>יתכן שהקורס נוצר לפני עדכון המערכת</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            // Go back to course page
            router.back();
          }}
        >
          <Text style={styles.retryButtonText}>חזור לקורס</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const exercise = exercises[step] as Exercise;

  // Calculate time spent when lesson ends
  const calculateTimeSpent = () => {
    const elapsed = Date.now() - startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes === 0) {
      return `${seconds} שניות`;
    } else if (minutes === 1) {
      return `דקה ${remainingSeconds > 0 ? `ו-${remainingSeconds} שניות` : ''}`;
    } else {
      return `${minutes} דקות${remainingSeconds > 0 ? ` ו-${remainingSeconds} שניות` : ''}`;
    }
  };

  const handleStepChange = (isCorrect: boolean) => {
    if (!isCorrect) {
      setHeartCount((prevHeartCount) => {
        const newHeartCount = prevHeartCount - 1;

        if (newHeartCount <= 0) {
          setTimeSpent(calculateTimeSpent());
          setEndLesson(true);
          return 0;
        }
        return newHeartCount;
      });
      return;
    }

    const newStep = step + 1;
    setProgressPercent(newStep / exercises.length);

    if (newStep >= exercises.length) {
      setTimeout(() => {
        setTimeSpent(calculateTimeSpent());
        setEndLesson(true);
      }, 1000);
    } else {
      setTimeout(() => {
        setStep(newStep);
      }, 1000);
    }
  };

  return (
    <View style={styles.container}>
      {!endLesson ? (
        <>
          <LessonBar progress={progressPercent} heartCount={heartCount} />
          <ChoiceExercise
            onAnswerSelected={handleStepChange}
            exercise={exercise}
          />
        </>
      ) : (
        <FinishScreen heartsReaming={heartCount} id={lessonId} committed={timeSpent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textDark,
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: Colors.gray,
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
