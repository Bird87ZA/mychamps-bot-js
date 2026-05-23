import { describe, it, expect, vi, beforeEach } from 'vitest';
import { incidentReminderService } from '../../src/services/incidentReminder';
import { prisma } from '../../src/database';
import { createMockClient } from '../mocks/discord';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../src/utils/settings', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  hasTimezone: vi.fn(),
  guildsWithRemindersEnabled: vi.fn(),
}));

import { getSetting } from '../../src/utils/settings';
const mockGetSetting = vi.mocked(getSetting);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('incidentReminderService', () => {
  it('has correct name and interval', () => {
    expect(incidentReminderService.name).toBe('IncidentReminder');
    expect(incidentReminderService.interval).toBe(60);
  });

  it('does nothing when there are no awaiting_review incidents', async () => {
    mockPrisma.incident.findMany.mockResolvedValue([]);
    const client = createMockClient();

    await incidentReminderService.execute(client as never);

    expect(mockGetSetting).not.toHaveBeenCalled();
  });

  it('sends reminder and updates lastReminderAt when interval has passed', async () => {
    const mockSend = vi.fn();
    const mockChannel = { send: mockSend };

    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

    mockPrisma.incident.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: '123456789',
        channelId: 'channel-id',
        mychampsIncidentId: null,
        championshipSlug: 'champ-a',
        defendants: ['user1'],
        status: 'awaiting_review',
        defenceSubmitted: [],
        lastReminderAt: longAgo,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // First getSetting call: interval, second: ticket access roles
    mockGetSetting
      .mockResolvedValueOnce('24')
      .mockResolvedValueOnce('["ticket-role-a","ticket-role-b"]');
    mockPrisma.incident.update.mockResolvedValue({} as never);

    const client = createMockClient();
    client.channels.fetch.mockResolvedValue(mockChannel);

    await incidentReminderService.execute(client as never);

    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('<@&ticket-role-a>'));
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('<@&ticket-role-b>'));
    expect(mockPrisma.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ lastReminderAt: expect.any(Date) }),
      }),
    );
  });

  it('skips reminder when interval has not elapsed', async () => {
    const recentlyReminded = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago

    mockPrisma.incident.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: '123456789',
        channelId: 'channel-id',
        mychampsIncidentId: null,
        championshipSlug: 'champ-a',
        defendants: ['user1'],
        status: 'awaiting_review',
        defenceSubmitted: [],
        lastReminderAt: recentlyReminded,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // 24-hour interval
    mockGetSetting.mockResolvedValueOnce('24');

    const client = createMockClient();

    await incidentReminderService.execute(client as never);

    expect(client.channels.fetch).not.toHaveBeenCalled();
    expect(mockPrisma.incident.update).not.toHaveBeenCalled();
  });

  it('uses default 24-hour interval when setting is not configured', async () => {
    const mockSend = vi.fn();
    const mockChannel = { send: mockSend };

    // Never reminded before
    mockPrisma.incident.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: '123456789',
        channelId: 'channel-id',
        mychampsIncidentId: null,
        championshipSlug: 'champ-a',
        defendants: ['user1'],
        status: 'awaiting_review',
        defenceSubmitted: [],
        lastReminderAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // No interval configured, no ticket access roles
    mockGetSetting.mockResolvedValue(null);
    mockPrisma.incident.update.mockResolvedValue({} as never);

    const client = createMockClient();
    client.channels.fetch.mockResolvedValue(mockChannel);

    await incidentReminderService.execute(client as never);

    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('Ticket access roles'));
    expect(mockPrisma.incident.update).toHaveBeenCalled();
  });

  it('skips gracefully when channel is deleted', async () => {
    mockPrisma.incident.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: '123456789',
        channelId: 'deleted-channel-id',
        mychampsIncidentId: null,
        championshipSlug: 'champ-a',
        defendants: ['user1'],
        status: 'awaiting_review',
        defenceSubmitted: [],
        lastReminderAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockGetSetting.mockResolvedValueOnce('24');

    const client = createMockClient();
    client.channels.fetch.mockRejectedValue(new Error('Unknown Channel'));

    await incidentReminderService.execute(client as never);

    expect(mockPrisma.incident.update).not.toHaveBeenCalled();
  });

  it('skips incidents without a channelId', async () => {
    mockPrisma.incident.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: '123456789',
        channelId: null,
        mychampsIncidentId: null,
        championshipSlug: 'champ-a',
        defendants: [],
        status: 'awaiting_review',
        defenceSubmitted: [],
        lastReminderAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockGetSetting.mockResolvedValueOnce('24');

    const client = createMockClient();

    await incidentReminderService.execute(client as never);

    expect(client.channels.fetch).not.toHaveBeenCalled();
    expect(mockPrisma.incident.update).not.toHaveBeenCalled();
  });

  it('skips when interval is set to zero or invalid', async () => {
    mockPrisma.incident.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: '123456789',
        channelId: 'channel-id',
        mychampsIncidentId: null,
        championshipSlug: 'champ-a',
        defendants: [],
        status: 'awaiting_review',
        defenceSubmitted: [],
        lastReminderAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockGetSetting.mockResolvedValueOnce('0');

    const client = createMockClient();

    await incidentReminderService.execute(client as never);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });
});
