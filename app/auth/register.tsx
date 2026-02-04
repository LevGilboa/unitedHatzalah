import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ToastAndroid,
  I18nManager,
  ImageBackground,
} from 'react-native';
import React, { useEffect, useState } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAuthStore } from '@/stores/authStore';
import BackArrow from '@/components/ui/BackArrow';
import { CustomButton } from '@/components/ui/CustomButton';
import CustomInput from '@/components/ui/CustomInput';


export default function SignUp() {
  const navigation = useNavigation();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const createUser = useAuthStore((state) => state.createUser);

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });

    // Ensure app is in RTL mode for Hebrew
    I18nManager.forceRTL(true);
  }, []);

  const onCreateAccount = async () => {
    if (!email || !password || !fullName) {
      ToastAndroid.show('Please fill all fields', ToastAndroid.LONG);
      return;
    }

    try {
      await createUser(email, password, fullName);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Account creation failed:', error);
    }
  };

  return (
    <ImageBackground
      source={require('@/assets/login_background.png')}
      style={styles.background}
    >
      <View style={styles.container}>
        <BackArrow />

        <Text style={styles.title}>צרו משתמש חדש!</Text>
        <Text style={styles.subtitle}>מחכים לכם</Text>

        {/* Full Name*/}

        <CustomInput placeholder="הכניסו שם מלא" handleTextChange={setFullName} />

        {/* Email Input */}

        <CustomInput placeholder="הכניסו אימייל" handleTextChange={setEmail} />

        {/* Password Input */}

        <CustomInput placeholder="הכניסו סיסמה" handleTextChange={setPassword} secureTextEntry={true} />

        {/* Sign In Button */}

        <CustomButton
          backgroundColor={Colors.purple}
          title={'צור חשבון'}
          handlePress={onCreateAccount}
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
          title={'התחבר'}
          handlePress={() => router.replace('/auth/login')}
        ></CustomButton>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    resizeMode: 'cover',
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    padding: 30,
    height: '100%',
    gap: 10,
  },

  title: {
    marginTop: 80,
    fontSize: 32,
    marginBottom: 10,
    color: Colors.textDark,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 24,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 30,
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
});
