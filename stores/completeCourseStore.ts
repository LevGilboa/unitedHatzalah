/**
 * Complete Course Store
 * Manages comprehensive learning courses with 5 phases
 * Separate from the legacy courseStore to avoid conflicts
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    CompleteCourse,
    CoursePhase,
    CourseGenerationRequest,
    GeneratedExercise,
} from '@/types/ai-learning';
import { CourseGeneratorService } from '@/services/CourseGenerator';

// Create instance only when needed
let _courseGenerator: CourseGeneratorService | null = null;
const getCourseGenerator = () => {
    if (!_courseGenerator) {
        _courseGenerator = new CourseGeneratorService();
    }
    return _courseGenerator;
};

interface CompleteCourseStore {
    // State
    completeCourses: CompleteCourse[];
    currentCompleteCourse: CompleteCourse | null;
    currentPhase: CoursePhase | null;
    isGenerating: boolean;
    generationProgress: number; // 0-100
    generationMessage: string;
    error: string | null;

    // Actions
    generateCompleteCourse: (request: CourseGenerationRequest) => Promise<CompleteCourse | null>;
    getCompleteCourse: (courseId: string) => CompleteCourse | null;
    getCompleteCourseByContentId: (contentId: string) => CompleteCourse | null;
    setCurrentCompleteCourse: (courseId: string) => void;
    setCurrentPhase: (phaseOrder: number) => void;
    updatePhaseScore: (courseId: string, phaseOrder: number, score: number) => void;
    regeneratePhase: (courseId: string, phaseOrder: number) => Promise<boolean>;
    deleteCompleteCourse: (courseId: string) => void;
    addFailedExercise: (courseId: string, exercise: GeneratedExercise) => void;
    clearError: () => void;

    // Getters
    getUnlockedPhases: (courseId: string) => CoursePhase[];
    getNextPhase: (courseId: string) => CoursePhase | null;
    getCourseProgress: (courseId: string) => { completed: number; total: number; percentage: number };
}

export const useCompleteCourseStore = create<CompleteCourseStore>()(
    persist(
        (set, get) => ({
            // Initial state
            completeCourses: [],
            currentCompleteCourse: null,
            currentPhase: null,
            isGenerating: false,
            generationProgress: 0,
            generationMessage: '',
            error: null,

            // Generate a new complete course
            generateCompleteCourse: async (request) => {
                set({
                    isGenerating: true,
                    generationProgress: 0,
                    generationMessage: '🎓 מתחיל ליצור קורס מקיף...',
                    error: null
                });

                try {
                    // Progress updates for each phase
                    const messages = [
                        '📖 יוצר שלב 1: היכרות עם החומר...',
                        '📝 יוצר שלב 2: תרגול בסיסי...',
                        '🧠 יוצר שלב 3: העמקה...',
                        '🔄 יוצר שלב 4: חזרה חכמה...',
                        '🏆 יוצר שלב 5: מבחן סיכום...',
                    ];

                    let progressCount = 0;
                    const progressInterval = setInterval(() => {
                        progressCount++;
                        const phaseIndex = Math.min(Math.floor(progressCount / 4), 4);
                        set({
                            generationProgress: Math.min(progressCount * 5, 90),
                            generationMessage: messages[phaseIndex],
                        });
                    }, 1500);

                    const response = await getCourseGenerator().generateCourse(request);

                    clearInterval(progressInterval);

                    if (response.success && response.course) {
                        set(state => ({
                            completeCourses: [...state.completeCourses, response.course],
                            currentCompleteCourse: response.course,
                            generationProgress: 100,
                            generationMessage: '✅ הקורס נוצר בהצלחה!',
                            isGenerating: false,
                        }));

                        console.log('✅ Complete course added to store:', response.course.title);
                        return response.course;
                    } else {
                        throw new Error(response.error || 'Failed to generate course');
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    set({
                        error: errorMessage,
                        isGenerating: false,
                        generationProgress: 0,
                        generationMessage: '',
                    });
                    console.error('❌ Complete course generation failed:', errorMessage);
                    return null;
                }
            },

            // Get course by ID
            getCompleteCourse: (courseId) => {
                return get().completeCourses.find(c => c.id === courseId) || null;
            },

            // Get course by content ID
            getCompleteCourseByContentId: (contentId) => {
                return get().completeCourses.find(c => c.contentId === contentId) || null;
            },

            // Set current course
            setCurrentCompleteCourse: (courseId) => {
                const course = get().completeCourses.find(c => c.id === courseId);
                if (course) {
                    set({
                        currentCompleteCourse: course,
                        currentPhase: course.phases[0] || null,
                    });
                }
            },

            // Set current phase
            setCurrentPhase: (phaseOrder) => {
                const { currentCompleteCourse } = get();
                if (currentCompleteCourse) {
                    const phase = currentCompleteCourse.phases.find(p => p.order === phaseOrder);
                    if (phase && !phase.isLocked) {
                        set({ currentPhase: phase });
                    }
                }
            },

            // Update phase score after completion
            updatePhaseScore: (courseId, phaseOrder, score) => {
                set(state => {
                    const courseIndex = state.completeCourses.findIndex(c => c.id === courseId);
                    if (courseIndex === -1) return state;

                    const updatedCourse = getCourseGenerator().updatePhaseCompletion(
                        { ...state.completeCourses[courseIndex] },
                        phaseOrder,
                        score
                    );

                    const newCourses = [...state.completeCourses];
                    newCourses[courseIndex] = updatedCourse;

                    return {
                        completeCourses: newCourses,
                        currentCompleteCourse: state.currentCompleteCourse?.id === courseId ? updatedCourse : state.currentCompleteCourse,
                    };
                });
            },

            // Regenerate a phase with new questions
            regeneratePhase: async (courseId, phaseOrder) => {
                const course = get().getCompleteCourse(courseId);
                if (!course) return false;

                set({ generationMessage: `🔄 מייצר שאלות חדשות לשלב ${phaseOrder}...` });

                try {
                    const newPhase = await getCourseGenerator().regeneratePhase(course, phaseOrder);
                    if (!newPhase) return false;

                    set(state => {
                        const courseIndex = state.completeCourses.findIndex(c => c.id === courseId);
                        if (courseIndex === -1) return state;

                        const updatedCourse = { ...state.completeCourses[courseIndex] };
                        updatedCourse.phases[phaseOrder - 1] = newPhase;
                        updatedCourse.updatedAt = Date.now();

                        const newCourses = [...state.completeCourses];
                        newCourses[courseIndex] = updatedCourse;

                        return {
                            completeCourses: newCourses,
                            currentCompleteCourse: state.currentCompleteCourse?.id === courseId ? updatedCourse : state.currentCompleteCourse,
                            currentPhase: state.currentPhase?.order === phaseOrder ? newPhase : state.currentPhase,
                            generationMessage: '',
                        };
                    });

                    return true;
                } catch (error) {
                    console.error('Failed to regenerate phase:', error);
                    set({ generationMessage: '' });
                    return false;
                }
            },

            // Delete a course
            deleteCompleteCourse: (courseId) => {
                set(state => ({
                    completeCourses: state.completeCourses.filter(c => c.id !== courseId),
                    currentCompleteCourse: state.currentCompleteCourse?.id === courseId ? null : state.currentCompleteCourse,
                    currentPhase: state.currentCompleteCourse?.id === courseId ? null : state.currentPhase,
                }));
            },

            // Add failed exercise for Spaced Repetition
            addFailedExercise: (courseId, exercise) => {
                set(state => {
                    const courseIndex = state.completeCourses.findIndex(c => c.id === courseId);
                    if (courseIndex === -1) return state;

                    const course = state.completeCourses[courseIndex];
                    const failedExercises = course.failedExercises || [];
                    
                    // Don't add if already exists
                    if (failedExercises.some(ex => ex?.id === exercise.id)) {
                        return state;
                    }

                    const updatedCourse = {
                        ...course,
                        failedExercises: [...failedExercises, exercise],
                        updatedAt: Date.now()
                    };

                    const newCourses = [...state.completeCourses];
                    newCourses[courseIndex] = updatedCourse;

                    return {
                        completeCourses: newCourses,
                        currentCompleteCourse: state.currentCompleteCourse?.id === courseId ? updatedCourse : state.currentCompleteCourse
                    };
                });
            },

            // Clear error
            clearError: () => set({ error: null }),

            // Get unlocked phases for a course
            getUnlockedPhases: (courseId) => {
                const course = get().completeCourses.find(c => c.id === courseId);
                if (!course) return [];
                return course.phases.filter(p => !p.isLocked);
            },

            // Get the next phase to complete
            getNextPhase: (courseId) => {
                const course = get().completeCourses.find(c => c.id === courseId);
                if (!course) return null;

                // Find first uncompleted unlocked phase
                const nextPhase = course.phases.find(p => !p.isLocked && !p.isCompleted);
                return nextPhase || null;
            },

            // Get course progress
            getCourseProgress: (courseId) => {
                const course = get().completeCourses.find(c => c.id === courseId);
                if (!course) return { completed: 0, total: 0, percentage: 0 };

                const completed = course.phases.filter(p => p.isCompleted).length;
                const total = course.phases.length;
                const percentage = Math.round((completed / total) * 100);

                return { completed, total, percentage };
            },
        }),
        {
            name: 'wizzy-complete-courses-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                completeCourses: state.completeCourses,
            }),
        }
    )
);
