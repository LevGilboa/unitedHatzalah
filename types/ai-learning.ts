// Types for AI-powered educational platform

export type ExerciseType =
  | 'multiple-choice'
  | 'fill-blank'
  | 'matching'
  | 'true-false'
  | 'short-answer'
  | 'ordering'
  | 'scenario';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

export interface UploadedContent {
  id: string;
  userId: string;
  fileName: string;
  fileType: 'pdf' | 'text' | 'document' | 'image';
  fileUrl: string;
  title: string;
  description: string;
  subject: string;
  uploadedAt: number; // timestamp
  status: 'processing' | 'completed' | 'failed';
  processingError?: string;
}

export interface GeneratedExercise {
  id: string;
  contentId: string;
  type: ExerciseType;
  question: string;
  options?: string[]; // for multiple choice, matching, etc.
  correctAnswer: string | number | string[] | number[];
  explanation: string;
  difficulty: DifficultyLevel;
  topic: string; // specific topic within the content
  keywords: string[]; // key concepts covered
}

export interface StudySet {
  id: string;
  userId: string;
  contentId: string;
  title: string;
  description: string;
  subject: string;
  exercises: GeneratedExercise[];
  originalContent?: string; // Store original content for regenerating exercises (optional for backwards compatibility)
  createdAt: number;
  updatedAt: number;
  totalExercises: number;
  completedExercises: number;
}

export interface UserProgress {
  userId: string;
  setId: string;
  exerciseId: string;
  correct: boolean;
  difficulty: DifficultyLevel;
  attemptCount: number;
  lastAttemptAt: number;
  nextReviewAt?: number; // spaced repetition
  confidenceScore: number; // 0-100
  timeSpent: number; // in seconds
}

export interface SpacedRepetitionSchedule {
  exerciseId: string;
  userId: string;
  nextReviewDate: number;
  interval: number; // days
  easeFactor: number; // SM-2 algorithm factor
  repetitionCount: number;
  lastReviewDate: number;
}

export interface LearningSession {
  id: string;
  userId: string;
  setId: string;
  startedAt: number;
  endedAt?: number;
  exercisesCompleted: number;
  correctAnswers: number;
  totalXP: number;
  status: 'active' | 'completed' | 'abandoned';
}

export interface SubjectArea {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  userContents: string[]; // content IDs
}

export interface AIProcessingRequest {
  contentId: string;
  userId: string;
  title: string;
  content: string;
  subject: string;
  preferredExerciseTypes: ExerciseType[];
  targetDifficulty: DifficultyLevel[];
  numberOfExercises: number;
  previousQuestions?: string[]; // Questions already asked to prevent repetition
  forceNewQuestions?: boolean; // Flag to tell AI to create completely different questions
}

export interface AIProcessingResponse {
  contentId: string;
  exercises: GeneratedExercise[];
  summary: string;
  keyTopics: string[];
  estimatedLearningTime: number; // in minutes
  processingTime: number; // in milliseconds
}

// Question Feedback Types for AI Improvement
export type FeedbackRating = 'good' | 'bad';
export type FeedbackReason = 'unclear' | 'too-easy' | 'too-hard' | 'wrong-answer' | 'not-relevant' | 'repetitive' | 'bad-reading' | 'other';

export interface QuestionFeedback {
  id: string;
  exerciseId: string;
  userId: string;
  rating: FeedbackRating;
  reason?: FeedbackReason;
  questionText: string;
  questionType: ExerciseType;
  subject: string;
  createdAt: number;
  openFeedback?: string; // Optional open-ended feedback from user
}

export interface QuestionQualityMetrics {
  exerciseId: string;
  questionText: string;
  questionType: ExerciseType;
  subject: string;
  totalAttempts: number;
  correctRate: number; // 0-1
  positiveRatings: number;
  negativeRatings: number;
  qualityScore: number; // calculated: correctRate * 0.5 + positiveRatio * 0.5
}

// ============================================
// COMPREHENSIVE COURSE SYSTEM TYPES
// ============================================

export type CoursePhaseType =
  | 'introduction'      // היכרות - שאלות קלות
  | 'basic-practice'    // תרגול בסיסי
  | 'deep-understanding'// העמקה 
  | 'spaced-repetition' // חזרה חכמה
  | 'final-test';       // מבחן סיכום

