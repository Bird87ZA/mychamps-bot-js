import { describe, it, expect, vi, beforeEach } from 'vitest';
import { botCloserService } from '../../src/services/botCloser';
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

describe('botCloserService', () => {
  it('has correct name and interval', () => {
    expect(botCloserService.name).toBe('BotCloser');
    expect(botCloserService.interval).toBe(60);
  });

  it('does nothing when no schedules need closing', async () => {
    mockPrisma.schedule.findMany.mockResolvedValue([]);

    const client = createMockClient();
    await botCloserService.execute(client as never);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('closes due schedules and edits messages', async () => {
    const mockEdit = vi.fn();
    const mockFetchMessage = vi.fn().mockResolvedValue({ edit: mockEdit });
    const mockChannel = { messages: { fetch: mockFetchMessage } };

    mockPrisma.schedule.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: BigInt(789),
        guildName: 'Test',
        name: 'Event',
        date: new Date(),
        dateUtc: new Date(),
        closingDate: new Date('2020-01-01'),
        closingDateUtc: new Date('2020-01-01'),
        image: null,
        timeBefore: '-6',
        botPosted: true,
        attendees: {},
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.schedule.update.mockResolvedValue({} as never);

    const client = createMockClient();
    client.channels.fetch.mockResolvedValue(mockChannel);

    await botCloserService.execute(client as never);

    expect(mockEdit).toHaveBeenCalled();
    expect(mockPrisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { closed: true },
    });
  });

  it('handles channel fetch errors gracefully', async () => {
    mockPrisma.schedule.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: BigInt(789),
        guildName: 'Test',
        name: 'Event',
        date: new Date(),
        dateUtc: new Date(),
        closingDate: new Date('2020-01-01'),
        closingDateUtc: new Date('2020-01-01'),
        image: null,
        timeBefore: '-6',
        botPosted: true,
        attendees: {},
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const client = createMockClient();
    client.channels.fetch.mockRejectedValue(new Error('Channel not found'));

    // Should not throw
    await botCloserService.execute(client as never);

    expect(mockPrisma.schedule.update).not.toHaveBeenCalled();
  });
});
