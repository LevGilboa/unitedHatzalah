import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useContentAndStudyStore } from '@/stores/contentAndStudyStore';
import { useAuthStore } from '@/stores/authStore';
import useCourseStore from '@/stores/courseStore';
import { StudySet } from '@/types/ai-learning';
import { CustomCourse, Lesson } from '@/types/data';
import {
  COVER_COLORS,
  createLessonFromStudySet,
} from '@/services/ExerciseConverter';

interface CreateCourseModalProps {
  visible: boolean;
  onClose: () => void;
  onCourseCreated: (courseId: string) => void;
}

export default function CreateCourseModal({
  visible,
  onClose,
  onCourseCreated,
}: CreateCourseModalProps) {
  const [courseTitle, setCourseTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(COVER_COLORS[0]);
  const [selectedStudySets, setSelectedStudySets] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const user = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);
  const { studySets, localStudySets } = useContentAndStudyStore();
  const { createLocalCourse, createCourse } = useCourseStore();

  // Use local study sets for guests, Firebase study sets for authenticated users
  const availableStudySets = isGuest ? localStudySets : studySets;

  const toggleStudySet = (id: string) => {
    setSelectedStudySets((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (selectedStudySets.length === 0) {
      Alert.alert('שגיאה', 'נא לבחור לפחות קובץ אחד');
      return;
    }

    setIsCreating(true);
    
    // Auto-generate course title if not provided
    let finalCourseTitle = courseTitle.trim();
    if (!finalCourseTitle) {
      const selected = availableStudySets.filter((s) => selectedStudySets.includes(s.id!));
      if (selected.length === 1) {
        finalCourseTitle = `קורס: ${selected[0].title}`;
      } else if (selected.length > 1) {
        finalCourseTitle = `קורס משולב (${selected.length} נושאים)`;
      } else {
        finalCourseTitle = `קורס חדש ${new Date().toLocaleDateString('he-IL')}`;
      }
    }

    try {
      // Get selected study sets with their content
      const selected = availableStudySets.filter((s) =>
        selectedStudySets.includes(s.id!)
      );

      // Create lessons from study sets - store originalContent for dynamic generation
      const lessons: Omit<Lesson, 'id'>[] = selected.map((studySet, index) =>
        createLessonFromStudySet(
          studySet.id!,
          studySet.title,
          studySet.exercises,
          index,
          studySet.originalContent, // Pass original content for regeneration
          studySet.subject
        )
      );

      const courseData: Omit<CustomCourse, 'id'> = {
        title: finalCourseTitle,
        description: `קורס מותאם אישית עם ${lessons.length} שיעורים`,
        coverColor: selectedColor,
        isCustom: true,
        userId: user?.email || 'guest',
        createdAt: Date.now(),
        studySetIds: selectedStudySets,
        lessons: lessons as Lesson[],
      };

      let courseId: string;

      if (isGuest) {
        // For guests, create locally only
        courseId = createLocalCourse(courseData);
      } else {
        // For authenticated users, save to Firebase
        courseId = await createCourse(courseData, lessons as Omit<Lesson, 'id'>[]);
      }

      // Reset form
      setCourseTitle('');
      setSelectedStudySets([]);
      setSelectedColor(COVER_COLORS[0]);

      onCourseCreated(courseId);
      onClose();

      if (Platform.OS === 'web') {
        alert(`הקורס "${finalCourseTitle}" נוצר בהצלחה!`);
      } else {
        Alert.alert('הצלחה', `הקורס "${finalCourseTitle}" נוצר בהצלחה!`);
      }
    } catch (error) {
      console.error('Error creating course:', error);
      Alert.alert('שגיאה', 'אירעה שגיאה ביצירת הקורס');
    } finally {
      setIsCreating(false);
    }
  };

  const renderStudySetItem = (item: StudySet) => {
    const isSelected = selectedStudySets.includes(item.id!);
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.studySetItem, isSelected && styles.studySetItemSelected]}
        onPress={() => toggleStudySet(item.id!)}
      >
        <View style={styles.studySetInfo}>
          <Text style={styles.studySetTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.studySetMeta}>
            {item.exercises.length} תרגילים • {item.subject}
          </Text>
        </View>
        <View
          style={[
            styles.checkbox,
            isSelected && styles.checkboxSelected,
          ]}
        >
          {isSelected && (
            <Ionicons name="checkmark" size={16} color="white" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>יצירת קורס חדש</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Course Title */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>שם הקורס (אופציונלי)</Text>
            <TextInput
              style={styles.input}
              value={courseTitle}
              onChangeText={setCourseTitle}
              placeholder="השאר ריק ליצירה אוטומטית..."
              placeholderTextColor={Colors.gray}
            />
          </View>

          {/* Cover Color */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>צבע כריכה</Text>
            <View style={styles.colorGrid}>
              {COVER_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setSelectedColor(color)}
                >
                  {selectedColor === color && (
                    <Ionicons name="checkmark" size={20} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Course Preview */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>תצוגה מקדימה</Text>
            <View style={[styles.coursePreview, { backgroundColor: selectedColor }]}>
              <Text style={styles.previewTitle}>
                {courseTitle || 'שם הקורס'}
              </Text>
              <Text style={styles.previewSubtitle}>
                {selectedStudySets.length} שיעורים נבחרו
              </Text>
            </View>
          </View>

          {/* Select Study Sets */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>בחר קבצים לקורס</Text>
            {availableStudySets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-outline" size={40} color={Colors.gray} />
                <Text style={styles.emptyText}>
                  אין לך קבצים עדיין.{'\n'}העלה קבצים בטאב "העלאה" כדי ליצור קורס.
                </Text>
              </View>
            ) : (
              <View style={styles.studySetList}>
                {availableStudySets.map(renderStudySetItem)}
              </View>
            )}
          </View>

          {/* Guest Warning */}
          {isGuest && (
            <View style={styles.guestWarning}>
              <Ionicons name="information-circle" size={20} color="#FF9800" />
              <Text style={styles.guestWarningText}>
                כאורח, הקורס יישמר רק עד שתסגור את האפליקציה.
                התחבר כדי לשמור לצמיתות!
              </Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Create Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.createButton,
              selectedStudySets.length === 0 &&
                styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={selectedStudySets.length === 0 || isCreating}
          >
            {isCreating ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="add-circle" size={20} color="white" />
                <Text style={styles.createButtonText}>צור קורס</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 12,
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    textAlign: 'right',
    color: Colors.textDark,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  coursePreview: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  previewSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  studySetList: {
    gap: 10,
  },
  studySetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  studySetItemSelected: {
    borderColor: Colors.accent,
    backgroundColor: `${Colors.accent}10`,
  },
  studySetInfo: {
    flex: 1,
  },
  studySetTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
    textAlign: 'right',
  },
  studySetMeta: {
    fontSize: 12,
    color: Colors.gray,
    marginTop: 4,
    textAlign: 'right',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  checkboxSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  guestWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
    gap: 8,
  },
  guestWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#F57C00',
    textAlign: 'right',
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  createButtonDisabled: {
    backgroundColor: Colors.gray,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
