/**
 * Course Generator Service
 * Creates comprehensive courses from uploaded content
 * Each course has 5 phases to ensure complete mastery
 */

import {
    CompleteCourse,
    CoursePhase,
    CourseGenerationRequest,
    CourseGenerationResponse,
    GeneratedExercise,
    COURSE_PHASES_CONFIG,
    PhaseConfig,
    ExerciseType,
    DifficultyLevel,
} from '@/types/ai-learning';
import { getAIProcessor } from './AIContentProcessor';

export class CourseGeneratorService {
    private _aiProcessor: any = null;

    private get aiProcessor() {
        if (!this._aiProcessor) {
            this._aiProcessor = getAIProcessor();
        }
        return this._aiProcessor;
    }

    /**
     * Generate a complete course from content
     * Creates all 5 phases with appropriate exercises
     */
    async generateCourse(request: CourseGenerationRequest): Promise<CourseGenerationResponse> {
        const startTime = Date.now();

        try {
            console.log('🎓 Starting complete course generation for:', request.title);

            // First, analyze the content to get summary and topics
            const analysis = await this.analyzeContent(request.content, request.subject);

            // Generate all phases
            const phases: CoursePhase[] = [];
            const allGeneratedQuestions: string[] = [];

            for (let i = 0; i < COURSE_PHASES_CONFIG.length; i++) {
                const phaseConfig = COURSE_PHASES_CONFIG[i];
                console.log(`📚 Generating phase ${i + 1}/5: ${phaseConfig.title}`);

                const phase = await this.generatePhase(
                    request,
                    phaseConfig,
                    i + 1,
                    allGeneratedQuestions
                );

                phases.push(phase);

                // Add questions to prevent repetition in next phases
                phase.exercises.forEach(ex => allGeneratedQuestions.push(ex.question));
            }

            // Calculate total exercises
            const totalExercises = phases.reduce((sum, phase) => sum + phase.exercises.length, 0);

            // Create the complete course
            const course: CompleteCourse = {
                id: `course-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: request.userId,
                contentId: request.contentId,
                title: request.title,
                description: `קורס מקיף ב${request.subject} - ${totalExercises} תרגילים ב-5 שלבים`,
                subject: request.subject,
                originalContent: request.content,
                summary: analysis.summary,
                keyTopics: analysis.topics,
                phases,
                totalExercises,
                completedExercises: 0,
                overallProgress: 0,
                currentPhase: 1,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                status: 'not-started',
                masteryLevel: 0,
            };

            const generationTime = Date.now() - startTime;
            console.log(`✅ Course generated successfully in ${generationTime}ms with ${totalExercises} exercises`);

            return {
                course,
                generationTime,
                success: true,
            };

        } catch (error) {
            console.error('❌ Course generation failed:', error);
            return {
                course: {} as CompleteCourse,
                generationTime: Date.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Generate a single phase of the course
     */
    private async generatePhase(
        request: CourseGenerationRequest,
        config: PhaseConfig,
        order: number,
        previousQuestions: string[]
    ): Promise<CoursePhase> {
        const courseId = request.contentId;
        const phaseId = `phase-${order}-${Date.now()}`;

        // Generate exercises for this phase
        const exercises = await this.generatePhaseExercises(
            request,
            config,
            phaseId,
            previousQuestions
        );

        return {
            id: phaseId,
            courseId,
            type: config.type,
            title: config.title,
            description: config.description,
            order,
            exercises,
            requiredScore: config.requiredScore,
            isLocked: order > 1, // Only first phase is unlocked
            isCompleted: false,
            attempts: 0,
            estimatedTime: Math.ceil(exercises.length * 1.5), // ~1.5 min per exercise
        };
    }

    /**
     * Generate exercises for a specific phase
     */
    private async generatePhaseExercises(
        request: CourseGenerationRequest,
        config: PhaseConfig,
        phaseId: string,
        previousQuestions: string[]
    ): Promise<GeneratedExercise[]> {
        try {
            const response = await this.aiProcessor.processContent({
                contentId: phaseId,
                userId: request.userId,
                title: request.title,
                content: request.content,
                subject: request.subject,
                preferredExerciseTypes: config.exerciseTypes,
                targetDifficulty: config.difficulties,
                numberOfExercises: config.exerciseCount,
                previousQuestions,
                forceNewQuestions: true,
            });

            return response.exercises || [];
        } catch (error) {
            console.error(`Error generating exercises for phase ${config.type}:`, error);
            // Return empty array - will try to regenerate later
            return [];
        }
    }

    /**
     * Analyze content to extract summary and topics
     */
    private async analyzeContent(content: string, subject: string): Promise<{ summary: string; topics: string[] }> {
        try {
            // Use the AI processor's analyze method
            const analysis = await (this.aiProcessor as any).analyzeContent(content, subject);
            return {
                summary: analysis.summary || 'לא נוצר סיכום',
                topics: analysis.topics || [],
            };
        } catch (error) {
            console.error('Content analysis failed:', error);
            return {
                summary: 'קורס מבוסס על התוכן שהעלית',
                topics: [],
            };
        }
    }

    /**
     * Regenerate a specific phase (for retry or refresh)
     */
    async regeneratePhase(
        course: CompleteCourse,
        phaseOrder: number
    ): Promise<CoursePhase | null> {
        const phaseIndex = phaseOrder - 1;
        if (phaseIndex < 0 || phaseIndex >= COURSE_PHASES_CONFIG.length) {
            return null;
        }

        const config = COURSE_PHASES_CONFIG[phaseIndex];

        // Collect questions from other phases to prevent repetition
        const previousQuestions = course.phases
            .filter((_, i) => i !== phaseIndex)
            .flatMap(phase => phase.exercises.map(ex => ex.question));

        const newPhase = await this.generatePhase(
            {
                contentId: course.contentId,
                userId: course.userId,
                title: course.title,
                content: course.originalContent,
                subject: course.subject,
            },
            config,
            phaseOrder,
            previousQuestions
        );

        // Preserve completion status from original phase
        const originalPhase = course.phases[phaseIndex];
        if (originalPhase) {
            newPhase.isLocked = originalPhase.isLocked;
            newPhase.isCompleted = originalPhase.isCompleted;
            newPhase.bestScore = originalPhase.bestScore;
            newPhase.attempts = originalPhase.attempts;
        }

        return newPhase;
    }

    /**
     * Update phase completion status
     */
    updatePhaseCompletion(
        course: CompleteCourse,
        phaseOrder: number,
        score: number
    ): CompleteCourse {
        const phaseIndex = phaseOrder - 1;
        if (phaseIndex < 0 || phaseIndex >= course.phases.length) {
            return course;
        }

        const phase = course.phases[phaseIndex];
        phase.attempts += 1;

        // Update best score
        if (!phase.bestScore || score > phase.bestScore) {
            phase.bestScore = score;
        }

        // Check if phase is completed (met required score)
        if (score >= phase.requiredScore) {
            phase.isCompleted = true;

            // Unlock next phase if exists
            if (phaseIndex + 1 < course.phases.length) {
                course.phases[phaseIndex + 1].isLocked = false;
                course.currentPhase = Math.max(course.currentPhase, phaseOrder + 1);
            }
        }

        // Update course status
        course.updatedAt = Date.now();
        course.status = 'in-progress';

        // Calculate overall progress
        const completedPhases = course.phases.filter(p => p.isCompleted).length;
        course.overallProgress = Math.round((completedPhases / course.phases.length) * 100);

        // Calculate mastery level (weighted average of best scores)
        const totalScore = course.phases.reduce((sum, p) => sum + (p.bestScore || 0), 0);
        course.masteryLevel = Math.round(totalScore / course.phases.length);

        // Check if entire course is completed
        if (completedPhases === course.phases.length) {
            course.status = 'completed';
            course.completedAt = Date.now();
        }

        return course;
    }

    /**
     * Get phase status message
     */
    getPhaseStatusMessage(phase: CoursePhase): string {
        if (phase.isLocked) {
            return `🔒 נעול - עבור את השלב הקודם כדי לפתוח`;
        }
        if (phase.isCompleted) {
            return `✅ הושלם - ציון: ${phase.bestScore}%`;
        }
        if (phase.attempts > 0) {
            return `🔄 בתהליך - ניסיון ${phase.attempts}, ציון אחרון: ${phase.bestScore || 0}%`;
        }
        return `▶️ מוכן להתחלה`;
    }

    /**
     * Calculate estimated completion time for entire course
     */
    getEstimatedCourseTime(course: CompleteCourse): number {
        return course.phases.reduce((sum, phase) => sum + phase.estimatedTime, 0);
    }
}

// Singleton instance
export const courseGenerator = new CourseGeneratorService();
