/**
 * Cookie Display Component
 * Shows user's cookie balance with animation
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useCookieStore } from '@/stores/cookieStore';

interface CookieDisplayProps {
    size?: 'small' | 'medium' | 'large';
    showLabel?: boolean;
    onPress?: () => void;
}

export default function CookieDisplay({
    size = 'medium',
    showLabel = true,
    onPress
}: CookieDisplayProps) {
    // Hidden per user request about cookies score removal
    return null;
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF8E1',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
        borderWidth: 2,
        borderColor: '#FFD54F',
    },
    containerLarge: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
    },
    cookieIcon: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    cookieCount: {
        fontWeight: 'bold',
        color: '#F57C00',
    },
    cookieLabel: {
        fontSize: 12,
        color: '#F57C00',
        fontWeight: '600',
    },
});
