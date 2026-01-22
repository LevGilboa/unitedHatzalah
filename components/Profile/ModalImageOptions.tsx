import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/Colors';
import * as FileSystem from 'expo-file-system';
import { useAuthStore } from '@/stores/authStore';

// Robot avatar options from robohash.org
const ROBOT_AVATARS = [
  { id: 'purple-1', url: 'https://robohash.org/mishal-levi', name: 'סגול' },
  { id: 'red-1', url: 'https://robohash.org/elon-musk', name: 'אדום' },
  { id: 'orange-1', url: 'https://robohash.org/mark-zuckerberg', name: 'כתום' },
  { id: 'purple-2', url: 'https://robohash.org/jeff-bezos', name: 'סגול כהה' },
  { id: 'purple-3', url: 'https://robohash.org/bill-gates', name: 'סגול בהיר' },
  { id: 'green-1', url: 'https://robohash.org/warren-buffett', name: 'ירוק' },
  { id: 'blue-1', url: 'https://robohash.org/robot-blue', name: 'כחול' },
  { id: 'yellow-1', url: 'https://robohash.org/robot-yellow', name: 'צהוב' },
  { id: 'pink-1', url: 'https://robohash.org/robot-pink', name: 'ורוד' },
  { id: 'gray-1', url: 'https://robohash.org/robot-gray', name: 'אפור' },
  { id: 'teal-1', url: 'https://robohash.org/robot-teal', name: 'טורקיז' },
  { id: 'brown-1', url: 'https://robohash.org/robot-brown', name: 'חום' },
];

// Background color options
const BG_COLORS = [
  { id: 'orange', color: '#F47920', name: 'כתום' },
  { id: 'blue', color: '#3498db', name: 'כחול' },
  { id: 'green', color: '#2ecc71', name: 'ירוק' },
  { id: 'purple', color: '#9b59b6', name: 'סגול' },
  { id: 'red', color: '#e74c3c', name: 'אדום' },
  { id: 'teal', color: '#1abc9c', name: 'טורקיז' },
  { id: 'pink', color: '#e91e63', name: 'ורוד' },
  { id: 'gray', color: '#54595f', name: 'אפור' },
  { id: 'yellow', color: '#f1c40f', name: 'צהוב' },
  { id: 'navy', color: '#2c3e50', name: 'כחול כהה' },
];

interface ModalImageOptionsProps {
  modalVisible: boolean;
  setAvatar: (avatar: string) => void;
  setModalVisible: (visible: boolean) => void;
}

