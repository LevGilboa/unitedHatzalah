import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuth, deleteUser } from 'firebase/auth';

import { Colors } from '../../constants/Colors';
import { Badge } from '@/types/data';
import { useAuthStore } from '@/stores/authStore';
import { CustomButton } from '@/components/ui/CustomButton';
import { router } from 'expo-router';
import Avatar from '@/components/Profile/Avatar';
import ModalImageOptions from '@/components/Profile/ModalImageOptions';
import NoItem from '@/components/NoItem';
import { isAdmin } from '@/constants/AdminConfig';

export default function ProfileScreen() {
  const HandleDeleteAccount = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (user) {
        await deleteUser(user);
        alert('Your account has been deleted successfully.');
        // Optionally, navigate the user to a different screen
      } else {
        alert('No user is signed in.');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error deleting user account:', error.message);

        if ((error as any).code === 'auth/requires-recent-login') {
          alert('Please log in again to delete your account.');
        }
      } else {
        console.error('An unknown error occurred:', error);
      }
    }
  };

  const user = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);
  const logout = useAuthStore((state) => state.logout);

  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [modalVisible, setModalVisible] = useState(false);
  const [streak, setStreak] = useState(0);

  const HandleLogout = () => {
    logout();
  };

  const HandleLogin = () => {
    console.log('Navigating to login...');
    router.replace('/auth/login');
  };

  if (!user) return <NoItem text="אין משתמש " />;


  const badges: Badge[] = [
    { id: 1, title: 'שיעור ראשון', icon: 'star-outline' },
    { id: 2, title: 'רצף של 5 ימים', icon: 'flame-outline' },
    { id: 3, title: 'השלים את הבסיסי', icon: 'trophy-outline' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Avatar Section */}
      <Avatar avatar={avatar} setModalVisible={setModalVisible} />

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

      {/* Streak, Hearts, and Gems */}
      {/* <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Ionicons name="flame-outline" size={24} color={Colors.accent} />
          <Text style={styles.statText}>רצף: {streak}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="heart-outline" size={24} color={Colors.accent} />
          <Text style={styles.statText}>לבבות: {user?.hearts}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="cash-outline" size={24} color={Colors.accent} />
          <Text style={styles.statText}>יהלומים: {user?.gems}</Text>
        </View>
      </View> */}

      {/* Modal for Image Options */}
      <ModalImageOptions
        setAvatar={setAvatar}
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
      />

      {/* Badges Section */}
      <View style={styles.badgesContainer}>
        <Text style={styles.sectionTitle}> ההישגים שלי: </Text>
        <View style={styles.badgesList}>
          {(user.badges || []).map((badge) => (
            <View key={badge.id} style={styles.badgeItem}>
              {/* <Ionicons
                name={badge.icon as any}
                size={48}
                color={Colors.accent}
                style={styles.badgeIcon}
              /> */}
              <Image source={{ uri: badge.icon }} style={styles.badgeIcon} />
              <Text style={styles.badgeTitle}>{badge.title}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* logout / login */}
      {isGuest ? (
        <CustomButton title="התחבר לחשבון" handlePress={HandleLogin} />
      ) : (
        <>
          {/* Admin Panel Button - always show for testing */}
          <View style={styles.adminButton}>
            <CustomButton
              title="🔧 ניהול תוכן מחולץ"
              backgroundColor={Colors.primary}
              handlePress={() => router.push('/admin')}
            />
          </View>
          
          <CustomButton title="התנתק" handlePress={HandleLogout} />
          
          {/* delete account - only for logged in users */}
          <View style={styles.logoutButton}>
            <CustomButton
              title="מחק חשבון"
              backgroundColor={'red'}
              handlePress={HandleDeleteAccount}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: '#fff',
  },

  username: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 10,
    color: Colors.text,
  },
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 20,
    marginVertical: 10,
    gap: 8,
  },
  guestBannerText: {
    color: '#1976d2',
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
  },
  badgesSection: {
    alignSelf: 'stretch',
    marginTop: 20,
  },
  email: {
    fontSize: 16,
    color: 'gray',
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
    marginHorizontal: 15,
  },
  statText: {
    fontSize: 16,
    marginTop: 5,
    color: Colors.text,
  },
  badgesContainer: {
    width: '100%',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
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
    margin: 10,
  },
  badgeIcon: {
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    padding: 15,
    width: 100,
    height: 100,
  },
  badgeTitle: {
    marginTop: 5,
    fontSize: 14,
    textAlign: 'center',
    color: Colors.text,
  },

  logoutButton: {
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'flex-end',
  },
  adminButton: {
    alignItems: 'center',
    marginBottom: 10,
  },
});