export interface CoursePhase {
  id: string;
  courseId: string;
  type: CoursePhaseType;
  title: string;
  description: string;
  order: number;                    // סדר השלב בקורס (1-5)
  exercises: GeneratedExercise[];
  requiredScore: number;            // ציון מינימלי להמשך (0-100)
  isLocked: boolean;                // האם השלב נעול
  isCompleted: boolean;             // האם הושלם
  bestScore?: number;               // הציון הטוב ביותר
  attempts: number;                 // כמה פעמים ניסו
  estimatedTime: number;            // זמן משוער בדקות
}

export interface CompleteCourse {
  id: string;
  userId: string;
  contentId: string;
  title: string;
  description: string;
  subject: string;
  originalContent: string;          // התוכן המקורי
  summary: string;                  // סיכום התוכן
  keyTopics: string[];              // נושאים מרכזיים
  phases: CoursePhase[];            // 5 שלבי הלמידה
  totalExercises: number;
  completedExercises: number;
  overallProgress: number;          // 0-100
  currentPhase: number;             // השלב הנוכחי (1-5)
  createdAt: number;
  updatedAt: number;
  completedAt?: number;             // מתי סיימו את הקורס
  status: 'in-progress' | 'completed' | 'not-started';
  masteryLevel: number;             // רמת השליטה 0-100
  failedExercises?: GeneratedExercise[]; // For Spaced Repetition (SRS)
}

export interface CourseProgress {
  courseId: string;
  userId: string;
  phaseId: string;
  exerciseId: string;
  correct: boolean;
  attemptNumber: number;
  answeredAt: number;
  timeSpent: number;                // זמן בשניות
}

export interface CourseGenerationRequest {
  contentId: string;
  userId: string;
  title: string;
  content: string;
  subject: string;
}

export interface CourseGenerationResponse {
  course: CompleteCourse;
  generationTime: number;           // זמן יצירה במילישניות
  success: boolean;
  error?: string;
}

// Phase configuration for course generation
export interface PhaseConfig {
  type: CoursePhaseType;
  title: string;
  description: string;
  exerciseCount: number;
  difficulties: DifficultyLevel[];
  exerciseTypes: ExerciseType[];
  requiredScore: number;
}

// Default phase configurations
export const COURSE_PHASES_CONFIG: PhaseConfig[] = [
  {
    type: 'introduction',
    title: '📖 היכרות עם החומר',
    description: 'שאלות קלות להכרת המושגים הבסיסיים',
    exerciseCount: 5,
    difficulties: ['easy'],
    exerciseTypes: ['multiple-choice', 'true-false'],
    requiredScore: 60,
  },
  {
    type: 'basic-practice',
    title: '📝 תרגול בסיסי',
    description: 'העמקת הידע עם שאלות מגוונות',
    exerciseCount: 10,
    difficulties: ['easy', 'medium'],
    exerciseTypes: ['multiple-choice', 'fill-blank', 'true-false'],
    requiredScore: 70,
  },
  {
    type: 'deep-understanding',
    title: '🧠 העמקה',
    description: 'שאלות מאתגרות לבדיקת הבנה עמוקה',
    exerciseCount: 10,
    difficulties: ['medium', 'hard'],
    exerciseTypes: ['multiple-choice', 'fill-blank', 'true-false', 'scenario'],
    requiredScore: 75,
  },
  {
    type: 'spaced-repetition',
    title: '🔄 חזרה חכמה',
    description: 'חזרה על כל החומר עם דגש על נקודות חלשות',
    exerciseCount: 10,
    difficulties: ['easy', 'medium', 'hard'],
    exerciseTypes: ['multiple-choice', 'fill-blank', 'true-false'],
    requiredScore: 80,
  },
  {
    type: 'final-test',
    title: '🏆 מבחן סיכום',
    description: 'מבחן מקיף על כל החומר - הוכח שאתה שולט!',
    exerciseCount: 15,
    difficulties: ['medium', 'hard', 'expert'],
    exerciseTypes: ['multiple-choice', 'fill-blank', 'short-answer', 'true-false', 'scenario'],
    requiredScore: 85,
  },
];

