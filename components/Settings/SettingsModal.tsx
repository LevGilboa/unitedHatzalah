import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useAuthStore } from '@/stores/authStore';
import { CustomButton } from '@/components/ui/CustomButton';
import { router } from 'expo-router';
import Avatar from '@/components/Profile/Avatar';
import ModalImageOptions from '@/components/Profile/ModalImageOptions';
import { getAuth, deleteUser } from 'firebase/auth';
import { isAdmin } from '@/constants/AdminConfig';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const user = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);
  const logout = useAuthStore((state) => state.logout);

  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  const HandleDeleteAccount = async () => {
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;

      if (currentUser) {
        await deleteUser(currentUser);
        alert('החשבון נמחק בהצלחה.');
        onClose();
      } else {
        alert('אין משתמש מחובר.');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error deleting user account:', error.message);
        if ((error as any).code === 'auth/requires-recent-login') {
          alert('יש להתחבר מחדש כדי למחוק את החשבון.');
        }
      }
    }
  };

  const HandleLogout = () => {
    logout();
    onClose();
  };

  const HandleLogin = () => {
    onClose();
    router.replace('/auth/login');
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>הגדרות</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Avatar Section */}
            <Avatar avatar={avatar} setModalVisible={setAvatarModalVisible} />

            {/* User Information */}
            <Text style={styles.username}>{user?.name || 'אורח'}</Text>
            <Text style={styles.email}>{user?.email || 'לא מחובר עדיין'}</Text>

            {/* Guest Mode Banner */}
            {isGuest && (
              <View style={styles.guestBanner}>
                <Ionicons name="information-circle" size={20} color="#1976d2" />
                <Text style={styles.guestBannerText}>
                  אתה במצב אורח. התחבר כדי לשמור את ההתקדמות שלך!
                </Text>
              </View>
            )}

            {/* Badges Section */}
            {user && user.badges && user.badges.length > 0 && (
              <View style={styles.badgesContainer}>
                <Text style={styles.sectionTitle}>ההישגים שלי:</Text>
                <View style={styles.badgesList}>
                  {user.badges.map((badge) => (
                    <View key={badge.id} style={styles.badgeItem}>
                      <Image source={{ uri: badge.icon }} style={styles.badgeIcon} />
                      <Text style={styles.badgeTitle}>{badge.title}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Actions */}
            <View style={styles.actionsContainer}>
              {isGuest ? (
                <CustomButton title="התחבר לחשבון" handlePress={HandleLogin} />
              ) : (
                <>
                  {/* Admin Panel Button - visible for all logged-in users for testing */}
                  <View style={styles.adminButton}>
                    <CustomButton
                      title="🔧 ניהול תוכן מחולץ"
                      backgroundColor={Colors.primary}
                      handlePress={() => {
                        onClose();
                        router.push('/admin');
                      }}
                    />
                  </View>
                  
                  <CustomButton title="התנתק" handlePress={HandleLogout} />
                  <View style={styles.deleteButton}>
                    <CustomButton
                      title="מחק חשבון"
                      backgroundColor={'red'}
                      handlePress={HandleDeleteAccount}
                    />
                  </View>
                </>
              )}
            </View>
          </ScrollView>

          {/* Avatar Modal */}
          <ModalImageOptions
            setAvatar={setAvatar}
            modalVisible={avatarModalVisible}
            setModalVisible={setAvatarModalVisible}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  scrollContent: {
    alignItems: 'center',
    padding: 20,
    paddingBottom: 40,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 10,
    color: Colors.text,
  },
  email: {
    fontSize: 14,
    color: 'gray',
    marginBottom: 15,
  },
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginVertical: 10,
    gap: 8,
    width: '100%',
  },
  guestBannerText: {
    color: '#1976d2',
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
  },
  badgesContainer: {
    width: '100%',
    marginTop: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: Colors.text,
  },
  badgesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badgeItem: {
    alignItems: 'center',
    margin: 8,
  },
  badgeIcon: {
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    width: 80,
    height: 80,
  },
  badgeTitle: {
    marginTop: 5,
    fontSize: 12,
    textAlign: 'center',
    color: Colors.text,
  },
  actionsContainer: {
    width: '100%',
    marginTop: 20,
    gap: 10,
  },
  adminButton: {
    marginBottom: 10,
  },
  deleteButton: {
    marginTop: 10,
  },
});
