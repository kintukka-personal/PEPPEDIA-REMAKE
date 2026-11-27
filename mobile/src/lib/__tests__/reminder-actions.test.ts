import type { Protocol } from '@/domain/model';
import { getData, EMPTY_DATA, useStore } from '@/store';

import { ACTION_LOG, ACTION_SKIP, handleReminderAction, reminderLog } from '../reminder-actions';

jest.mock('expo-notifications', () => ({ dismissNotificationAsync: jest.fn(() => Promise.resolve()) }));

const protocol: Protocol = {
  id: 'p1',
  compoundId: 'ghk-cu',
  name: 'GHK-Cu',
  route: 'subq',
  dose: { value: 1, unit: 'mg' },
  schedule: { kind: 'daily', times: ['19:00'] },
  startDate: '2026-11-01',
  reminders: true,
  status: 'active',
  color: '#000',
  createdAt: '',
  mix: { form: 'powder', components: [{ compoundId: 'ghk-cu', name: 'GHK-Cu', amount: { value: 50, unit: 'mg' } }], diluentMl: 3 },
};
const slot = new Date('2026-11-27T19:00:00').toISOString();
const now = new Date('2026-11-27T19:14:00');
const state = { protocols: [protocol], logs: [], inventory: [], settings: { syringe: 'u100-100' as const } };

const response = (actionIdentifier: string) =>
  ({
    actionIdentifier,
    notification: { request: { identifier: 'n1', content: { data: { protocolId: 'p1', scheduledFor: slot } } } },
  }) as never;

describe('reminderLog', () => {
  it('logs the scheduled dose with its draw and a suggested site', () => {
    const log = reminderLog(state, { protocolId: 'p1', scheduledFor: slot }, false, now)!;
    expect(log).toMatchObject({ protocolId: 'p1', name: 'GHK-Cu', scheduledFor: slot, takenAt: now.toISOString(), amount: { value: 1, unit: 'mg' }, route: 'subq' });
    expect(log.volumeMl).toBeCloseTo(0.06);
    expect(log.siteId).toBeTruthy();
    expect(log.skipped).toBeUndefined();
  });

  it('records a skip without a site or draw', () => {
    const log = reminderLog(state, { protocolId: 'p1', scheduledFor: slot }, true, now)!;
    expect(log.skipped).toBe(true);
    expect(log.siteId).toBeUndefined();
    expect(log.volumeMl).toBeUndefined();
  });

  it('does nothing for a missing protocol or an already-logged slot', () => {
    expect(reminderLog(state, { protocolId: 'gone', scheduledFor: slot }, false, now)).toBeNull();
    const logged = { ...state, logs: [{ id: 'l', protocolId: 'p1', scheduledFor: slot, compoundId: 'ghk-cu', name: 'GHK-Cu', takenAt: '', amount: protocol.dose, route: 'subq' as const }] };
    expect(reminderLog(logged, { protocolId: 'p1', scheduledFor: slot }, false, now)).toBeNull();
  });
});

describe('handleReminderAction', () => {
  beforeEach(() => useStore.getState().replaceAll({ ...EMPTY_DATA, protocols: [protocol] }));

  it('logs once even when the press arrives through both the listener and the background task', async () => {
    expect(await handleReminderAction(response(ACTION_LOG))).toBe(true);
    expect(await handleReminderAction(response(ACTION_LOG))).toBe(true);
    expect(getData().logs).toHaveLength(1);
    expect(getData().logs[0].skipped).toBeUndefined();
  });

  it('skips, and ignores taps on the notification body', async () => {
    expect(await handleReminderAction(response('expo.modules.notifications.actions.DEFAULT'))).toBe(false);
    expect(getData().logs).toHaveLength(0);
    await handleReminderAction(response(ACTION_SKIP));
    expect(getData().logs[0].skipped).toBe(true);
  });
});
