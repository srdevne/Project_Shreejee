import { appendRow } from './googleSheets';

export interface AppNotification {
    timestamp: string;
    type: string;
    message: string;
    by: string;
}

/**
 * Logs a notification to the Notifications sheet.
 * This is how managers/users auto-notify the owner of important changes.
 */
export const logNotification = async (
    accessToken: string,
    type: string,
    message: string,
    by: string
) => {
    try {
        await appendRow(accessToken, 'Notifications!A:D', [[
            new Date().toISOString(),
            type,
            message,
            by
        ]]);
    } catch (err) {
        // Notifications are best-effort — don't block main action
        console.warn('Failed to log notification:', err);
    }
};
