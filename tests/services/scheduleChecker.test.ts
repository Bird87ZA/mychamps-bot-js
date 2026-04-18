import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scheduleCheckerService } from '../../src/services/scheduleChecker';
import { prisma } from '../../src/database';
import { createMockClient } from '../mocks/discord';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../src/utils/attendance', () => ({
  buildAttendanceMessage: vi.fn().mockResolvedValue({
    content: 'test',
    embeds: [],
    components: [],
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scheduleCheckerService', () => {
  it('has correct name and interval', () => {
    expect(scheduleCheckerService.name).toBe('ScheduleChecker');
    expect(scheduleCheckerService.interval).toBe(60);
  });

  it('does nothing when no schedules are due', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const client = createMockClient();
    await scheduleCheckerService.execute(client as never);

    expect(mockPrisma.schedule.findUnique).not.toHaveBeenCalled();
  });

  it('posts attendance message for due schedules', async () => {
    const mockSend = vi.fn().mockResolvedValue({ id: '999' });
    const mockChannel = { send: mockSend };

    mockPrisma.$queryRaw.mockResolvedValue([{ id: BigInt(1) }]);
    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 1,
      guildId: BigInt(123),
      channelId: BigInt(456),
      messageId: null,
      guildName: 'Test',
      name: 'Event',
      date: new Date(),
      dateUtc: new Date(),
      closingDate: null,
      closingDateUtc: null,
      image: null,
      timeBefore: '-6',
      botPosted: false,
      attendees: {},
      closed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.attendance.findFirst.mockResolvedValue({
      id: 1,
      guildId: BigInt(123),
      channelId: BigInt(456),
      fullTime: BigInt(111),
      reserve: null,
      commentator: null,
      attendees: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.schedule.update.mockResolvedValue({} as never);

    const client = createMockClient();
    client.channels.fetch.mockResolvedValue(mockChannel);

    await scheduleCheckerService.execute(client as never);

    expect(mockSend).toHaveBeenCalled();
    expect(mockPrisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { botPosted: true, messageId: BigInt(999) },
    });
  });

  it('skips when schedule has no attendance config', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: BigInt(1) }]);
    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 1,
      guildId: BigInt(123),
      channelId: BigInt(456),
      messageId: null,
      guildName: 'Test',
      name: 'Event',
      date: new Date(),
      dateUtc: new Date(),
      closingDate: null,
      closingDateUtc: null,
      image: null,
      timeBefore: '-6',
      botPosted: false,
      attendees: {},
      closed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.attendance.findFirst.mockResolvedValue(null);

    const client = createMockClient();
    await scheduleCheckerService.execute(client as never);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('skips when schedule not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: BigInt(1) }]);
    mockPrisma.schedule.findUnique.mockResolvedValue(null);

    const client = createMockClient();
    await scheduleCheckerService.execute(client as never);

    expect(mockPrisma.attendance.findFirst).not.toHaveBeenCalled();
  });
});
