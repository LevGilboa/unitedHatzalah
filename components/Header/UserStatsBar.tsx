import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FlameStreak from '@/components/Header/Streak';
import DiamondIcon from '@/components/Header/Gems';
import { Heart } from '@/components/Header/Hearts'; // Import the Heart component
import { Colors } from '@/constants/Colors';
import { useAuthStore } from '@/stores/authStore';
import SettingsButton from '@/components/Settings/SettingsButton';
import { isAdmin } from '@/constants/AdminConfig';

interface UserStatsProps {
  flameCount: number;
  diamondCount: number;
  heartCount: number;
}

export default function UserStats({
  flameCount,
  diamondCount,
  heartCount,
}: UserStatsProps) {
  const user = useAuthStore((state) => state.user);

  // Get user stats from the user data (or default if not available)
  flameCount = user?.streak || 0; // Default streak value if not available
  diamondCount = user?.gems || 0; // Default gems value if not available
  heartCount = user?.hearts || 0; // Default hearts value if not available

  // Check if user is admin - admins have infinite hearts
  const userIsAdmin = isAdmin(user?.email);

  const diffInMs = Date.now() - flameCount;
  flameCount = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  return (
    <View style={styles.container}>
      {/* Settings Button */}
      <SettingsButton color={Colors.white} size={28} />

      {/* Flame Streak */}
      <View style={styles.statItem}>
        <FlameStreak size={30} />
        <Text style={styles.statText}>{flameCount}</Text>
      </View>

      {/* Diamond */}
      <View style={styles.statItem}>
        <DiamondIcon size={30} />
        <Text style={styles.statText}>{diamondCount}</Text>
      </View>

      {/* Heart */}
      <View style={styles.statItem}>
        <Heart size={30} />
        <Text style={[styles.statText, userIsAdmin && styles.infinityText]}>{userIsAdmin ? '∞' : heartCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 12,
    paddingTop: 35,
    backgroundColor: Colors.purple,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statText: {
    marginLeft: 5,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.white,
  },
  infinityText: {
    fontSize: 28,
    fontWeight: 'bold',
  },
});
