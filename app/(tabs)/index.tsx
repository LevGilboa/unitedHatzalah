import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import LessonTree from '@/components/Course/LessonTree';
import ScrollToTopContainer from '@/components/ui/ScrollToTopContainer';
import useCourseStore from '@/stores/courseStore';
import { useCompleteCourseStore } from '@/stores/completeCourseStore';
import AppLoading from '@/components/AppLoading';
import AppError from '@/components/AppError';
import NoItem from '@/components/NoItem';
import CourseCard from '@/components/Course/CourseCard';
import CreateCourseModal from '@/components/Course/CreateCourseModal';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { isCustomCourse } from '@/types/data';
import CookieDisplay from '@/components/ui/CookieDisplay';
import { useCookieStore } from '@/stores/cookieStore';

export default function Learning() {
  const router = useRouter();
  const { courses, localCourses, loading, error, fetchAllCourses } = useCourseStore();
  const { completeCourses, getCourseProgress, deleteCompleteCourse } = useCompleteCourseStore();
  const { checkDailyStreak } = useCookieStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchAllCourses();
    checkDailyStreak(); // Check and reward daily login
  }, [fetchAllCourses]);

  const handleCourseCreated = (courseId: string) => {
    // Navigate to the new course
    router.push(`/course/${courseId}`);
  };

  if (loading) return <AppLoading />;
  if (error) return <AppError error={error} />;

  // Combine Firebase courses with local courses
  const allCourses = [
    ...(courses || []),
    ...localCourses,
  ];

  const hasAnyCourses = allCourses.length > 0 || completeCourses.length > 0;

  return (
    <>
      <ScrollToTopContainer>
        {/* Cookie Display */}
        <View style={styles.cookieHeader}>
          <CookieDisplay size="medium" />
        </View>

        {/* Create Course Button */}
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add-circle" size={24} color="white" />
          <Text style={styles.createButtonText}>יצירת קורס חדש</Text>
        </TouchableOpacity>

        {/* Complete Courses Section (5-phase courses) */}
        {completeCourses.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="school" size={22} color={Colors.purple} />
              <Text style={styles.sectionTitle}>קורסים מלאים (5 שלבים)</Text>
            </View>
            {completeCourses.map((course) => {
              const progress = getCourseProgress(course.id);
              const phaseLabels = ['📖', '📝', '🧠', '🔄', '🏆'];
              return (
                <TouchableOpacity
                  key={course.id}
                  style={styles.completeCourseCard}
                  onPress={() => router.push({
                    pathname: '/complete-course' as any,
                    params: { courseId: course.id },
                  })}
                  activeOpacity={0.7}
                >
                  <View style={styles.completeCourseHeader}>
                    <View style={styles.completeCourseInfo}>
                      <Text style={styles.completeCourseTitle} numberOfLines={1}>
                        {course.title}
                      </Text>
                      <Text style={styles.completeCourseSubject}>{course.subject}</Text>
                    </View>
                    {course.status === 'completed' ? (
                      <View style={styles.completedBadge}>
                        <Text style={styles.completedBadgeText}>🏆 הושלם</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          deleteCompleteCourse(course.id);
                        }}
                      >
                        <Ionicons name="trash-outline" size={18} color={Colors.gray} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Progress Bar */}
                  <View style={styles.completeCourseProgress}>
                    <View style={styles.completeCourseProgressBar}>
                      <View style={[
                        styles.completeCourseProgressFill,
                        { width: `${progress.percentage}%` }
                      ]} />
                    </View>
                    <Text style={styles.completeCourseProgressText}>
                      {progress.percentage}%
                    </Text>
                  </View>

                  {/* Phase indicators */}
                  <View style={styles.phaseIndicators}>
                    {course.phases.map((phase, idx) => (
                      <View
                        key={phase.id}
                        style={[
                          styles.phaseIndicator,
                          phase.isCompleted && styles.phaseIndicatorCompleted,
                          phase.isLocked && styles.phaseIndicatorLocked,
                        ]}
                      >
                        <Text style={styles.phaseIndicatorText}>
                          {phase.isCompleted ? '✓' : phase.isLocked ? '🔒' : phaseLabels[idx]}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.completeCourseStats}>
                    <Text style={styles.completeCourseStatText}>
                      {course.totalExercises} שאלות · {progress.completed}/{progress.total} שלבים
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Custom Courses Section */}
        {localCourses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitleSimple}>הקורסים שלי</Text>
            {localCourses.map((course) => (
              <CourseCard
                key={course.id}
                id={course.id}
                title={course.title}
                description={course.description}
                coverColor={course.coverColor}
                isCustom={true}
              />
            ))}
          </View>
        )}

        {/* Firebase Courses Section - HIDDEN */}
        {/* Users must upload files first to create courses - no default courses */}

        {/* Empty State */}
        {!hasAnyCourses && (
          <NoItem text={'אין קורסים כרגע. צור קורס חדש!'} />
        )}
      </ScrollToTopContainer>

      {/* Create Course Modal */}
      <CreateCourseModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCourseCreated={handleCourseCreated}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cookieHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
    textAlign: 'right',
  },
  sectionTitleSimple: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginHorizontal: 16,
    marginBottom: 8,
    textAlign: 'right',
  },
  // Complete Course Card styles
  completeCourseCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(130, 80, 220, 0.1)',
  },
  completeCourseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  completeCourseInfo: {
    flex: 1,
  },
  completeCourseTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textDark,
    textAlign: 'right',
  },
  completeCourseSubject: {
    fontSize: 13,
    color: Colors.gray,
    textAlign: 'right',
    marginTop: 2,
  },
  completedBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.success,
  },
  deleteButton: {
    padding: 4,
  },
  completeCourseProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  completeCourseProgressBar: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
  },
  completeCourseProgressFill: {
    height: '100%',
    backgroundColor: Colors.purple,
    borderRadius: 4,
  },
  completeCourseProgressText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.purple,
    minWidth: 40,
    textAlign: 'center',
  },
  phaseIndicators: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
  },
  phaseIndicator: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3EFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.purple,
  },
  phaseIndicatorCompleted: {
    backgroundColor: '#E8F5E9',
    borderColor: Colors.success,
  },
  phaseIndicatorLocked: {
    backgroundColor: Colors.lightGray,
    borderColor: 'transparent',
    opacity: 0.6,
  },
  phaseIndicatorText: {
    fontSize: 14,
  },
  completeCourseStats: {
    alignItems: 'flex-end',
  },
  completeCourseStatText: {
    fontSize: 12,
    color: Colors.gray,
  },
});