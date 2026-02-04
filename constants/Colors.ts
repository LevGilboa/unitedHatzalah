/**
 * App Color Palette - Modern Pastel Blue-Purple Theme
 * Inspired by the educational learning background
 */

// Primary gradient colors (from the background image)
const pastelBlue = '#A8D4E6';      // Light pastel blue
const pastelPurple = '#C4B5E0';    // Light pastel purple
const softLavender = '#D8D0EA';    // Soft lavender
const skyBlue = '#B8E0F0';         // Sky blue

// Accent colors
const primaryAccent = '#7C6BC4';   // Purple accent (buttons, links)
const secondaryAccent = '#5BA4D9'; // Blue accent (highlights)

const tintColorLight = primaryAccent;
const tintColorDark = '#fff';

export const Colors = {
    light: {
        text: '#2D3748',
        background: '#F8FAFC',
        tint: tintColorLight,
        icon: '#718096',
        tabIconDefault: '#A0AEC0',
        tabIconSelected: tintColorLight,
    },
    dark: {
        text: '#F7FAFC',
        background: '#1A202C',
        tint: tintColorDark,
        icon: '#A0AEC0',
        tabIconDefault: '#718096',
        tabIconSelected: tintColorDark,
    },

    // Main app colors - Pastel Educational Theme
    primary: '#7C6BC4',           // Main purple
    secondary: '#5BA4D9',         // Main blue
    text: '#4A5568',              // Readable gray
    accent: '#7C6BC4',            // Purple accent (was orange)

    // Legacy support (keeping orange for specific elements)
    orange: '#F47920',            // Original orange (for specific branding)

    // Gradient colors
    gradientStart: '#A8D4E6',     // Pastel blue
    gradientMiddle: '#C4B5E0',    // Pastel purple
    gradientEnd: '#D8D0EA',       // Soft lavender

    // UI Colors
    blue: '#5BA4D9',              // Soft blue
    purple: '#7C6BC4',            // Soft purple
    white: '#FFFFFF',
    gray: '#718096',
    lightGray: '#EDF2F7',
    textDark: '#2D3748',

    // Status colors
    success: '#48BB78',           // Green (correct answer)
    error: '#F56565',             // Red (wrong answer)
    warning: '#ECC94B',           // Yellow (warning)
    info: '#4299E1',              // Blue (info)

    // Background variants
    backgroundLight: '#F8FAFC',
    backgroundCard: '#FFFFFF',
    backgroundOverlay: 'rgba(124, 107, 196, 0.1)', // Purple overlay

    // Border colors
    border: '#E2E8F0',
    borderFocus: '#7C6BC4',
};