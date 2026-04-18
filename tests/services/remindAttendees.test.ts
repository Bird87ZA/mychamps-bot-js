import { describe, it, expect, vi, beforeEach } from 'vitest';
import { remindAttendeesService } from '../../src/services/remindAttendees';
import { prisma } from '../../src/database';
import { createMockClient } from '../mocks/discord';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../src/utils/settings', () => ({
  guildsWithRemindersEnabled: vi.fn(),
}));

import { guildsWithRemindersEnabled } from '../../src/utils/settings';
const mockGuildsWithReminders = vi.mocked(guildsWithRemindersEnabled);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('remindAttendeesService', () => {
  it('has correct name and interval', () => {
    expect(remindAttendeesService.name).toBe('RemindAttendees');
    expect(remindAttendeesService.interval).toBe(60);
  });

  it('does nothing when no guilds have reminders enabled', async () => {
    mockGuildsWithReminders.mockResolvedValue([]);

    const client = createMockClient();
    await remindAttendeesService.execute(client as never);

    expect(mockPrisma.reminder.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when no reminders are due', async () => {
    mockGuildsWithReminders.mockResolvedValue(['123']);
    mockPrisma.reminder.findMany.mockResolvedValue([]);

    const client = createMockClient();
    await remindAttendeesService.execute(client as never);

    expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
  });

  it('sends reminders to unmarked members', async () => {
    const mockSend = vi.fn();
    const mockChannel = { send: mockSend };

    mockGuildsWithReminders.mockResolvedValue(['123456789']);
    mockPrisma.reminder.findMany.mockResolvedValue([
      {
        id: 1,
        scheduleId: '10',
        remindAt: new Date('2020-01-01'),
        reminded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.schedule.findMany.mockResolvedValue([
      {
        id: 10,
        guildId: BigInt(123456789),
        channelId: BigInt(456),
        messageId: BigInt(789),
        guildName: 'Test',
        name: 'Event',
        date: new Date(),
        dateUtc: new Date(),
        closingDate: null,
        closingDateUtc: null,
        image: null,
        timeBefore: '-6',
        botPosted: true,
        attendees: { 'Team A': { markedUser: 'Alice' }, 'Not Participating': {} },
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.attendance.findFirst.mockResolvedValue({
      id: 1,
      guildId: BigInt(123456789),
      channelId: BigInt(456),
      fullTime: BigInt(111),
      reserve: null,
      commentator: null,
      attendees: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.reminder.deleteMany.mockResolvedValue({ count: 1 });

    const client = createMockClient();
    // Add a member with the role who hasn't marked attendance
    const guild = client.guilds.cache.get('123456789')!;
    guild.members.cache.set('unmarkedUser', {
      id: 'unmarkedUser',
      roles: { cache: new Map([['111', { id: '111' }]]) },
    });
    client.channels.fetch.mockResolvedValue(mockChannel);

    await remindAttendeesService.execute(client as never);

    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('<@unmarkedUser>'));
    expect(mockPrisma.reminder.deleteMany).toHaveBeenCalled();
  });

  it('deletes reminders without sending when all members have marked', async () => {
    mockGuildsWithReminders.mockResolvedValue(['123456789']);
    mockPrisma.reminder.findMany.mockResolvedValue([
      {
        id: 1,
        scheduleId: '10',
        remindAt: new Date('2020-01-01'),
        reminded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.schedule.findMany.mockResolvedValue([
      {
        id: 10,
        guildId: BigInt(123456789),
        channelId: BigInt(456),
        messageId: BigInt(789),
        guildName: 'Test',
        name: 'Event',
        date: new Date(),
        dateUtc: new Date(),
        closingDate: null,
        closingDateUtc: null,
        image: null,
        timeBefore: '-6',
        botPosted: true,
        attendees: { 'Team A': { user1: 'Alice' } },
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.attendance.findFirst.mockResolvedValue({
      id: 1,
      guildId: BigInt(123456789),
      channelId: BigInt(456),
      fullTime: BigInt(111),
      reserve: null,
      commentator: null,
      attendees: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.reminder.deleteMany.mockResolvedValue({ count: 1 });

    const client = createMockClient();
    // All guild members have marked attendance
    const guild = client.guilds.cache.get('123456789')!;
    guild.members.cache.set('user1', {
      id: 'user1',
      roles: { cache: new Map([['111', { id: '111' }]]) },
    });

    await remindAttendeesService.execute(client as never);

    expect(mockPrisma.reminder.deleteMany).toHaveBeenCalled();
  });
});
