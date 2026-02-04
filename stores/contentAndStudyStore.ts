import { create } from 'zustand';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/configs/FirebaseConfig';
import {
  UploadedContent,
  StudySet,
  GeneratedExercise,
  UserProgress,
  QuestionFeedback,
  FeedbackRating,
  FeedbackReason,
  ExerciseType,
} from '@/types/ai-learning';

// Import courseStore for cross-store updates
import useCourseStore from './courseStore';

interface ContentAndStudyState {
  // Uploaded Content
  uploadedContents: UploadedContent[];
  currentContent: UploadedContent | null;

  // Study Sets
  studySets: StudySet[];
  currentSet: StudySet | null;
  localStudySets: StudySet[]; // For guest mode

  // User Progress
  userProgress: UserProgress[];

  // State
  loading: boolean;
  error: string | null;

  // Content Methods
  uploadContent: (content: Omit<UploadedContent, 'id'>) => Promise<string>;
  fetchUserContents: (userId: string) => Promise<void>;
  fetchContent: (contentId: string) => Promise<void>;
  deleteContent: (contentId: string) => Promise<void>;
  updateContentStatus: (
    contentId: string,
    status: UploadedContent['status'],
    error?: string
  ) => Promise<void>;

  // Study Set Methods
  createStudySet: (set: Omit<StudySet, 'id'>) => Promise<string>;
  fetchUserStudySets: (userId: string) => Promise<void>;
  fetchStudySet: (setId: string) => Promise<void>;
  deleteStudySet: (setId: string) => Promise<void>;
  updateStudySet: (setId: string, updates: Partial<StudySet>) => Promise<void>;
  setLocalStudySet: (studySet: StudySet) => void; // For guest mode

  // Progress Methods
  recordProgress: (progress: UserProgress) => Promise<void>;
  fetchUserProgress: (userId: string, setId: string) => Promise<void>;
  getExerciseProgress: (
    userId: string,
    exerciseId: string
  ) => Promise<UserProgress | null>;

  // Question Feedback Methods
  submitQuestionFeedback: (feedback: {
    exerciseId: string;
    userId: string;
    rating: FeedbackRating;
    reason?: FeedbackReason;
    questionText: string;
    questionType: ExerciseType;
    subject: string;
    openFeedback?: string;
  }) => Promise<void>;
  fetchGoodQuestionExamples: (subject: string, limit?: number) => Promise<QuestionFeedback[]>;
  fetchBadQuestionExamples: (subject: string, limit?: number) => Promise<QuestionFeedback[]>;
}

