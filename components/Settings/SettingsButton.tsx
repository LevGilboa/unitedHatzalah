import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import SettingsModal from './SettingsModal';

interface SettingsButtonProps {
  color?: string;
  size?: number;
}

export default function SettingsButton({ color = Colors.accent, size = 26 }: SettingsButtonProps) {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="settings-outline" size={size} color={color} />
      </TouchableOpacity>

      <SettingsModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
  },
});
