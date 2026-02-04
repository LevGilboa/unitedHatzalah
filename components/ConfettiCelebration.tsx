/**
 * Confetti Celebration Component
 * Shows confetti animation for victories and achievements
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ConfettiPiece {
    id: number;
    x: Animated.Value;
    y: Animated.Value;
    rotate: Animated.Value;
    scale: Animated.Value;
    color: string;
    size: number;
    shape: 'square' | 'circle' | 'triangle';
}

interface ConfettiCelebrationProps {
    isActive: boolean;
    duration?: number;
    pieceCount?: number;
    onComplete?: () => void;
}

const COLORS = [
    '#ff6b6b', // Red
    '#ffd93d', // Yellow
    '#6bcb77', // Green
    '#4d96ff', // Blue
    '#ff85a2', // Pink
    '#9d65c9', // Purple
    '#ffa502', // Orange
    '#00d4ff', // Cyan
];

export default function ConfettiCelebration({
    isActive,
    duration = 3000,
    pieceCount = 50,
    onComplete,
}: ConfettiCelebrationProps) {
    const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
    const animationRef = useRef<Animated.CompositeAnimation | null>(null);

    useEffect(() => {
        if (isActive) {
            startConfetti();
        } else {
            stopConfetti();
        }

        return () => stopConfetti();
    }, [isActive]);

    const startConfetti = () => {
        // Create confetti pieces
        const newPieces: ConfettiPiece[] = [];

        for (let i = 0; i < pieceCount; i++) {
            const piece: ConfettiPiece = {
                id: i,
                x: new Animated.Value(Math.random() * SCREEN_WIDTH),
                y: new Animated.Value(-50 - Math.random() * 100),
                rotate: new Animated.Value(0),
                scale: new Animated.Value(1),
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                size: 8 + Math.random() * 12,
                shape: ['square', 'circle', 'triangle'][Math.floor(Math.random() * 3)] as 'square' | 'circle' | 'triangle',
            };
            newPieces.push(piece);
        }

        setPieces(newPieces);

        // Animate each piece
        const animations = newPieces.map((piece, index) => {
            const delay = index * 30;
            const fallDuration = duration + Math.random() * 1000;
            const swingAmount = 50 + Math.random() * 100;
            const rotations = 2 + Math.random() * 3;

            return Animated.parallel([
                // Fall animation
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(piece.y, {
                        toValue: SCREEN_HEIGHT + 100,
                        duration: fallDuration,
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                ]),
                // Horizontal swing
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.loop(
                        Animated.sequence([
                            Animated.timing(piece.x, {
                                toValue: (piece.x as any)._value + swingAmount,
                                duration: 500 + Math.random() * 500,
                                useNativeDriver: Platform.OS !== 'web',
                            }),
                            Animated.timing(piece.x, {
                                toValue: (piece.x as any)._value - swingAmount,
                                duration: 500 + Math.random() * 500,
                                useNativeDriver: Platform.OS !== 'web',
                            }),
                        ]),
                        { iterations: Math.ceil(fallDuration / 1000) }
                    ),
                ]),
                // Rotation
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(piece.rotate, {
                        toValue: rotations,
                        duration: fallDuration,
                        useNativeDriver: Platform.OS !== 'web',
                    }),
                ]),
                // Scale pulse
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.loop(
                        Animated.sequence([
                            Animated.timing(piece.scale, {
                                toValue: 1.2,
                                duration: 200,
                                useNativeDriver: Platform.OS !== 'web',
                            }),
                            Animated.timing(piece.scale, {
                                toValue: 0.8,
                                duration: 200,
                                useNativeDriver: Platform.OS !== 'web',
                            }),
                        ]),
                        { iterations: Math.ceil(fallDuration / 400) }
                    ),
                ]),
            ]);
        });

        animationRef.current = Animated.parallel(animations);
        animationRef.current.start(() => {
            setPieces([]);
            onComplete?.();
        });
    };

    const stopConfetti = () => {
        if (animationRef.current) {
            animationRef.current.stop();
            animationRef.current = null;
        }
        setPieces([]);
    };

    const renderPiece = (piece: ConfettiPiece) => {
        const rotate = piece.rotate.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
        });

        const animatedStyle = {
            position: 'absolute' as const,
            left: piece.x,
            top: piece.y,
            transform: [
                { rotate },
                { scale: piece.scale },
            ],
        };

        switch (piece.shape) {
            case 'circle':
                return (
                    <Animated.View
                        key={piece.id}
                        style={[
                            animatedStyle,
                            {
                                width: piece.size,
                                height: piece.size,
                                borderRadius: piece.size / 2,
                                backgroundColor: piece.color,
                            },
                        ]}
                    />
                );
            case 'triangle':
                return (
                    <Animated.View
                        key={piece.id}
                        style={[
                            animatedStyle,
                            {
                                width: 0,
                                height: 0,
                                backgroundColor: 'transparent',
                                borderStyle: 'solid',
                                borderLeftWidth: piece.size / 2,
                                borderRightWidth: piece.size / 2,
                                borderBottomWidth: piece.size,
                                borderLeftColor: 'transparent',
                                borderRightColor: 'transparent',
                                borderBottomColor: piece.color,
                            },
                        ]}
                    />
                );
            default: // square
                return (
                    <Animated.View
                        key={piece.id}
                        style={[
                            animatedStyle,
                            {
                                width: piece.size,
                                height: piece.size,
                                backgroundColor: piece.color,
                                borderRadius: 2,
                            },
                        ]}
                    />
                );
        }
    };

    if (pieces.length === 0) return null;

    return (
        <View style={styles.container} pointerEvents="none">
            {pieces.map(renderPiece)}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
        elevation: 9999,
    },
});
