import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  I18nManager,
  FlatList,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useContentAndStudyStore } from '@/stores/contentAndStudyStore';
import { useAuthStore } from '@/stores/authStore';
import { UploadedContent, StudySet } from '@/types/ai-learning';
import { Modal } from 'react-native';

I18nManager.forceRTL(true);

export default function MyContent() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);
  const {
    uploadedContents,
    studySets,
    localStudySets,
    loading,
    fetchUserContents,
    fetchUserStudySets,
    deleteContent,
    deleteStudySet,
  } = useContentAndStudyStore();

  // Delete modal state
  const [deleteModalVisible, setDeleteModalVisible] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<{id: string; title: string; type: 'content' | 'studyset' | 'multiple'} | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Selection state
  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedContents, setSelectedContents] = React.useState<Set<string>>(new Set());
  const [selectedStudySets, setSelectedStudySets] = React.useState<Set<string>>(new Set());

  // For guests, use localStudySets; for authenticated users, use studySets from Firebase
  const displayStudySets = isGuest ? localStudySets : studySets;

  useEffect(() => {
    // Only fetch from Firebase for authenticated users
    if (user?.email && !isGuest) {
      loadContent();
    }
  }, [user, isGuest]);

  const loadContent = async () => {
    if (user?.email && !isGuest) {
      await fetchUserContents(user.email);
      await fetchUserStudySets(user.email);
    }
  };

  const handleDeleteContent = (contentId: string, title: string) => {
    setItemToDelete({ id: contentId, title, type: 'content' });
    setDeleteModalVisible(true);
  };

  const handleDeleteStudySet = (setId: string, title: string) => {
    setItemToDelete({ id: setId, title, type: 'studyset' });
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    setDeleting(true);
    try {
      if (itemToDelete.type === 'multiple') {
        for (const id of Array.from(selectedContents)) {
          await deleteContent(id);
        }
        for (const id of Array.from(selectedStudySets)) {
          await deleteStudySet(id);
        }
        setIsSelectionMode(false);
        setSelectedContents(new Set());
        setSelectedStudySets(new Set());
      } else if (itemToDelete.type === 'content') {
        await deleteContent(itemToDelete.id);
      } else {
        await deleteStudySet(itemToDelete.id);
      }
      setDeleteModalVisible(false);
      setItemToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
      const errorMsg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא הצלח למחוק: ${errorMsg}`);
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteModalVisible(false);
    setItemToDelete(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Ionicons name="hourglass" size={16} color="#FF9800" />;
      case 'completed':
        return <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />;
      case 'failed':
        return <Ionicons name="close-circle" size={16} color="#f44336" />;
      default:
        return <Ionicons name="help-circle" size={16} color={Colors.gray} />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'processing':
        return 'בעיבוד';
      case 'completed':
        return 'הושלם';
      case 'failed':
        return 'נכשל';
      default:
        return 'לא ידוע';
    }
  };

  const toggleContentSelection = (id: string) => {
    const newSet = new Set(selectedContents);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedContents(newSet);
  };

  const toggleStudySetSelection = (id: string) => {
    const newSet = new Set(selectedStudySets);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedStudySets(newSet);
  };

  const handleDeleteSelected = () => {
    if (selectedContents.size === 0 && selectedStudySets.size === 0) return;
    setItemToDelete({
      id: 'multiple',
      title: `${selectedContents.size + selectedStudySets.size} פריטים`,
      type: 'multiple'
    });
    setDeleteModalVisible(true);
  };

  const renderContentItem = (item: UploadedContent) => {
    const isSelected = selectedContents.has(item.id);
    return (
    <TouchableOpacity
      activeOpacity={isSelectionMode ? 0.7 : 1}
      onPress={() => isSelectionMode ? toggleContentSelection(item.id) : null}
      onLongPress={() => {
        if (!isSelectionMode) {
          setIsSelectionMode(true);
          toggleContentSelection(item.id);
        }
      }}
      style={[
        styles.contentCard,
        isSelectionMode && isSelected && styles.selectedCard
      ]}
    >
      {isSelectionMode && (
        <View style={styles.checkboxContainer}>
          <Ionicons name={isSelected ? "checkmark-circle" : "ellipse-outline"} size={26} color={isSelected ? Colors.accent : Colors.gray} />
        </View>
      )}
      <View style={[styles.cardHeader, isSelectionMode && { paddingRight: 36 }]}>
        <View style={styles.cardTitle}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.subject}>{item.subject}</Text>
        </View>
        <View style={styles.statusBadge}>
          {getStatusIcon(item.status)}
          <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
        </View>
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="document" size={14} color={Colors.gray} />
          <Text style={styles.detailText}>
            {item.fileType === 'pdf'
              ? 'PDF'
              : item.fileType === 'text'
              ? 'טקסט'
              : item.fileType === 'document'
              ? 'מסמך'
              : 'תמונה'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="calendar" size={14} color={Colors.gray} />
          <Text style={styles.detailText}>
            {new Date(item.uploadedAt).toLocaleDateString('he-IL')}
          </Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        {!isSelectionMode && (
          <>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                // Find related study set
                const relatedSet = displayStudySets?.find((s) => s.contentId === item.id);
                if (relatedSet) {
                  router.push(`/study-set?setId=${relatedSet.id}`);
                } else {
                  Alert.alert('הודעה', 'עדיין לא נוצרו תרגילים לקובץ זה');
                }
              }}
            >
              <Ionicons name="play-circle" size={18} color={Colors.accent} />
              <Text style={styles.actionButtonText}>לימוד</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => handleDeleteContent(item.id, item.title)}
            >
              <Ionicons name="trash" size={18} color="#f44336" />
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>מחק</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
  )};

  const renderStudySetItem = (item: StudySet) => {
    const isSelected = selectedStudySets.has(item.id);
    return (
    <TouchableOpacity
      activeOpacity={isSelectionMode ? 0.7 : 1}
      onPress={() => isSelectionMode ? toggleStudySetSelection(item.id) : null}
      onLongPress={() => {
        if (!isSelectionMode) {
          setIsSelectionMode(true);
          toggleStudySetSelection(item.id);
        }
      }}
      style={[
        styles.contentCard,
        isSelectionMode && isSelected && styles.selectedCard
      ]}
    >
      {isSelectionMode && (
        <View style={styles.checkboxContainer}>
          <Ionicons name={isSelected ? "checkmark-circle" : "ellipse-outline"} size={26} color={isSelected ? Colors.accent : Colors.gray} />
        </View>
      )}
      <View style={[styles.cardHeader, isSelectionMode && { paddingRight: 36 }]}>
        <View style={styles.cardTitle}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.subject}>{item.subject}</Text>
        </View>
        <View style={styles.exerciseCount}>
          <Ionicons name="list" size={16} color={Colors.accent} />
          <Text style={styles.countText}>{item.exercises?.length || 0}</Text>
        </View>
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.gray} />
          <Text style={styles.detailText}>
            נענו {item.completedExercises || 0} מתוך {item.totalExercises}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="calendar" size={14} color={Colors.gray} />
          <Text style={styles.detailText}>
            {new Date(item.createdAt).toLocaleDateString('he-IL')}
          </Text>
        </View>
      </View>

      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${((item.completedExercises || 0) / (item.totalExercises || 1)) * 100}%`,
            },
          ]}
        />
      </View>

      <View style={styles.cardActions}>
        {!isSelectionMode && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => handleDeleteStudySet(item.id, item.title)}
            >
              <Ionicons name="trash" size={18} color="#f44336" />
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>מחק</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/study-set?setId=${item.id}`)}
            >
              <Ionicons name="play-circle" size={18} color={Colors.accent} />
              <Text style={styles.actionButtonText}>ללמוד</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
  )};

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>טוען את הקבצים שלך...</Text>
      </View>
    );
  }

  const hasContent = !isGuest && uploadedContents && uploadedContents.length > 0;
  const hasStudySets = displayStudySets && displayStudySets.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>הקבצים שלי</Text>
          <Text style={styles.headerSubtitle}>צפה בכל הקבצים והתרגילים שלך</Text>
        </View>
        {(hasContent || hasStudySets) && (
          <TouchableOpacity 
            style={styles.selectModeButton}
            onPress={() => {
              if (isSelectionMode) {
                setIsSelectionMode(false);
                setSelectedContents(new Set());
                setSelectedStudySets(new Set());
              } else {
                setIsSelectionMode(true);
              }
            }}
          >
            <Text style={styles.selectModeText}>
              {isSelectionMode ? 'ביטול בחירה' : 'בחירה מרובה'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Selection Action Bar */}
      {isSelectionMode && (selectedContents.size > 0 || selectedStudySets.size > 0) && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>
            נבחרו {selectedContents.size + selectedStudySets.size} פריטים
          </Text>
          <TouchableOpacity 
            style={styles.bulkDeleteButton}
            onPress={handleDeleteSelected}
          >
            <Ionicons name="trash" size={18} color="white" />
            <Text style={styles.bulkDeleteText}>מחק נבחרים</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Uploaded Contents Section */}
      {hasContent && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text" size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>קבצים שהעלויו ({uploadedContents.length})</Text>
          </View>
          {uploadedContents.map((item) => (
            <React.Fragment key={item.id}>
              {renderContentItem(item)}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Study Sets Section */}
      {hasStudySets && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="school" size={20} color={Colors.accent} />
            <Text style={styles.sectionTitle}>מערכות תרגול ({displayStudySets.length})</Text>
          </View>
          {displayStudySets.map((item) => (
            <React.Fragment key={item.id}>
              {renderStudySetItem(item)}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Empty State */}
      {!hasContent && !hasStudySets && (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-outline" size={80} color={Colors.lightGray} />
          <Text style={styles.emptyTitle}>אין לך קבצים עדיין</Text>
          <Text style={styles.emptyText}>
            העלה קבצים או טקסט בטאב "העלאה" כדי להתחיל ללמוד
          </Text>
          {isGuest && (
            <Text style={styles.guestWarning}>
              💡 שים לב: כאורח, הקבצים שלך יישמרו רק עד שתסגור את האפליקציה.
              התחבר כדי לשמור לצמיתות!
            </Text>
          )}
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push('/(tabs)/upload')}
          >
            <Ionicons name="cloud-upload" size={20} color="white" />
            <Text style={styles.emptyButtonText}>העלה קובץ</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <View style={styles.deleteIconContainer}>
              <Ionicons name="trash" size={40} color="#f44336" />
            </View>
            <Text style={styles.deleteModalTitle}>מחיקת {itemToDelete?.type === 'content' ? 'קובץ' : 'מערכת תרגול'}</Text>
            <Text style={styles.deleteModalText}>
              האם אתה בטוח שברצונך למחוק את "{itemToDelete?.title}"?
            </Text>
            <Text style={styles.deleteModalWarning}>
              פעולה זו לא ניתנת לביטול
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={cancelDelete}
                disabled={deleting}
              >
                <Text style={styles.cancelButtonText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.confirmDeleteButton} 
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>אישור</Text>
                )}
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
    paddingBottom: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  selectModeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 16,
  },
  selectModeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.accent,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFF3E0',
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  selectionCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.accent,
  },
  bulkDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  bulkDeleteText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.gray,
    marginTop: 4,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
  contentCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
  },
  selectedCard: {
    borderColor: Colors.accent,
    backgroundColor: '#FAF9Fe', // faint highlight
  },
  checkboxContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  subject: {
    fontSize: 12,
    color: Colors.gray,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    color: Colors.gray,
    fontWeight: '500',
  },
  exerciseCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
  },
  countText: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
  },
  cardDetails: {
    gap: 6,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 11,
    color: Colors.gray,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.lightGray,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    gap: 4,
  },
  deleteButton: {
    borderColor: '#f44336',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent,
  },
  deleteButtonText: {
    color: '#f44336',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    gap: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  errorContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#f44336',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f44336',
    borderRadius: 6,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  loadingText: {
    fontSize: 14,
    color: Colors.gray,
    marginTop: 12,
  },
  guestWarning: {
    fontSize: 13,
    color: '#FF9800',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  deleteIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginBottom: 12,
    textAlign: 'center',
  },
  deleteModalText: {
    fontSize: 15,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  deleteModalWarning: {
    fontSize: 13,
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  confirmDeleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f44336',
    alignItems: 'center',
  },
  confirmDeleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
});