export default function ModalImageOptions({
  modalVisible,
  setModalVisible,
  setAvatar,
}: ModalImageOptionsProps) {
  const updateAvatar = useAuthStore((state) => state.updateAvatar);
  const [showRobotPicker, setShowRobotPicker] = useState(false);
  const [selectedBgColor, setSelectedBgColor] = useState(BG_COLORS[0].color);

  const handleChoosePhoto = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Permission to access media library is required!');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: Platform.OS === 'web', // Save base64 on web
    });

    if (!pickerResult.canceled && pickerResult.assets?.[0].uri) {
      let base64 = '';
      setModalVisible(false);
      if (Platform.OS === 'web') {
        base64 = `data:image/jpeg;base64,${pickerResult.assets[0].base64}`;
      } else {
        base64 =
          'data:image/jpeg;base64,' +
          (await FileSystem.readAsStringAsync(pickerResult.assets[0].uri, {
            encoding: 'base64',
          }));
      }
      setAvatar(base64);
      updateAvatar(base64);
    }
  };

  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Permission to access camera is required!');
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!cameraResult.canceled && cameraResult.assets?.[0].uri) {
      setAvatar(cameraResult.assets[0].uri);
      setModalVisible(false);
    }
  };

  const handleSelectRobot = (robotUrl: string) => {
    // Add background color to the URL
    const urlWithBg = `${robotUrl}?bgset=any&bgcolor=${selectedBgColor.replace('#', '')}`;
    setAvatar(urlWithBg);
    updateAvatar(urlWithBg);
    setShowRobotPicker(false);
    setModalVisible(false);
  };

  const handleResetProfileImage = () => {
    setAvatar('https://robohash.org/default');
    updateAvatar('https://robohash.org/default');
    setModalVisible(false);
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => {
        setModalVisible(false);
        setShowRobotPicker(false);
      }}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={() => {
          setModalVisible(false);
          setShowRobotPicker(false);
        }}
      >
        <View style={styles.modalContent}>
          {showRobotPicker ? (
            // Robot Avatar Picker View
            <View>
              <View style={styles.robotPickerHeader}>
                <TouchableOpacity onPress={() => setShowRobotPicker(false)}>
                  <Ionicons name="arrow-forward" size={24} color={Colors.accent} />
                </TouchableOpacity>
                <Text style={styles.robotPickerTitle}>בחר רובוט</Text>
                <View style={{ width: 24 }} />
              </View>
              
              {/* Background Color Picker */}
              <Text style={styles.colorPickerLabel}>בחר צבע רקע:</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.colorPickerContainer}
                contentContainerStyle={styles.colorPickerContent}
              >
                {BG_COLORS.map((bgColor) => (
                  <TouchableOpacity
                    key={bgColor.id}
                    style={[
                      styles.colorOption,
                      { backgroundColor: bgColor.color },
                      selectedBgColor === bgColor.color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setSelectedBgColor(bgColor.color)}
                  >
                    {selectedBgColor === bgColor.color && (
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <ScrollView 
                style={styles.robotGrid}
                contentContainerStyle={styles.robotGridContent}
              >
                <View style={styles.robotRow}>
                  {ROBOT_AVATARS.map((robot) => (
                    <TouchableOpacity
                      key={robot.id}
                      style={[styles.robotItem, { backgroundColor: selectedBgColor }]}
                      onPress={() => handleSelectRobot(robot.url)}
                    >
                      <Image source={{ uri: robot.url }} style={styles.robotImage} />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : (
            // Main Options View
            <>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleTakePhoto}
              >
                <Ionicons name="camera-outline" size={24} color={Colors.accent} />
                <Text style={styles.modalButtonText}>תמונה</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleChoosePhoto}
              >
                <Ionicons name="image-outline" size={24} color={Colors.accent} />
                <Text style={styles.modalButtonText}>בחירה מגלריה</Text>
              </TouchableOpacity>
              {/* Robot Avatar Picker Button */}
              <TouchableOpacity
                style={[styles.modalButton, styles.robotButton]}
                onPress={() => setShowRobotPicker(true)}
              >
                <Ionicons name="happy-outline" size={24} color={Colors.accent} />
                <Text style={styles.modalButtonText}>בחר רובוט</Text>
              </TouchableOpacity>
              {/* Reset to Default Button */}
              <TouchableOpacity
                style={[styles.modalButton, styles.resetButton]}
                onPress={handleResetProfileImage}
              >
                <Ionicons
                  name="refresh-outline"
                  size={24}
                  color={Colors.accent}
                />
                <Text style={styles.modalButtonText}>ברירת מחדל</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={24}
                  color={Colors.secondary}
                />
                <Text style={styles.modalButtonText}>ביטול</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 15,
  },
  modalButtonText: {
    fontSize: 18,
    marginRight: 10,
    color: Colors.accent,
  },
  robotButton: {
    borderTopWidth: 1,
    borderColor: '#eee',
    marginTop: 5,
  },
  resetButton: {
    borderTopWidth: 1,
    borderColor: Colors.secondary,
    marginTop: 10,
  },
  cancelButton: {
    marginTop: 10,
  },
  // Robot Picker Styles
  robotPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 10,
  },
  robotPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  colorPickerLabel: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'right',
    fontWeight: '600',
  },
  colorPickerContainer: {
    marginBottom: 15,
  },
  colorPickerContent: {
    flexDirection: 'row-reverse',
    gap: 10,
    paddingHorizontal: 5,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  robotGrid: {
    maxHeight: 350,
  },
  robotGridContent: {
    paddingBottom: 20,
  },
  robotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
  },
  robotItem: {
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: 'transparent',
    width: 90,
  },
  robotImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  robotName: {
    marginTop: 5,
    fontSize: 12,
    color: Colors.text,
    textAlign: 'center',
  },
});
