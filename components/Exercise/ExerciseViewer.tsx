import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  I18nManager,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { GeneratedExercise, ExerciseType, FeedbackRating, FeedbackReason } from '@/types/ai-learning';
import { useContentAndStudyStore } from '@/stores/contentAndStudyStore';
import { useAuthStore } from '@/stores/authStore';
import { getAIProcessor } from '@/services/AIContentProcessor';
import { gameEffects } from '@/services/GameEffects';

I18nManager.forceRTL(true);

// Feedback reason options
const FEEDBACK_REASONS: { value: FeedbackReason; label: string }[] = [
  { value: 'unclear', label: '❓ השאלה לא ברורה' },
  { value: 'too-easy', label: '😴 קלה מדי' },
  { value: 'too-hard', label: '🤯 קשה מדי' },
  { value: 'wrong-answer', label: '❌ התשובה הנכונה שגויה' },
  { value: 'not-relevant', label: '🎯 לא קשורה לחומר' },
  { value: 'repetitive', label: '🔄 שאלה חזרתית' },
  { value: 'bad-reading', label: '📄 קריאה שגויה של הקובץ' },
  { value: 'other', label: '💬 אחר' },
];

interface ExerciseViewerProps {
  exercise: GeneratedExercise;
  exerciseNumber: number;
  totalExercises: number;
  subject: string;
  onAnswer: (exerciseId: string, answer: string | number | string[], correct: boolean) => void;
  onNext: () => void;
  onPrevious?: () => void;
  onSkip?: () => void;
  onReportRepetitive?: () => void;
  onReportBadReading?: () => void;
}

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'easy':
      return '#4CAF50';
    case 'medium':
      return '#FF9800';
    case 'hard':
      return '#f44336';
    case 'expert':
      return '#9C27B0';
    default:
      return '#666';
  }
};

const getDifficultyLabel = (difficulty: string) => {
  switch (difficulty) {
    case 'easy':
      return 'קל';
    case 'medium':
      return 'בינוני';
    case 'hard':
      return 'קשה';
    case 'expert':
      return 'מומחה';
    default:
      return difficulty;
  }
};

