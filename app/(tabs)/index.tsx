import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import LessonTree from '@/components/Course/LessonTree';
import ScrollToTopContainer from '@/components/ui/ScrollToTopContainer';
import useCourseStore from '@/stores/courseStore';
import AppLoading from '@/components/AppLoading';
import AppError from '@/components/AppError';
import NoItem from '@/components/NoItem';
import CourseCard from '@/components/Course/CourseCard';
import CreateCourseModal from '@/components/Course/CreateCourseModal';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { isCustomCourse } from '@/types/data';

export default function Learning() {
  const router = useRouter();
  const { courses, localCourses, loading, error, fetchAllCourses } = useCourseStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchAllCourses();
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

  return (
    <>
      <ScrollToTopContainer>
        {/* Create Course Button */}
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add-circle" size={24} color="white" />
          <Text style={styles.createButtonText}>יצירת קורס חדש</Text>
        </TouchableOpacity>

        {/* Custom Courses Section */}
        {localCourses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>הקורסים שלי</Text>
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
        {allCourses.length === 0 && (
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginHorizontal: 16,
    marginBottom: 8,
    textAlign: 'right',
  },
});