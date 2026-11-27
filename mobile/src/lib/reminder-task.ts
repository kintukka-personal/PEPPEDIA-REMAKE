// Background half of the reminder buttons. Must be imported from the app entry
// (../../index.ts) so the task is defined before Android runs it headless,
// i.e. when "Log" is pressed while the app is backgrounded or killed.

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { handleReminderAction } from '@/lib/reminder-actions';

export const REMINDER_TASK = 'titra-reminder-actions';

if (Platform.OS === 'android') {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(REMINDER_TASK, async ({ data }) => {
    if (data && 'actionIdentifier' in data) await handleReminderAction(data).catch(() => {});
  });
}
