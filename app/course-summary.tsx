
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useCompleteCourseStore } from '@/stores/completeCourseStore';

export default function CourseSummaryScreen() {
    const router = useRouter();
    const { courseId } = useLocalSearchParams<{ courseId: string }>();
    const { getCompleteCourse } = useCompleteCourseStore();

    const course = courseId ? getCompleteCourse(courseId) : null;

    if (!course) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.purple} />
                <Text style={styles.loadingText}>טוען סיכום...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-forward" size={24} color={Colors.white} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>סיכום מלא: {course.title}</Text>
            </View>

            {/* Content */}
            <ScrollView style={styles.contentContainer}>
                <Text style={styles.summaryText}>
                    {course.summary || 'לא נמצא סיכום עבור קורס זה.'}
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundLight,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: Colors.gray,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        backgroundColor: Colors.purple,
    },
    backButton: {
        padding: 8,
        marginRight: 10,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.white,
        textAlign: 'right',
        flex: 1,
    },
    contentContainer: {
        flex: 1,
        padding: 20,
    },
    summaryText: {
        fontSize: 16,
        lineHeight: 28,
        color: Colors.textDark,
        textAlign: 'right',
    },
});
