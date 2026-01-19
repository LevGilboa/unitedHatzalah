/**
 * Service for converting AI-generated exercises to course format
 * and providing color palettes for courses and lessons
 */

import { GeneratedExercise } from '@/types/ai-learning';
import { Exercise, Lesson } from '@/types/data';

// Color palette for lesson nodes (12 colors)
export const LESSON_COLORS = [
  '#9de19a', // Light green
  '#7dd3fc', // Light blue
  '#fda4af', // Light pink
  '#fcd34d', // Yellow
  '#c4b5fd', // Light purple
  '#6ee7b7', // Mint
  '#fdba74', // Orange
  '#f9a8d4', // Pink
  '#93c5fd', // Blue
  '#86efac', // Green
  '#fca5a5', // Red
  '#a5b4fc', // Indigo
];

// Cover colors for courses (8 colors)
export const COVER_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
];

// Emoji icons for lessons
export const LESSON_ICONS = [
  '📚', '✏️', '🎯', '💡', '🔬', '🩺', '❤️', '🫀',
  '🩹', '💊', '🏥', '🚑', '⚡', '🌡️', '🔍', '📖',
  '✨', '🎓', '📝', '🧠', '💪', '🏆', '⭐', '🌟',
];

/**
 * Get a color for a lesson based on index
 */
export function getLessonColor(index: number): string {
  return LESSON_COLORS[index % LESSON_COLORS.length];
}

/**
 * Get an icon for a lesson based on index
 */
export function getLessonIcon(index: number): string {
  return LESSON_ICONS[index % LESSON_ICONS.length];
}

/**
 * Get a random cover color
 */
export function getRandomCoverColor(): string {
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
}

/**
 * Convert AI-generated exercise to course exercise format
 */
export function convertExercise(exercise: GeneratedExercise, index: number): Exercise {
  // Map exercise types - preserve fill-blank and true-false as distinct types
  const typeMap: Record<string, Exercise['type']> = {
    'multiple-choice': 'text-to-text',
    'true-false': 'true-false',
    'fill-blank': 'fill-blank',
    'matching': 'text-to-text',
    'short-answer': 'fill-blank',
    'ordering': 'text-to-text',
  };

  // For fill-blank type, store the correct answer as string
  if (exercise.type === 'fill-blank' || exercise.type === 'short-answer') {
    return {
      id: exercise.id || `ex-${index}-${Date.now()}`,
      type: 'fill-blank',
      question: exercise.question,
      answers: [], // Not used for fill-blank
      correct: String(exercise.correctAnswer), // Store as string for comparison
      // Note: explanation is NOT shown as subQuestion - it contains the answer!
    };
  }

  // For true-false type
  if (exercise.type === 'true-false') {
    const answer = exercise.correctAnswer;
    // Handle all possible formats from AI:
    // - String: "true", "false", "נכון", "לא נכון"
    // - Number: 0, 1
    // Index 0 = "נכון" (true), Index 1 = "לא נכון" (false)
    const normalizedAnswer = String(answer).toLowerCase().trim();
    const isTrueAnswer =
      answer === 0 ||
      normalizedAnswer === 'true' ||
      normalizedAnswer === 'נכון' ||
      normalizedAnswer === '0';
    const correctIndex = isTrueAnswer ? 0 : 1;

    console.log(`[TrueFalse] answer="${answer}", normalizedAnswer="${normalizedAnswer}", isTrueAnswer=${isTrueAnswer}, correctIndex=${correctIndex}`);

    return {
      id: exercise.id || `ex-${index}-${Date.now()}`,
      type: 'true-false',
      question: exercise.question,
      answers: ['נכון', 'לא נכון'],
      correct: correctIndex,
      // Note: explanation is NOT shown as subQuestion - it contains the answer!
    };
  }

  // For multiple choice and other types, use options as answers
  let answers: string[] = [];
  let correct: number = 0;

  if (exercise.type === 'multiple-choice' && exercise.options) {
    answers = exercise.options;
    correct = typeof exercise.correctAnswer === 'number'
      ? exercise.correctAnswer
      : 0;
  } else if (exercise.options) {
    answers = exercise.options;
    correct = typeof exercise.correctAnswer === 'number' ? exercise.correctAnswer : 0;
  } else {
    // Fallback - create simple answers
    answers = [String(exercise.correctAnswer), 'תשובה אחרת', 'תשובה שגויה', 'לא יודע'];
    correct = 0;
  }

  return {
    id: exercise.id || `ex-${index}-${Date.now()}`,
    type: typeMap[exercise.type] || 'text-to-text',
    question: exercise.question,
    answers,
    correct,
    // Note: explanation is NOT shown as subQuestion - it contains the answer!
  };
}

/**
 * Convert array of AI exercises to course exercises
 */
export function convertExercises(exercises: GeneratedExercise[]): Exercise[] {
  return exercises.map((ex, index) => convertExercise(ex, index));
}

/**
 * Create a lesson from a study set - stores original content for dynamic AI generation
 * Exercises are generated FRESH by AI each time the lesson is opened
 */
export function createLessonFromStudySet(
  studySetId: string,
  studySetTitle: string,
  exercises: GeneratedExercise[],
  index: number,
  originalContent?: string,
  subject?: string
): Omit<Lesson, 'id'> & { id?: string } {
  // ALWAYS store originalContent if available - exercises will be generated dynamically by AI
  // We don't store pre-generated exercises anymore - AI creates fresh ones each time

  return {
    id: `lesson-${studySetId}-${Date.now()}`,
    name: studySetTitle,
    icon: getLessonIcon(index),
    color: getLessonColor(index),
    exercises: [], // Empty - will be generated by AI each time
    originalContent, // Store original text for AI to generate new questions
    subject,
    studySetId,
  };
}

/**
 * Generate course metadata
 */
export function generateCourseMetadata(title: string, studySetsCount: number) {
  return {
    title,
    description: `קורס מותאם אישית עם ${studySetsCount} שיעורים`,
    coverColor: getRandomCoverColor(),
  };
}
