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
    const { totalCookies } = useCookieStore();
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const prevCookies = useRef(totalCookies);

    useEffect(() => {
        if (totalCookies !== prevCookies.current) {
            // Bounce animation when cookies change
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 1.3,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start();
            prevCookies.current = totalCookies;
        }
    }, [totalCookies]);

    const sizeStyles = {
        small: { fontSize: 14, iconSize: 18 },
        medium: { fontSize: 18, iconSize: 24 },
        large: { fontSize: 24, iconSize: 32 },
    };

    const { fontSize, iconSize } = sizeStyles[size];

    const content = (
        <View style={[styles.container, size === 'large' && styles.containerLarge]}>
            <Animated.View style={[styles.cookieIcon, { transform: [{ scale: scaleAnim }] }]}>
                <Text style={{ fontSize: iconSize }}>🍪</Text>
            </Animated.View>
            <Text style={[styles.cookieCount, { fontSize }]}>
                {totalCookies.toLocaleString()}
            </Text>
            {showLabel && size !== 'small' && (
                <Text style={styles.cookieLabel}>עוגיות</Text>
            )}
        </View>
    );

    if (onPress) {
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
                {content}
            </TouchableOpacity>
        );
    }

    return content;
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
