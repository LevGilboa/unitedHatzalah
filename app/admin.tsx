import React, { useState, useEffect } from 'react';
import * as reactNative from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { isAdmin } from '@/constants/AdminConfig';
import { useAuthStore } from '@/stores/authStore';
import { useContentAndStudyStore } from '@/stores/contentAndStudyStore';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/configs/FirebaseConfig';
import { StudySet } from '@/types/ai-learning';

reactNative.I18nManager.forceRTL(true);

interface ContentItem {
  id: string;
  title: string;
  subject: string;
  userId: string;
  originalContent?: string;
  createdAt: number;
  totalExercises: number;
}

export default function AdminPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ContentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Check if user is admin
  const userIsAdmin = isAdmin(user?.email);

  useEffect(() => {
    if (!userIsAdmin) {
      reactNative.Alert.alert('אין הרשאה', 'אין לך הרשאות גישה לעמוד זה');
      router.back();
      return;
    }
    fetchAllContents();
  }, [userIsAdmin]);

  const fetchAllContents = async () => {
    try {
      setLoading(true);
      
      // Fetch all study sets
      const studySetsRef = collection(db, 'studySets');
      const q = query(studySetsRef, orderBy('createdAt', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      
      const items: ContentItem[] = snapshot.docs.map((doc) => {
        const data = doc.data() as StudySet;
        return {
          id: doc.id,
          title: data.title || 'ללא כותרת',
          subject: data.subject || 'לא מוגדר',
          userId: data.userId || 'unknown',
          originalContent: data.originalContent,
          createdAt: data.createdAt || 0,
          totalExercises: data.totalExercises || 0,
        };
      });
      
      setContents(items);
    } catch (error) {
      console.error('Error fetching contents:', error);
      reactNative.Alert.alert('שגיאה', 'לא הצלחנו לטעון את התוכן');
    } finally {
      setLoading(false);
    }
  };

  const handleViewContent = (item: ContentItem) => {
    setSelectedContent(item);
    setEditedContent(item.originalContent || '(אין תוכן מחולץ)');
    setShowEditModal(true);
  };

  const handleSaveContent = async () => {
    if (!selectedContent) return;
    
    try {
      setSaving(true);
      
      // Update in Firestore
      const docRef = doc(db, 'studySets', selectedContent.id);
      await updateDoc(docRef, {
        originalContent: editedContent,
        updatedAt: Date.now(),
      });
      
      // Update local state
      setContents(prev => 
        prev.map(c => 
          c.id === selectedContent.id 
            ? { ...c, originalContent: editedContent }
            : c
        )
      );
      
      reactNative.Alert.alert('הצלחה', 'התוכן נשמר בהצלחה');
      setShowEditModal(false);
    } catch (error) {
      console.error('Error saving content:', error);
      reactNative.Alert.alert('שגיאה', 'לא הצלחנו לשמור את התוכן');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContent = (item: ContentItem) => {
    setItemToDelete(item);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      setDeleting(true);
      const docRef = doc(db, 'studySets', itemToDelete.id);
      await deleteDoc(docRef);
      
      // Remove from local state
      setContents(prev => prev.filter(c => c.id !== itemToDelete.id));
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting content:', error);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'לא ידוע';
    return new Date(timestamp).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!userIsAdmin) {
    return (
      <reactNative.View style={styles.container}>
        <reactNative.Text style={styles.errorText}>אין לך הרשאות גישה לעמוד זה</reactNative.Text>
      </reactNative.View>
    );
  }

  if (loading) {
    return (
      <reactNative.View style={styles.loadingContainer}>
        <reactNative.ActivityIndicator size="large" color={Colors.primary} />
        <reactNative.Text style={styles.loadingText}>טוען תוכן...</reactNative.Text>
      </reactNative.View>
    );
  }

  return (
    <reactNative.View style={styles.container}>
      {/* Header */}
      <reactNative.View style={styles.header}>
        <reactNative.TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-forward" size={24} color={Colors.white} />
        </reactNative.TouchableOpacity>
        <reactNative.Text style={styles.headerTitle}>ניהול תוכן מחולץ</reactNative.Text>
        <reactNative.TouchableOpacity onPress={fetchAllContents} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color={Colors.white} />
        </reactNative.TouchableOpacity>
      </reactNative.View>

      {/* Stats */}
      <reactNative.View style={styles.statsContainer}>
        <reactNative.View style={styles.statBox}>
          <reactNative.Text style={styles.statNumber}>{contents.length}</reactNative.Text>
          <reactNative.Text style={styles.statLabel}>סה"כ תכנים</reactNative.Text>
        </reactNative.View>
        <reactNative.View style={styles.statBox}>
          <reactNative.Text style={styles.statNumber}>
            {contents.filter(c => c.originalContent).length}
          </reactNative.Text>
          <reactNative.Text style={styles.statLabel}>עם תוכן מחולץ</reactNative.Text>
        </reactNative.View>
      </reactNative.View>

      {/* Content List */}
      <reactNative.ScrollView style={styles.listContainer}>
        {contents.map((item) => (
          <reactNative.View key={item.id} style={styles.contentItemContainer}>
            <reactNative.TouchableOpacity
              style={styles.contentItem}
              onPress={() => handleViewContent(item)}
            >
              <reactNative.View style={styles.contentHeader}>
                <reactNative.Text style={styles.contentTitle}>{item.title}</reactNative.Text>
                <reactNative.View style={[styles.contentActions]}>
                  <reactNative.View style={[
                    styles.statusBadge,
                    item.originalContent ? styles.statusGreen : styles.statusRed
                  ]}>
                    <reactNative.Text style={styles.statusText}>
                      {item.originalContent ? 'יש תוכן' : 'אין תוכן'}
                    </reactNative.Text>
                  </reactNative.View>
                </reactNative.View>
              </reactNative.View>
              <reactNative.Text style={styles.contentSubject}>נושא: {item.subject}</reactNative.Text>
              <reactNative.Text style={styles.contentMeta}>
                {item.totalExercises} תרגילים | {formatDate(item.createdAt)}
              </reactNative.Text>
              {item.originalContent && (
                <reactNative.Text style={styles.contentPreview} numberOfLines={2}>
                  {item.originalContent.slice(0, 150)}...
                </reactNative.Text>
              )}
            </reactNative.TouchableOpacity>
            <reactNative.TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteContent(item)}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
            </reactNative.TouchableOpacity>
          </reactNative.View>
        ))}
      </reactNative.ScrollView>

      {/* Delete Confirmation Modal */}
      <reactNative.Modal
        visible={!!itemToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setItemToDelete(null)}
      >
        <reactNative.View style={styles.deleteModalOverlay}>
          <reactNative.View style={styles.deleteModalContent}>
            <reactNative.View style={styles.deleteIconContainer}>
              <Ionicons name="trash" size={40} color="#e74c3c" />
            </reactNative.View>
            <reactNative.Text style={styles.deleteModalTitle}>מחיקת תוכן</reactNative.Text>
            <reactNative.Text style={styles.deleteModalText}>
              האם אתה בטוח שברצונך למחוק את "{itemToDelete?.title}"?
            </reactNative.Text>
            <reactNative.Text style={styles.deleteModalWarning}>
              פעולה זו אינה ניתנת לביטול
            </reactNative.Text>
            <reactNative.View style={styles.deleteModalButtons}>
              <reactNative.TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setItemToDelete(null)}
              >
                <reactNative.Text style={styles.cancelButtonText}>ביטול</reactNative.Text>
              </reactNative.TouchableOpacity>
              <reactNative.TouchableOpacity
                style={styles.confirmDeleteButton}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <reactNative.ActivityIndicator size="small" color="#fff" />
                ) : (
                  <reactNative.Text style={styles.confirmDeleteButtonText}>מחק</reactNative.Text>
                )}
              </reactNative.TouchableOpacity>
            </reactNative.View>
          </reactNative.View>
        </reactNative.View>
      </reactNative.Modal>

      {/* Edit Modal */}
      <reactNative.Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <reactNative.View style={styles.modalContainer}>
          <reactNative.View style={styles.modalHeader}>
            <reactNative.TouchableOpacity onPress={() => setShowEditModal(false)}>
              <reactNative.Text style={styles.modalCancel}>ביטול</reactNative.Text>
            </reactNative.TouchableOpacity>
            <reactNative.Text style={styles.modalTitle}>
              {selectedContent?.title || 'צפייה בתוכן'}
            </reactNative.Text>
            <reactNative.TouchableOpacity onPress={handleSaveContent} disabled={saving}>
              {saving ? (
                <reactNative.ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <reactNative.Text style={styles.modalSave}>שמור</reactNative.Text>
              )}
            </reactNative.TouchableOpacity>
          </reactNative.View>

          <reactNative.View style={styles.modalInfo}>
            <reactNative.Text style={styles.infoText}>נושא: {selectedContent?.subject}</reactNative.Text>
            <reactNative.Text style={styles.infoText}>
              אורך: {editedContent.length} תווים
            </reactNative.Text>
          </reactNative.View>

          <reactNative.TextInput
            style={styles.contentEditor}
            value={editedContent}
            onChangeText={setEditedContent}
            multiline
            textAlignVertical="top"
            placeholder="תוכן מחולץ..."
            placeholderTextColor="#999"
          />
        </reactNative.View>
      </reactNative.Modal>
    </reactNative.View>
  );
}

