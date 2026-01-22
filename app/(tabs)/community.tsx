import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, TextInput, Modal } from 'react-native';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import MockCards from '@/mocks/community';
import Qcard from '@/components/Community/Qcard';
import ScrollToTopContainer from '@/components/ui/ScrollToTopContainer';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useAuthStore } from '@/stores/authStore';

// Time in milliseconds (1 hour = 3600000ms)
const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour

interface Discussion {
  id: number;
  title: string;
  messages: any[];
  lastActivity: number;
}

export default function Discussions() {
  // Styles for the new components
  const styles = StyleSheet.create({
    background: {
      flex: 1,
      resizeMode: 'cover',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255, 255, 255, 0.5)',
    },
    header: {
      padding: 20,
      paddingTop: 40,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: Colors.text,
    },
    headerSubtitle: {
      fontSize: 14,
      color: '#666',
      marginTop: 5,
    },
    container: {
      padding: 10,
      paddingBottom: 100,
    },
    fab: {
      position: 'absolute',
      bottom: 30,
      right: 30,
      backgroundColor: Colors.accent,
      width: 60,
      height: 60,
      borderRadius: 30,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: '#FFF',
      borderRadius: 15,
      padding: 20,
      width: '85%',
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 15,
      color: Colors.text,
    },
    input: {
      borderWidth: 1,
      borderColor: '#DDD',
      borderRadius: 10,
      padding: 15,
      fontSize: 16,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 20,
    },
    cancelButton: {
      padding: 12,
      borderRadius: 10,
      backgroundColor: '#EEE',
      flex: 1,
      marginRight: 10,
    },
    cancelText: {
      textAlign: 'center',
      color: '#666',
      fontWeight: 'bold',
    },
    submitButton: {
      padding: 12,
      borderRadius: 10,
      backgroundColor: Colors.accent,
      flex: 1,
      marginLeft: 10,
    },
    submitText: {
      textAlign: 'center',
      color: '#FFF',
      fontWeight: 'bold',
    },
    // Guest Modal Styles
    guestModalContent: {
      backgroundColor: '#FFF',
      borderRadius: 16,
      padding: 24,
      width: '85%',
      maxWidth: 380,
      alignItems: 'center',
    },
    closeButton: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#f5f5f5',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
    },
    closeButtonText: {
      fontSize: 20,
      color: '#999',
      fontWeight: '600',
    },
    guestModalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: Colors.text,
      marginBottom: 12,
      marginTop: 8,
      textAlign: 'center',
    },
    guestModalText: {
      fontSize: 14,
      color: '#666',
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 20,
    },
    guestModalButtons: {
      width: '100%',
      gap: 12,
    },
    loginButton: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      backgroundColor: Colors.accent,
      borderRadius: 8,
      alignItems: 'center',
    },
    loginButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: 'white',
    },
    signupButton: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      backgroundColor: '#f5f5f5',
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: Colors.accent,
    },
    signupButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: Colors.accent,
    },
  });

  // Initialize discussions with lastActivity timestamp
  const [discussions, setDiscussions] = useState<Discussion[]>(() => 
    MockCards.map(card => ({
      ...card,
      lastActivity: Date.now(),
    }))
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  
  const user = useAuthStore((state) => state.user);
  const router = useRouter();

  // Check for inactive discussions every minute and remove them
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setDiscussions(prev => 
        prev.filter(discussion => {
          const isActive = (now - discussion.lastActivity) < INACTIVITY_TIMEOUT;
          if (!isActive) {
            console.log(`דיון נמחק עקב חוסר פעילות: ${discussion.title}`);
          }
          return isActive;
        })
      );
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const addDiscussion = () => {
    if (newTitle.trim()) {
      const newDiscussion: Discussion = {
        id: Date.now(),
        title: newTitle,
        messages: [],
        lastActivity: Date.now(),
      };
      setDiscussions([newDiscussion, ...discussions]);
      setNewTitle('');
      setModalVisible(false);
    }
  };

  return (
    <ImageBackground
      source={require('@/assets/background.jpg')}
      style={styles.background}
    >
      <View style={styles.overlay} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>דיונים ושאלות</Text>
        <Text style={styles.headerSubtitle}>שתפו, שאלו ולמדו מאחרים</Text>
      </View>

      <ScrollToTopContainer contentContainerStyle={styles.container}>
        {discussions.map((card: any, key: number) => (
          <Qcard key={key} title={card.title} id={card.id} />
        ))}
      </ScrollToTopContainer>

      {/* Add Discussion Button */}
      <TouchableOpacity style={styles.fab} onPress={() => {
        if (!user) {
          setShowGuestModal(true);
        } else {
          setModalVisible(true);
        }
      }}>
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* New Discussion Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>דיון חדש</Text>
            <TextInput
              style={styles.input}
              placeholder="מה תרצה לשאול או לדון?"
              value={newTitle}
              onChangeText={setNewTitle}
              multiline
              textAlign="right"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitButton} onPress={addDiscussion}>
                <Text style={styles.submitText}>פרסם</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Guest Login Modal */}
      <Modal visible={showGuestModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.guestModalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowGuestModal(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            
            <Text style={styles.guestModalTitle}>התחברות נדרשת</Text>
            <Text style={styles.guestModalText}>
              כדי לפרסם הודעות בקהילה, אנא התחבר או הירשם.
            </Text>
            
            <View style={styles.guestModalButtons}>
              <TouchableOpacity
                style={styles.loginButton}
                onPress={() => {
                  setShowGuestModal(false);
                  router.push('/auth/login');
                }}
              >
                <Text style={styles.loginButtonText}>התחברות</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.signupButton}
                onPress={() => {
                  setShowGuestModal(false);
                  router.push('/auth/register');
                }}
              >
                <Text style={styles.signupButtonText}>הרשמה</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}
