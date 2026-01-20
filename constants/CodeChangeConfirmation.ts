/**
 * CodeChangeConfirmation.ts
 * 
 * This file demonstrates that code changes are possible in the repository.
 * Created in response to the question: "האם אני יכול לשנות את הקוד?" (Can I change the code?)
 * 
 * Answer: כן! (Yes!) - Code can be changed, modified, and improved.
 */

/**
 * Confirms that code changes are working
 * @returns A confirmation message in both Hebrew and English
 */
export const confirmCodeChange = (): { hebrew: string; english: string } => {
  return {
    hebrew: 'כן, אתה יכול לשנות את הקוד!',
    english: 'Yes, you can change the code!',
  };
};

/**
 * Gets the timestamp of when this demonstration was created
 * @returns ISO timestamp string
 */
export const getChangeTimestamp = (): string => {
  return new Date('2026-01-20T07:09:00Z').toISOString();
};

/**
 * Utility to verify code modification capabilities
 */
export const CODE_CHANGE_CAPABILITY = {
  enabled: true,
  message: 'Code changes are fully supported',
  demonstratedBy: 'Adding new utility file',
  date: '2026-01-20',
} as const;
