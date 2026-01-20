import { useArrayStore } from '@/stores/arrStore';
import { Course, CustomCourse, AnyCourse, isCustomCourse } from '@/types/data';
import { useRouter } from 'expo-router';
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CourseCardProps {
    id: string;
    title: string;
    description: string;
    image?: string;
    coverColor?: string;
    isCustom?: boolean;
}

export default function CourseCard({ id, title, description, image, coverColor, isCustom }: CourseCardProps) {
    const router = useRouter();
    const addItem = useArrayStore((state) => state.addItem);
    
    const handlePress = () => {
        if(id.startsWith('local-course-')) {
            // Custom course, no special item
        }
        else addItem('CPR');
        router.push(`/course/${id}`)
    }
    
    return (
        <TouchableOpacity style={styles.card} onPress={handlePress}>
            {/* Course Image or Color Cover */}
            {image ? (
                <Image source={{ uri: image }} style={styles.image} />
            ) : coverColor ? (
                <View style={[styles.colorCover, { backgroundColor: coverColor }]}>
                    {isCustom && (
                        <View style={styles.customBadge}>
                            <Ionicons name="create" size={16} color="white" />
                            <Text style={styles.customBadgeText}>קורס מותאם</Text>
                        </View>
                    )}
                    <Text style={styles.coverTitle}>{title}</Text>
                </View>
            ) : (
                <View style={[styles.colorCover, { backgroundColor: '#3b82f6' }]}>
                    <Text style={styles.coverTitle}>{title}</Text>
                </View>
            )}

            {/* Course Info */}
            <View style={styles.info}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.description} numberOfLines={3}>
                    {description}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#f8f9fa',
        borderRadius: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 8,
        marginVertical: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    image: {
        width: '100%',
        height: 160,
        resizeMode: 'cover',
    },
    colorCover: {
        width: '100%',
        height: 160,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    coverTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
        paddingHorizontal: 20,
    },
    customBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    customBadgeText: {
        fontSize: 12,
        color: 'white',
        fontWeight: '500',
    },
    info: {
        padding: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 10,
        textAlign: 'right'
    },
    description: {
        fontSize: 16,
        color: '#7f8c8d',
        lineHeight: 22,
        textAlign: 'right'
    },
});