const styles = reactNative.StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lightGray,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.secondary,
  },
  errorText: {
    fontSize: 18,
    color: '#d32f2f',
    textAlign: 'center',
    marginTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  refreshButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.secondary,
    marginTop: 4,
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  contentItemContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 12,
  },
  contentItem: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deleteButton: {
    backgroundColor: '#e74c3c',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  contentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  contentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textDark,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusGreen: {
    backgroundColor: '#E8F5E9',
  },
  statusRed: {
    backgroundColor: '#FFEBEE',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  contentSubject: {
    fontSize: 14,
    color: Colors.secondary,
    marginBottom: 4,
  },
  contentMeta: {
    fontSize: 12,
    color: Colors.secondary,
  },
  contentPreview: {
    fontSize: 13,
    color: Colors.textDark,
    marginTop: 8,
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 8,
    fontStyle: 'italic',
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  deleteIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fde8e8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginBottom: 8,
  },
  deleteModalText: {
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  deleteModalWarning: {
    fontSize: 14,
    color: '#e74c3c',
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  confirmDeleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#e74c3c',
    alignItems: 'center',
  },
  confirmDeleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: Colors.white,
    paddingTop: 50,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
  },
  modalCancel: {
    fontSize: 16,
    color: '#d32f2f',
  },
  modalSave: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: 'bold',
  },
  modalInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#F5F5F5',
  },
  infoText: {
    fontSize: 14,
    color: Colors.secondary,
  },
  contentEditor: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 16,
    fontSize: 16,
    color: Colors.textDark,
    lineHeight: 24,
    textAlign: 'right',
  },
});