export default function ExerciseViewer({
  exercise,
  exerciseNumber,
  totalExercises,
  subject,
  onAnswer,
  onNext,
  onPrevious,
  onSkip,
  onReportRepetitive,
  onReportBadReading,
}: ExerciseViewerProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | number | string[] | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [showGuestLoginModal, setShowGuestLoginModal] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [openFeedbackText, setOpenFeedbackText] = useState('');
  const [selectedReason, setSelectedReason] = useState<FeedbackReason | null>(null);
  const [isCheckingAnswer, setIsCheckingAnswer] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const scrollViewRef = React.useRef<any>(null);

  // Matching pairs state
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<number[]>([]); // indices of matched left items
  const [shuffledRight, setShuffledRight] = useState<{ text: string, originalIndex: number }[]>([]);

  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const { submitQuestionFeedback } = useContentAndStudyStore();

  // Reset state when exercise changes
  useEffect(() => {
    setSelectedAnswer(null);
    setTextAnswer('');
    setShowFeedback(false);
    setIsCorrect(false);
    setFeedbackGiven(false);
    setShowReasonModal(false);
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatchedPairs([]);
    setIsCheckingAnswer(false);
    setAiFeedback(null);

    // Shuffle right side options for matching
    if (exercise.type === 'matching' && exercise.options) {
      const rightOptions = exercise.options.map((opt, idx) => ({
        text: opt,
        originalIndex: idx
      }));
      // Shuffle
      for (let i = rightOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rightOptions[i], rightOptions[j]] = [rightOptions[j], rightOptions[i]];
      }
      setShuffledRight(rightOptions);
    }
  }, [exercise.id]);

  const handleQuestionFeedback = async (rating: FeedbackRating, reason?: FeedbackReason) => {
    if (feedbackGiven || isSubmittingFeedback) return;

    // Check if user is guest (not logged in)
    if (!user) {
      setShowReasonModal(false);
      setShowGuestLoginModal(true);
      return;
    }

    // Special handling for bad-reading feedback - delegate to parent
    if (reason === 'bad-reading' && onReportBadReading) {
      setShowReasonModal(false);
      onReportBadReading();
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      await submitQuestionFeedback({
        exerciseId: exercise.id,
        userId: user.email || '',
        rating,
        reason,
        questionText: exercise.question,
        questionType: exercise.type,
        subject: subject,
      });

      setFeedbackGiven(true);
      setShowReasonModal(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      // Still mark as given to avoid getting stuck
      setFeedbackGiven(true);
      setShowReasonModal(false);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleBadFeedback = () => {
    // Check if user is guest (not logged in)
    if (!user) {
      setShowGuestLoginModal(true);
      return;
    }
    setShowReasonModal(true);
  };

  const checkAnswer = async () => {
    // For fill-blank and short-answer, use textAnswer
    const answerToCheck = exercise.type === 'fill-blank' || exercise.type === 'short-answer'
      ? textAnswer.trim()
      : selectedAnswer;

    if (answerToCheck === null || answerToCheck === '') {
      Alert.alert('שגיאה', 'אנא הזן תשובה');
      return;
    }

    // Check if answer is correct
    const correctAnswer = exercise.correctAnswer;
    let isAnswerCorrect = false;

    if (exercise.type === 'fill-blank' || exercise.type === 'short-answer') {
      // For text answers, use AI-powered semantic checking
      setIsCheckingAnswer(true);
      setAiFeedback(null);

      try {
        const processor = getAIProcessor();
        const result = await processor.checkAnswerWithAI(
          exercise.question,
          String(answerToCheck),
          String(correctAnswer)
        );
        isAnswerCorrect = result.isCorrect;
        if (result.feedback) {
          setAiFeedback(result.feedback);
        }
      } catch (error) {
        console.error('AI answer check failed, falling back to exact match:', error);
        // Fallback to exact match
        const userAnswer = String(answerToCheck).trim().toLowerCase();
        const correct = String(correctAnswer).trim().toLowerCase();
        isAnswerCorrect = userAnswer === correct;
      } finally {
        setIsCheckingAnswer(false);
      }
    } else if (Array.isArray(correctAnswer) && Array.isArray(selectedAnswer)) {
      isAnswerCorrect = JSON.stringify(correctAnswer.sort()) === JSON.stringify(selectedAnswer.sort());
    } else {
      isAnswerCorrect = selectedAnswer === correctAnswer;
    }

    setIsCorrect(isAnswerCorrect);
    setShowFeedback(true);

    // Play sound and haptic effects based on answer
    if (isAnswerCorrect) {
      gameEffects.onCorrectAnswer();
    } else {
      gameEffects.onIncorrectAnswer();
    }

    // Scroll down to show the next button
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Record the answer
    onAnswer(exercise.id, answerToCheck as string | number | string[], isAnswerCorrect);
  };

  const renderExerciseContent = () => {
    switch (exercise.type) {
      case 'multiple-choice':
        return renderMultipleChoice();
      case 'fill-blank':
        return renderFillBlank();
      case 'true-false':
        return renderTrueFalse();
      case 'matching':
        return renderMatching();
      case 'short-answer':
        return renderShortAnswer();
      case 'ordering':
        return renderOrdering();
      default:
        return <Text>סוג תרגיל לא ידוע</Text>;
    }
  };

  const renderMultipleChoice = () => (
    <View style={styles.exerciseContent}>
      <Text style={styles.question}>{exercise.question}</Text>
      {exercise.keywords && exercise.keywords.length > 0 && (
        <Text style={styles.subQuestion}>
          {Array.isArray(exercise.keywords)
            ? exercise.keywords.join(', ')
            : String(exercise.keywords)}
        </Text>
      )}
      <View style={styles.optionsContainer}>
        {exercise.options?.map((option, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.option,
              selectedAnswer === index && styles.optionSelected,
              showFeedback &&
              index === exercise.correctAnswer &&
              styles.optionCorrect,
              showFeedback &&
              selectedAnswer === index &&
              !isCorrect &&
              styles.optionIncorrect,
            ]}
            onPress={() => {
              if (!showFeedback) {
                gameEffects.onSelect();
                setSelectedAnswer(index);
              }
            }}
            disabled={showFeedback}
          >
            <View
              style={[
                styles.optionIndicator,
                selectedAnswer === index && styles.optionIndicatorSelected,
              ]}
            />
            <Text style={styles.optionText}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderTrueFalse = () => (
    <View style={styles.exerciseContent}>
      <Text style={styles.question}>{exercise.question}</Text>
      <View style={styles.trueFalseContainer}>
        <TouchableOpacity
          style={[
            styles.trueFalseOption,
            selectedAnswer === 0 && styles.trueFalseOptionSelected,
            showFeedback &&
            exercise.correctAnswer === 0 &&
            styles.optionCorrect,
            showFeedback &&
            selectedAnswer === 0 &&
            !isCorrect &&
            styles.optionIncorrect,
          ]}
          onPress={() => {
            if (!showFeedback) {
              gameEffects.onSelect();
              setSelectedAnswer(0);
            }
          }}
          disabled={showFeedback}
        >
          <Text style={styles.trueFalseText}>נכון</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.trueFalseOption,
            selectedAnswer === 1 && styles.trueFalseOptionSelected,
            showFeedback &&
            exercise.correctAnswer === 1 &&
            styles.optionCorrect,
            showFeedback &&
            selectedAnswer === 1 &&
            !isCorrect &&
            styles.optionIncorrect,
          ]}
          onPress={() => {
            if (!showFeedback) {
              gameEffects.onSelect();
              setSelectedAnswer(1);
            }
          }}
          disabled={showFeedback}
        >
          <Text style={styles.trueFalseText}>לא נכון</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFillBlank = () => (
    <View style={styles.exerciseContent}>
      <Text style={styles.question}>{exercise.question}</Text>
      <TextInput
        style={[
          styles.textInputAnswer,
          showFeedback && isCorrect && styles.textInputCorrect,
          showFeedback && !isCorrect && styles.textInputIncorrect,
        ]}
        placeholder="הקלד את התשובה כאן..."
        placeholderTextColor="#999"
        value={textAnswer}
        onChangeText={setTextAnswer}
        editable={!showFeedback && !isCheckingAnswer}
        textAlign="right"
      />
      {isCheckingAnswer && (
        <View style={styles.checkingAnswerContainer}>
          <ActivityIndicator size="small" color={Colors.accent} />
          <Text style={styles.checkingAnswerText}>בודק את התשובה...</Text>
        </View>
      )}
      {showFeedback && isCorrect && aiFeedback && (
        <Text style={styles.aiFeedbackText}>{aiFeedback}</Text>
      )}
      {showFeedback && !isCorrect && (
        <Text style={styles.correctAnswerText}>
          התשובה הנכונה: {exercise.correctAnswer}
        </Text>
      )}
      {/* Next button directly in fill-blank after feedback */}
      {showFeedback && (
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, { marginTop: 20, paddingVertical: 16 }]}
          onPress={onNext}
        >
          <Text style={[styles.buttonTextPrimary, { fontSize: 18 }]}>
            {exerciseNumber < totalExercises ? 'הבא →' : 'סיים'}
          </Text>
        </TouchableOpacity>
      )}
      {showFeedback && <View style={{ height: 40 }} />}
    </View>
  );

  const handleMatchingSelect = (side: 'left' | 'right', index: number) => {
    if (showFeedback) return;

    if (side === 'left') {
      if (matchedPairs.includes(index)) return; // Already matched
      setSelectedLeft(selectedLeft === index ? null : index);
    } else {
      setSelectedRight(selectedRight === index ? null : index);
    }
  };

  // Check if a pair is selected and verify match
  useEffect(() => {
    if (selectedLeft !== null && selectedRight !== null && exercise.type === 'matching') {
      const rightItem = shuffledRight[selectedRight];
      const isMatch = rightItem.originalIndex === selectedLeft;

      if (isMatch) {
        // Correct match!
        setMatchedPairs(prev => [...prev, selectedLeft]);
      }

      // Reset selections after a short delay
      setTimeout(() => {
        setSelectedLeft(null);
        setSelectedRight(null);
      }, 300);
    }
  }, [selectedLeft, selectedRight]);

  // Check if all pairs are matched
  useEffect(() => {
    if (exercise.type === 'matching' && exercise.options &&
      matchedPairs.length === exercise.options.length && matchedPairs.length > 0) {
      setShowFeedback(true);
      setIsCorrect(true);
      onAnswer(exercise.id, matchedPairs.length, true);
    }
  }, [matchedPairs]);

  const renderMatching = () => {
    // For matching, we expect options to be pairs like ["word1", "word2", ...]
    // and keywords to be the matching translations ["תרגום1", "תרגום2", ...]
    const leftItems = exercise.keywords || [];
    const rightItems = shuffledRight;

    return (
      <View style={styles.exerciseContent}>
        <Text style={styles.question}>{exercise.question || 'התאם את הזוגות'}</Text>

        <View style={styles.matchingPairsContainer}>
          {/* Left column */}
          <View style={styles.matchingColumn}>
            {leftItems.map((item, index) => {
              const isMatched = matchedPairs.includes(index);
              const isSelected = selectedLeft === index;

              return (
                <TouchableOpacity
                  key={`left-${index}`}
                  style={[
                    styles.matchingPairItem,
                    isSelected && styles.matchingPairSelected,
                    isMatched && styles.matchingPairMatched,
                  ]}
                  onPress={() => handleMatchingSelect('left', index)}
                  disabled={isMatched || showFeedback}
                >
                  <Text style={[
                    styles.matchingPairText,
                    isMatched && styles.matchingPairTextMatched,
                  ]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Right column */}
          <View style={styles.matchingColumn}>
            {rightItems.map((item, index) => {
              const isMatched = matchedPairs.includes(item.originalIndex);
              const isSelected = selectedRight === index;

              return (
                <TouchableOpacity
                  key={`right-${index}`}
                  style={[
                    styles.matchingPairItem,
                    isSelected && styles.matchingPairSelected,
                    isMatched && styles.matchingPairMatched,
                  ]}
                  onPress={() => handleMatchingSelect('right', index)}
                  disabled={isMatched || showFeedback}
                >
                  <Text style={[
                    styles.matchingPairText,
                    isMatched && styles.matchingPairTextMatched,
                  ]}>
                    {item.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {matchedPairs.length > 0 && !showFeedback && (
          <Text style={styles.matchingProgress}>
            התאמות: {matchedPairs.length}/{leftItems.length}
          </Text>
        )}
      </View>
    );
  };

  const renderShortAnswer = () => (
    <View style={styles.exerciseContent}>
      <Text style={styles.question}>{exercise.question}</Text>
      <TextInput
        style={[
          styles.textInputAnswer,
          showFeedback && isCorrect && styles.textInputCorrect,
          showFeedback && !isCorrect && styles.textInputIncorrect,
        ]}
        placeholder="הקלד את התשובה כאן..."
        placeholderTextColor="#999"
        value={textAnswer}
        onChangeText={setTextAnswer}
        editable={!showFeedback && !isCheckingAnswer}
        textAlign="right"
        multiline
        numberOfLines={3}
      />
      {isCheckingAnswer && (
        <View style={styles.checkingAnswerContainer}>
          <ActivityIndicator size="small" color={Colors.accent} />
          <Text style={styles.checkingAnswerText}>בודק את התשובה...</Text>
        </View>
      )}
      {showFeedback && isCorrect && aiFeedback && (
        <Text style={styles.aiFeedbackText}>{aiFeedback}</Text>
      )}
      {showFeedback && !isCorrect && (
        <Text style={styles.correctAnswerText}>
          התשובה הנכונה: {exercise.correctAnswer}
        </Text>
      )}
    </View>
  );

  const renderOrdering = () => (
    <View style={styles.exerciseContent}>
      <Text style={styles.question}>{exercise.question}</Text>
      {/* TODO: Implement drag-and-drop for ordering */}
      <View style={styles.orderingContainer}>
        {exercise.options?.map((option, index) => (
          <View key={index} style={styles.orderingItem}>
            <Text style={styles.orderingNumber}>{index + 1}</Text>
            <Text style={styles.orderingText}>{option}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.progressInfo}>
          <Text style={styles.progressText}>
            תרגיל {exerciseNumber} מתוך {totalExercises}
          </Text>
        </View>
        <View
          style={[
            styles.difficultyBadge,
            { backgroundColor: getDifficultyColor(exercise.difficulty) },
          ]}
        >
          <Text style={styles.difficultyText}>
            {getDifficultyLabel(exercise.difficulty)}
          </Text>
        </View>
      </View>

      {/* Topic */}
      {exercise.topic && (
        <View style={styles.topicSection}>
          <Text style={styles.topicLabel}>נושא:</Text>
          <Text style={styles.topicValue}>{exercise.topic}</Text>
        </View>
      )}

      {/* Exercise Content */}
      {renderExerciseContent()}

      {/* Feedback */}
      {showFeedback && (
        <View
          style={[
            styles.feedbackSection,
            isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect,
          ]}
        >
          <Text style={styles.feedbackTitle}>
            {isCorrect ? '✅ תשובה נכונה!' : '❌ תשובה שגויה'}
          </Text>
          <Text style={styles.feedbackText}>{exercise.explanation}</Text>
        </View>
      )}

      {/* Question Quality Feedback */}
      {showFeedback && (
        <View style={styles.questionFeedbackSection}>
          <Text style={styles.questionFeedbackLabel}>
            {feedbackGiven ? '✓ תודה על המשוב!' : 'האם השאלה הייתה טובה?'}
          </Text>
          {!feedbackGiven && (
            <View style={styles.questionFeedbackButtons}>
              <TouchableOpacity
                style={[styles.feedbackButton, styles.feedbackButtonGood, isSubmittingFeedback && styles.feedbackButtonDisabled]}
                onPress={() => handleQuestionFeedback('good')}
                disabled={isSubmittingFeedback}
              >
                <Text style={styles.feedbackButtonText}>
                  {isSubmittingFeedback ? '...' : '👍 שאלה טובה'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedbackButton, styles.feedbackButtonBad, isSubmittingFeedback && styles.feedbackButtonDisabled]}
                onPress={handleBadFeedback}
                disabled={isSubmittingFeedback}
              >
                <Text style={styles.feedbackButtonText}>👎 לא ברורה</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Feedback Reason Modal */}
      <Modal
        visible={showReasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReasonModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>מה הבעיה עם השאלה?</Text>
            {FEEDBACK_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.value}
                style={styles.reasonButton}
                onPress={() => handleQuestionFeedback('bad', reason.value)}
              >
                <Text style={styles.reasonButtonText}>{reason.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowReasonModal(false)}
            >
              <Text style={styles.modalCancelText}>ביטול</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Keywords */}
      {exercise.keywords && exercise.keywords.length > 0 && (
        <View style={styles.keywordsSection}>
          <Text style={styles.keywordsLabel}>מילות מפתח:</Text>
          <View style={styles.keywordsList}>
            {exercise.keywords.map((keyword, index) => (
              <View key={index} style={styles.keyword}>
                <Text style={styles.keywordText}>{keyword}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Navigation Buttons */}
      <View style={styles.buttonContainer}>
        {onPrevious && exerciseNumber > 1 && (
          <TouchableOpacity style={styles.button} onPress={onPrevious}>
            <Text style={styles.buttonText}>← הקודם</Text>
          </TouchableOpacity>
        )}

        {/* Skip, Repetitive, and Bad Reading buttons row */}
        {!showFeedback && (onSkip || onReportRepetitive || onReportBadReading) && (
          <View style={styles.skipButtonsRow}>
            {onSkip && (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={onSkip}
              >
                <Text style={styles.skipButtonText}>דלג ▶</Text>
              </TouchableOpacity>
            )}
            {onReportRepetitive && (
              <TouchableOpacity
                style={styles.repetitiveButton}
                onPress={onReportRepetitive}
              >
                <Text style={styles.repetitiveButtonText}>🔄 חזרתית</Text>
              </TouchableOpacity>
            )}
            {onReportBadReading && (
              <TouchableOpacity
                style={styles.badReadingButton}
                onPress={onReportBadReading}
              >
                <Text style={styles.badReadingButtonText}>📄 קריאה שגויה</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!showFeedback && exercise.type !== 'matching' && (
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={checkAnswer}
            disabled={isCheckingAnswer}
          >
            <Text style={styles.buttonTextPrimary}>
              {isCheckingAnswer ? 'בודק...' : 'בדוק תשובה'}
            </Text>
          </TouchableOpacity>
        )}

        {showFeedback && (
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={onNext}
          >
            <Text style={styles.buttonTextPrimary}>
              {exerciseNumber < totalExercises ? 'הבא →' : 'סיים'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 20 }} />

      {/* Guest Login Modal */}
      <Modal
        visible={showGuestLoginModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowGuestLoginModal(false)}
      >
        <View style={styles.guestModalOverlay}>
          <View style={styles.guestModalContent}>
            <TouchableOpacity
              style={styles.guestModalCloseButton}
              onPress={() => setShowGuestLoginModal(false)}
            >
              <Text style={styles.guestModalCloseButtonText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.guestModalTitle}>התחברות נדרשת</Text>
            <Text style={styles.guestModalText}>
              כדי לשלוח הערות ולשמור את ההתקדמות שלך, אנא התחבר או הירשם.
            </Text>

            <View style={styles.guestModalButtonsContainer}>
              <TouchableOpacity
                style={styles.guestModalButton}
                onPress={() => {
                  setShowGuestLoginModal(false);
                  router.push('/auth/login');
                }}
              >
                <Text style={styles.guestModalButtonText}>התחברות</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.guestModalButton, styles.guestModalButtonSignup]}
                onPress={() => {
                  setShowGuestLoginModal(false);
                  router.push('/auth/register');
                }}
              >
                <Text style={styles.guestModalButtonTextSignup}>הרשמה</Text>
              </TouchableOpacity>
            </View>
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
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  progressInfo: {
    flex: 1,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  difficultyText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  topicSection: {
    marginTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  topicLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  topicValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.accent,
  },
  exerciseContent: {
    marginTop: 20,
    marginBottom: 20,
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
    lineHeight: 24,
  },
  subQuestion: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  optionsContainer: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  optionSelected: {
    borderColor: Colors.accent,
    backgroundColor: '#f0f7ff',
  },
  optionCorrect: {
    borderColor: '#4CAF50',
    backgroundColor: '#f1f8f4',
  },
  optionIncorrect: {
    borderColor: '#f44336',
    backgroundColor: '#fef5f5',
  },
  optionIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
  },
  optionIndicatorSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  optionText: {
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  trueFalseContainer: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
  },
  trueFalseOption: {
    flex: 1,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  trueFalseOptionSelected: {
    borderColor: Colors.accent,
    backgroundColor: '#f0f7ff',
  },
  trueFalseText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  blankInput: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 6,
    borderBottomWidth: 3,
  },
  placeholderText: {
    color: '#999',
    fontSize: 14,
  },
  matchingContainer: {
    marginTop: 16,
    gap: 8,
  },
  matchingItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    backgroundColor: '#f9f9f9',
  },
  matchingText: {
    fontSize: 13,
    color: Colors.text,
  },
  // Matching Pairs styles (Duolingo-like)
  matchingPairsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 16,
  },
  matchingColumn: {
    flex: 1,
    gap: 12,
  },
  matchingPairItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  matchingPairSelected: {
    borderColor: Colors.accent,
    backgroundColor: '#e3f2fd',
  },
  matchingPairMatched: {
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e9',
    opacity: 0.7,
  },
  matchingPairText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  matchingPairTextMatched: {
    color: '#4CAF50',
  },
  matchingProgress: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
    color: '#666',
  },
  shortAnswerInput: {
    marginTop: 16,
    minHeight: 100,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    backgroundColor: '#f9f9f9',
  },
  orderingContainer: {
    marginTop: 16,
    gap: 8,
  },
  orderingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    backgroundColor: '#f9f9f9',
  },
  orderingNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.accent,
    marginRight: 12,
    minWidth: 30,
  },
  orderingText: {
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  feedbackSection: {
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  feedbackCorrect: {
    backgroundColor: '#f1f8f4',
    borderLeftColor: '#4CAF50',
  },
  feedbackIncorrect: {
    backgroundColor: '#fef5f5',
    borderLeftColor: '#f44336',
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  feedbackText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  keywordsSection: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  keywordsLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
    fontWeight: '600',
  },
  keywordsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keyword: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.accent,
    borderRadius: 12,
  },
  keywordText: {
    fontSize: 11,
    color: Colors.white,
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.accent,
    backgroundColor: Colors.white,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.accent,
  },
  buttonTextPrimary: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  textInputAnswer: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    marginTop: 12,
    textAlign: 'right',
  },
  textInputCorrect: {
    borderColor: '#4CAF50',
    backgroundColor: '#f1f8f4',
  },
  textInputIncorrect: {
    borderColor: '#f44336',
    backgroundColor: '#fef5f5',
  },
  correctAnswerText: {
    marginTop: 8,
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  questionFeedbackSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    alignItems: 'center',
  },
  questionFeedbackLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  questionFeedbackButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  feedbackButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  feedbackButtonGood: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  feedbackButtonBad: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  feedbackButtonDisabled: {
    opacity: 0.5,
  },
  feedbackButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 350,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#333',
  },
  reasonButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  reasonButtonText: {
    fontSize: 15,
    textAlign: 'right',
    color: '#333',
  },
  modalCancelButton: {
    marginTop: 8,
    paddingVertical: 12,
  },
  modalCancelText: {
    fontSize: 15,
    textAlign: 'center',
    color: '#666',
  },
  checkingAnswerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  checkingAnswerText: {
    fontSize: 14,
    color: Colors.accent,
  },
  aiFeedbackText: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  skipButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipButtonText: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'underline',
  },
  repetitiveButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff3e0',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  repetitiveButtonText: {
    fontSize: 14,
    color: '#e65100',
    fontWeight: '500',
  },
  badReadingButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2196f3',
  },
  badReadingButtonText: {
    fontSize: 14,
    color: '#1565c0',
    fontWeight: '500',
  },
  guestModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  guestModalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  guestModalCloseButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  guestModalCloseButtonText: {
    fontSize: 20,
    color: '#999',
    fontWeight: '600',
  },
  guestModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  guestModalText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  guestModalButtonsContainer: {
    width: '100%',
    gap: 12,
  },
  guestModalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  guestModalButtonSignup: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  guestModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  guestModalButtonTextSignup: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.accent,
  },
});
