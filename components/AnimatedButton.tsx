/**
 * Animated Button Component
 * A button with press animation, haptic feedback, and sound effects
 */

import React, { useRef } from 'react';
import {
    Animated,
    TouchableOpacity,
    StyleSheet,
    ViewStyle,
    TextStyle,
    Platform,
} from 'react-native';
import { gameEffects } from '@/services/GameEffects';

interface AnimatedButtonProps {
    onPress: () => void;
    style?: ViewStyle;
    textStyle?: TextStyle;
    children: React.ReactNode;
    disabled?: boolean;
    enableSound?: boolean;
    enableHaptic?: boolean;
    animationType?: 'scale' | 'bounce' | 'pulse';
    scaleValue?: number;
}

export default function AnimatedButton({
    onPress,
    style,
    children,
    disabled = false,
    enableSound = true,
    enableHaptic = true,
    animationType = 'scale',
    scaleValue = 0.95,
}: AnimatedButtonProps) {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        // Play click effect
        if (enableSound || enableHaptic) {
            gameEffects.onSelect();
        }

        switch (animationType) {
            case 'bounce':
                Animated.sequence([
                    Animated.timing(scaleAnim, {
                        toValue: scaleValue - 0.05,
                        duration: 100,
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                    Animated.spring(scaleAnim, {
                        toValue: scaleValue,
                        friction: 3,
                        tension: 40,
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                ]).start();
                break;

            case 'pulse':
                Animated.parallel([
                    Animated.timing(scaleAnim, {
                        toValue: scaleValue,
                        duration: 100,
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                    Animated.timing(opacityAnim, {
                        toValue: 0.8,
                        duration: 100,
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                ]).start();
                break;

            default: // scale
                Animated.timing(scaleAnim, {
                    toValue: scaleValue,
                    duration: 100,
                    useNativeDriver: Platform.OS !== 'web',
                }).start();
        }
    };

    const handlePressOut = () => {
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 3,
                tension: 40,
                useNativeDriver: Platform.OS !== 'web',
            }),
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 100,
                useNativeDriver: Platform.OS !== 'web',
            }),
        ]).start();
    };

    const animatedStyle = {
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
    };

    return (
        <TouchableOpacity
            activeOpacity={1}
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
        >
            <Animated.View
                style={[
                    styles.button,
                    style,
                    animatedStyle,
                    disabled && styles.disabled,
                ]}
            >
                {children}
            </Animated.View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabled: {
        opacity: 0.5,
    },
});
