// "Log" and "Skip" buttons on dose reminders. Tapping either records the dose
// straight from the notification shade, without opening the app. On Android the
// press reaches JS through two paths: the response listener while the app is
// running, and the background task (./reminder-task) when it is backgrounded or
// killed. Both end up in handleReminderAction, which ignores a slot that is
// already logged, so a press seen by both paths is recorded once.

import * as Notifications from 'expo-notifications';

import { drawForProtocol } from '@/domain/draw';
import type { DoseLog, InventoryItem, Protocol, SyringeId } from '@/domain/model';
import { doseOn } from '@/domain/schedule';
import { isInjectable, suggestSite } from '@/domain/sites';
import { pickData, useStore } from '@/store';

export const REMINDER_CATEGORY = 'dose-reminder';
export const ACTION_LOG = 'log';
export const ACTION_SKIP = 'skip';

export interface ReminderData {
  protocolId?: string;
  scheduledFor?: string;
}

interface Snapshot {
  protocols: Protocol[];
  logs: DoseLog[];
  inventory: InventoryItem[];
  settings: { syringe: SyringeId };
}

/**
 * The log a reminder button records: the protocol's scheduled dose, its vial and
 * draw, and the suggested injection site, exactly as the Log screen pre-fills
 * them. Null when the protocol is gone or that slot is already logged.
 */
export function reminderLog(s: Snapshot, data: ReminderData, skipped: boolean, now: Date = new Date()): Omit<DoseLog, 'id'> | null {
  const p = s.protocols.find((x) => x.id === data.protocolId);
  if (!p) return null;
  const scheduledFor = data.scheduledFor || undefined;
  if (scheduledFor && s.logs.some((l) => l.protocolId === p.id && l.scheduledFor === scheduledFor)) return null;

  const amount = doseOn(p, scheduledFor ? new Date(scheduledFor) : now);
  const base = {
    protocolId: p.id,
    compoundId: p.compoundId,
    name: p.name,
    takenAt: now.toISOString(),
    scheduledFor,
    amount,
    route: p.route,
  };
  if (skipped) return { ...base, skipped: true };

  const syringe = p.syringe ?? s.settings.syringe;
  const draw = drawForProtocol(p, amount, s.inventory, syringe);
  const site = isInjectable(p.route) ? suggestSite(p.route, s.logs) : null;
  return {
    ...base,
    inventoryId: p.inventoryId && s.inventory.some((i) => i.id === p.inventoryId) ? p.inventoryId : undefined,
    volumeMl: draw?.volumeMl,
    siteId: site?.id,
  };
}

async function hydrated(): Promise<void> {
  if (useStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const off = useStore.persist.onFinishHydration(() => {
      off();
      resolve();
    });
  });
}

/** Writes the store to disk now, so a headless task can't exit before the log is saved. */
async function flush(): Promise<void> {
  const { name, storage, version } = useStore.persist.getOptions();
  if (name && storage) await storage.setItem(name, { state: pickData(useStore.getState()), version });
}

/** Handles a Log/Skip press. Returns true when the press was one of ours. */
export async function handleReminderAction(response: Notifications.NotificationResponse): Promise<boolean> {
  const action = response.actionIdentifier;
  if (action !== ACTION_LOG && action !== ACTION_SKIP) return false;
  const data = (response.notification.request.content.data ?? {}) as ReminderData;
  await hydrated();
  const log = reminderLog(useStore.getState(), data, action === ACTION_SKIP);
  if (log) {
    useStore.getState().logDose(log);
    await flush();
  }
  await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
  return true;
}
