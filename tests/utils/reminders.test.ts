import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rebuildReminders } from '../../src/utils/reminders';
import { prisma } from '../../src/database';

const mockPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rebuildReminders', () => {
  it('does nothing when no remind-attendees setting exists', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue(null);

    await rebuildReminders('123');

    expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when reminder frequency is invalid', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123',
      key: 'remind-attendees',
      value: 'not-a-number',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await rebuildReminders('123');

    expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when no attendance bots exist', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123',
      key: 'remind-attendees',
      value: '2',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.attendance.findMany.mockResolvedValue([]);

    await rebuildReminders('123');

    expect(mockPrisma.schedule.findFirst).not.toHaveBeenCalled();
  });

  it('does nothing when no schedules exist for guild', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123',
      key: 'remind-attendees',
      value: '2',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.attendance.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        fullTime: BigInt(111),
        reserve: null,
        commentator: null,
        attendees: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.schedule.findFirst.mockResolvedValue(null);

    await rebuildReminders('123');

    expect(mockPrisma.schedule.findMany).not.toHaveBeenCalled();
  });

  it('deletes old reminders and creates new ones for valid schedules', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const closingDate = new Date();
    closingDate.setDate(closingDate.getDate() + 9);

    mockPrisma.setting.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123',
      key: 'remind-attendees',
      value: '2',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.attendance.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        fullTime: BigInt(111),
        reserve: null,
        commentator: null,
        attendees: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.schedule.findFirst.mockResolvedValue({ id: 1 } as never);
    mockPrisma.schedule.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: null,
        guildName: 'Test',
        name: 'Event',
        date: futureDate,
        dateUtc: futureDate,
        closingDate,
        closingDateUtc: closingDate,
        image: null,
        timeBefore: '-6',
        botPosted: false,
        attendees: {},
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.reminder.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.reminder.createMany.mockResolvedValue({ count: 1 });

    await rebuildReminders('123');

    expect(mockPrisma.reminder.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.reminder.createMany).toHaveBeenCalled();
  });

  it('does nothing for frequency <= 0', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123',
      key: 'remind-attendees',
      value: '0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await rebuildReminders('123');

    expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
  });
});