const useContentAndStudyStore = create<ContentAndStudyState>((set, get) => ({
  uploadedContents: [],
  currentContent: null,
  studySets: [],
  currentSet: null,
  localStudySets: [], // For guest mode
  userProgress: [],
  loading: false,
  error: null,

  // ============ CONTENT METHODS ============

  uploadContent: async (content) => {
    try {
      set({ loading: true, error: null });
      
      // Clean the data - remove undefined fields
      const cleanData = {
        userId: content.userId,
        fileName: content.fileName,
        fileType: content.fileType,
        fileUrl: content.fileUrl || '',
        title: content.title,
        description: content.description || '',
        subject: content.subject,
        uploadedAt: Date.now(),
        status: 'processing' as const,
      };
      
      const contentRef = await addDoc(collection(db, 'uploadedContents'), cleanData);
      
      set((state) => ({
        uploadedContents: [
          ...state.uploadedContents,
          { id: contentRef.id, ...cleanData },
        ],
      }));
      return contentRef.id;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      set({ error: errorMsg });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  fetchUserContents: async (userId) => {
    try {
      set({ loading: true, error: null });
      const q = query(
        collection(db, 'uploadedContents'),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      const contents = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as UploadedContent[];
      set({ uploadedContents: contents });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch contents';
      set({ error: errorMsg });
    } finally {
      set({ loading: false });
    }
  },

  fetchContent: async (contentId) => {
    try {
      set({ loading: true, error: null });
      const docRef = doc(db, 'uploadedContents', contentId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        set({ currentContent: { id: snapshot.id, ...snapshot.data() } as UploadedContent });
      } else {
        set({ error: 'Content not found' });
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch content';
      set({ error: errorMsg });
    } finally {
      set({ loading: false });
    }
  },

  deleteContent: async (contentId) => {
    try {
      set({ loading: true, error: null });
      // Delete content and associated study sets
      const docRef = doc(db, 'uploadedContents', contentId);
      const setsQuery = query(
        collection(db, 'studySets'),
        where('contentId', '==', contentId)
      );
      const setsSnapshot = await getDocs(setsQuery);

      const batch = writeBatch(db);
      batch.delete(docRef);
      setsSnapshot.docs.forEach((setDoc) => batch.delete(setDoc.ref));
      await batch.commit();

      // Update local state - remove content and associated study sets
      set((state) => ({
        uploadedContents: state.uploadedContents.filter((c) => c.id !== contentId),
        studySets: state.studySets.filter((s) => s.contentId !== contentId),
      }));
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to delete content';
      set({ error: errorMsg });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  updateContentStatus: async (contentId, status, error) => {
    try {
      const docRef = doc(db, 'uploadedContents', contentId);
      const updateData: any = { status };
      if (error) updateData.processingError = error;
      await updateDoc(docRef, updateData);

      set((state) => ({
        uploadedContents: state.uploadedContents.map((c) =>
          c.id === contentId ? { ...c, status, processingError: error } : c
        ),
      }));
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to update status';
      set({ error: errorMsg });
    }
  },

  // ============ STUDY SET METHODS ============

  createStudySet: async (studySet) => {
    try {
      set({ loading: true, error: null });
      
      // Log original exercises to see what we're getting
      console.log('Original exercises sample:', studySet.exercises?.[0]);
      
      // Clean the data - remove undefined fields
      const cleanExercises = (studySet.exercises || []).map((ex, idx) => {
        const cleaned = {
          id: ex.id || `ex-${idx}`,
          contentId: ex.contentId || studySet.contentId,
          type: ex.type || 'multiple-choice',
          question: ex.question || '',
          options: Array.isArray(ex.options) ? ex.options.filter(opt => opt !== undefined && opt !== null) : [],
          correctAnswer: ex.correctAnswer !== undefined && ex.correctAnswer !== null ? ex.correctAnswer : '',
          explanation: ex.explanation || '',
          difficulty: ex.difficulty || 'medium',
          topic: ex.topic || '',
          keywords: Array.isArray(ex.keywords) ? ex.keywords.filter(kw => kw !== undefined && kw !== null) : [],
        };
        
        return cleaned;
      });

      const cleanData = {
        userId: studySet.userId || '',
        contentId: studySet.contentId || '',
        title: studySet.title || '',
        description: studySet.description || '',
        subject: studySet.subject || '',
        exercises: cleanExercises,
        originalContent: studySet.originalContent || '', // Save the extracted text
        completedExercises: studySet.completedExercises || 0,
        totalExercises: studySet.totalExercises || 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      // Deep check for undefined
      const findUndefined = (obj: any, path = ''): string[] => {
        const problems: string[] = [];
        if (obj === undefined) {
          problems.push(path);
        } else if (Array.isArray(obj)) {
          obj.forEach((item, i) => {
            problems.push(...findUndefined(item, `${path}[${i}]`));
          });
        } else if (obj && typeof obj === 'object') {
          Object.entries(obj).forEach(([key, value]) => {
            if (value === undefined) {
              problems.push(`${path}.${key}`);
            } else {
              problems.push(...findUndefined(value, path ? `${path}.${key}` : key));
            }
          });
        }
        return problems;
      };
      
      const undefinedPaths = findUndefined(cleanData);
      if (undefinedPaths.length > 0) {
        console.error('Found undefined at:', undefinedPaths);
        throw new Error(`Undefined fields found: ${undefinedPaths.join(', ')}`);
      }
      
      console.log('Clean data validated, uploading to Firebase...');
      
      const setRef = await addDoc(collection(db, 'studySets'), cleanData);
      
      set((state) => ({
        studySets: [
          ...state.studySets,
          { id: setRef.id, ...cleanData },
        ],
      }));
      return setRef.id;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create study set';
      console.error('Error creating study set:', errorMsg, error);
      set({ error: errorMsg });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  fetchUserStudySets: async (userId) => {
    try {
      set({ loading: true, error: null });
      const q = query(collection(db, 'studySets'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const sets = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as StudySet[];
      set({ studySets: sets });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch study sets';
      set({ error: errorMsg });
    } finally {
      set({ loading: false });
    }
  },

  fetchStudySet: async (setId) => {
    try {
      set({ loading: true, error: null });
      console.log('fetchStudySet: looking for setId =', setId);
      console.log('fetchStudySet: localStudySets =', get().localStudySets.map(s => s.id));
      
      // First check if it's a local study set (guest mode)
      if (setId.startsWith('local-')) {
        const localSet = get().localStudySets.find(s => s.id === setId);
        console.log('fetchStudySet: found local set?', !!localSet, localSet ? { id: localSet.id, exercisesCount: localSet.exercises?.length } : null);
        if (localSet) {
          set({ currentSet: localSet, loading: false });
          return;
        }
      }
      
      // Otherwise fetch from Firebase
      const docRef = doc(db, 'studySets', setId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        set({ currentSet: { id: snapshot.id, ...snapshot.data() } as StudySet });
      } else {
        set({ error: 'Study set not found' });
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch study set';
      set({ error: errorMsg });
    } finally {
      set({ loading: false });
    }
  },

  setLocalStudySet: (studySet) => {
    set((state) => ({
      localStudySets: [...state.localStudySets, studySet],
      currentSet: studySet,
    }));
  },

  deleteStudySet: async (setId) => {
    try {
      set({ loading: true, error: null });
      
      // Handle local study sets (guest mode)
      if (setId.startsWith('local-')) {
        set((state) => ({
          localStudySets: state.localStudySets.filter((s) => s.id !== setId),
          loading: false,
        }));
        
        // Also update any courses that reference this study set
        useCourseStore.getState().removeLessonByStudySetId(setId);
        
        return;
      }
      
      const docRef = doc(db, 'studySets', setId);
      await deleteDoc(docRef);
      set((state) => ({
        studySets: state.studySets.filter((s) => s.id !== setId),
      }));
      
      // Also update any courses that reference this study set
      useCourseStore.getState().removeLessonByStudySetId(setId);
      
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to delete study set';
      set({ error: errorMsg });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  updateStudySet: async (setId, updates) => {
    try {
      const docRef = doc(db, 'studySets', setId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: Date.now(),
      });
      set((state) => ({
        studySets: state.studySets.map((s) =>
          s.id === setId ? { ...s, ...updates, updatedAt: Date.now() } : s
        ),
      }));
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to update study set';
      set({ error: errorMsg });
    }
  },

  // ============ PROGRESS METHODS ============

  recordProgress: async (progress) => {
    try {
      const progressRef = await addDoc(collection(db, 'userProgress'), progress);
      set((state) => ({
        userProgress: [...state.userProgress, { ...progress, id: progressRef.id }],
      }));
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to record progress';
      set({ error: errorMsg });
    }
  },

  fetchUserProgress: async (userId, setId) => {
    try {
      set({ loading: true, error: null });
      const q = query(
        collection(db, 'userProgress'),
        where('userId', '==', userId),
        where('setId', '==', setId)
      );
      const snapshot = await getDocs(q);
      const progress = snapshot.docs.map((doc) => ({
        ...doc.data(),
      })) as UserProgress[];
      set({ userProgress: progress });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch progress';
      set({ error: errorMsg });
    } finally {
      set({ loading: false });
    }
  },

  getExerciseProgress: async (userId, exerciseId) => {
    try {
      const q = query(
        collection(db, 'userProgress'),
        where('userId', '==', userId),
        where('exerciseId', '==', exerciseId)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return snapshot.docs[0].data() as UserProgress;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch exercise progress';
      set({ error: errorMsg });
      return null;
    }
  },

  // ============ QUESTION FEEDBACK METHODS ============

  submitQuestionFeedback: async (feedback) => {
    try {
      const feedbackData: Omit<QuestionFeedback, 'id'> = {
        exerciseId: feedback.exerciseId,
        userId: feedback.userId,
        rating: feedback.rating,
        questionText: feedback.questionText,
        questionType: feedback.questionType,
        subject: feedback.subject,
        createdAt: Date.now(),
      };

      // Only include reason if it exists (for 'bad' ratings)
      if (feedback.reason) {
        feedbackData.reason = feedback.reason;
      }

      // Include open feedback if provided
      if (feedback.openFeedback) {
        feedbackData.openFeedback = feedback.openFeedback;
      }

      await addDoc(collection(db, 'questionFeedback'), feedbackData);
      console.log('Question feedback submitted:', feedback.rating);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to submit feedback';
      console.error('Error submitting feedback:', errorMsg);
    }
  },

  fetchGoodQuestionExamples: async (subject, limit = 5) => {
    try {
      // Fetch questions with positive feedback for the given subject
      const q = query(
        collection(db, 'questionFeedback'),
        where('rating', '==', 'good'),
        where('subject', '==', subject)
      );
      const snapshot = await getDocs(q);
      
      const goodExamples = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as QuestionFeedback))
        .slice(0, limit);
      
      return goodExamples;
    } catch (error: unknown) {
      console.error('Error fetching good examples:', error);
      return [];
    }
  },

  fetchBadQuestionExamples: async (subject: string, limit: number = 5) => {
    try {
      // Fetch questions with negative feedback for the given subject
      const q = query(
        collection(db, 'questionFeedback'),
        where('rating', '==', 'bad'),
        where('subject', '==', subject)
      );
      const snapshot = await getDocs(q);
      
      const badExamples = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as QuestionFeedback))
        .slice(0, limit);
      
      return badExamples;
    } catch (error: unknown) {
      console.error('Error fetching bad examples:', error);
      return [];
    }
  },
}));

export { useContentAndStudyStore };
