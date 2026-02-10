/**
 * Admin Configuration
 * List of admin users who have access to admin features
 */

// List of admin email addresses
export const ADMIN_EMAILS: string[] = [
  'levimhshael@yatmal.co.il',
  'levimshael@yatmal.co.il',
  'dvirgilboa@yatmal.co.il',
  // Add more admin emails here
];

/**
 * Check if a user email is an admin
 */
export const isAdmin = (email: string | undefined | null): boolean => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
};

/**
 * Admin permissions
 */
export const AdminPermissions = {
  VIEW_EXTRACTED_CONTENT: 'view_extracted_content',
  EDIT_EXTRACTED_CONTENT: 'edit_extracted_content',
  VIEW_ALL_USERS: 'view_all_users',
  VIEW_ANALYTICS: 'view_analytics',
} as const;

export type AdminPermission = typeof AdminPermissions[keyof typeof AdminPermissions];
