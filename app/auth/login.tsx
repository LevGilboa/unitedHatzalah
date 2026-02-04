import {
  View,
  Text,
  StyleSheet,
  ToastAndroid,
  I18nManager,
  TouchableOpacity,
  ImageBackground,
} from 'react-native';
import React, { useEffect, useState } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useAuthStore } from '@/stores/authStore';
import BackArrow from '@/components/ui/BackArrow';
import { CustomButton } from '@/components/ui/CustomButton';
import CustomInput from '@/components/ui/CustomInput';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function SignIn() {
  const navigation = useNavigation();
  const router = useRouter();

  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [useUsername, setUseUsername] = useState(false);

  const login = useAuthStore((state) => state.login);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isGuest = useAuthStore((state) => state.isGuest);

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });

    // Ensure app is in RTL mode for Hebrew
    I18nManager.forceRTL(true);
  }, []);

  useEffect(() => {
    // Only redirect if authenticated AND not a guest
    if (isAuthenticated && !isGuest) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isGuest]);

  const onSignIn = async () => {
    if (!emailOrUsername || !password) {
      ToastAndroid.show('יש למלא את כל השדות', ToastAndroid.LONG);
      return;
    }

    try {
      await login(emailOrUsername, password);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <ImageBackground
      source={require('@/assets/login_background.png')}
      style={styles.background}
    >
      <View style={styles.container}>

        <Text style={styles.title}>בואו נתחבר</Text>
        <Text style={styles.subtitle}>ברוכים הבאים</Text>

        {/* Toggle between Email and Username */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, !useUsername && styles.toggleButtonActive]}
            onPress={() => setUseUsername(false)}
          >
            <Text style={[styles.toggleText, !useUsername && styles.toggleTextActive]}>
              מייל
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, useUsername && styles.toggleButtonActive]}
            onPress={() => setUseUsername(true)}
          >
            <Text style={[styles.toggleText, useUsername && styles.toggleTextActive]}>
              משתמש
            </Text>
          </TouchableOpacity>
        </View>

        {/* Email or Username Input */}
        <CustomInput
          placeholder={useUsername ? "הכניסו שם משתמש" : "הכניסו אימייל"}
          handleTextChange={setEmailOrUsername}
        />

        {/* Password Input */}
        <CustomInput
          placeholder="הכניסו סיסמה"
          handleTextChange={setPassword}
          secureTextEntry={true}
        />

        {/* Sign In Button */}
        <CustomButton
          backgroundColor={Colors.purple}
          title={'התחבר'}
          handlePress={onSignIn}
        ></CustomButton>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerSpan}>או</Text>
          <View style={styles.line} />
        </View>

        {/* Create Account Button */}
        <CustomButton
          backgroundColor={Colors.white}
          color={Colors.purple}
          title={'צור חשבון'}
          handlePress={() => router.push('/auth/register')}
        ></CustomButton>

        {/* אייקון דלת */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push('/(tabs)')}
        >
          <Ionicons name="exit-outline" size={28} color={Colors.purple} />
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    resizeMode: 'cover', // מתאים את התמונה למסך
  },

  container: {
    ...StyleSheet.absoluteFillObject, // ממלא את כל המסך
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    padding: 30,
    height: '100%',
    // backgroundColor: Colors.accent,
    gap: 10,
  },

  title: {
    marginTop: 100,
    fontSize: 32,
    marginBottom: 10,
    color: 'black',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 24,
    color: 'black',
    textAlign: 'center',
    marginBottom: 30,
  },
  toggleContainer: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginBottom: 20,
    justifyContent: 'center',
  },
  toggleButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#ccc',
  },
  toggleButtonActive: {
    backgroundColor: Colors.purple,
    borderColor: Colors.purple,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
  },
  inputContainer: {
    marginTop: 10,
    width: '100%',
  },
  input: {
    width: '100%',
    borderRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    fontSize: 16,
    padding: 15,
    backgroundColor: '#e5e5e5',
    borderWidth: 2,
    borderColor: '#a5a5a5',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },

  line: {
    borderWidth: 0.5,
    width: '45%',
    backgroundColor: 'black',
  },

  dividerSpan: {
    color: 'black',
    fontSize: 18,
  },

  iconButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: Colors.white,
    padding: 10,
    borderRadius: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
});
