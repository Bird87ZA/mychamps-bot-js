import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAttendanceInteraction } from '../../src/events/attendanceInteraction';
import { prisma } from '../../src/database';
import { createMockInteraction, createMockClient } from '../mocks/discord';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../src/utils/attendance', () => ({
  buildAttendanceMessage: vi.fn().mockResolvedValue({
    content: 'test',
    embeds: [],
    components: [],
  }),
  isScheduleClosed: vi.fn(),
}));

import { isScheduleClosed } from '../../src/utils/attendance';
const mockIsScheduleClosed = vi.mocked(isScheduleClosed);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleAttendanceInteraction', () => {
  it('handles help button interactions', async () => {
    const interaction = createMockInteraction({ customId: 'help!schedule' });
    const client = createMockClient();

    await handleAttendanceInteraction(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });

  it('ignores non-matching custom IDs', async () => {
    const interaction = createMockInteraction({ customId: 'nope' });
    const client = createMockClient();

    await handleAttendanceInteraction(interaction as never, client as never);

    expect(mockPrisma.schedule.findUnique).not.toHaveBeenCalled();
  });

  it('replies when schedule is closed', async () => {
    const interaction = createMockInteraction({ customId: '1!yes' });
    const client = createMockClient();

    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 1,
      guildId: BigInt(123),
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
      attendees: {},
      closed: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockIsScheduleClosed.mockReturnValue(true);

    await handleAttendanceInteraction(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'The attendance bot is closed.',
      }),
    );
  });

  it('adds member to their team when responding yes', async () => {
    const interaction = createMockInteraction({
      customId: '1!yes',
      member: {
        user: { id: 'user1', username: 'testuser', globalName: 'Test User' },
        nickname: 'Tester',
        roles: {
          cache: new Map([
            ['111', { id: '111', name: 'Full Time' }],
            ['333', { id: '333', name: 'Team Alpha' }],
          ]),
        },
      },
    });
    const client = createMockClient();

    mockPrisma.schedule.findUnique
      .mockResolvedValueOnce({
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: BigInt(789),
        guildName: 'Test',
        name: 'Event',
        date: new Date('2099-01-01'),
        dateUtc: new Date('2099-01-01'),
        closingDate: null,
        closingDateUtc: null,
        image: null,
        timeBefore: '-6',
        botPosted: true,
        attendees: { 'Team Alpha': {}, 'Not Participating': {} },
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: BigInt(789),
        guildName: 'Test',
        name: 'Event',
        date: new Date('2099-01-01'),
        dateUtc: new Date('2099-01-01'),
        closingDate: null,
        closingDateUtc: null,
        image: null,
        timeBefore: '-6',
        botPosted: true,
        attendees: { 'Team Alpha': { user1: 'Tester' }, 'Not Participating': {} },
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
    mockIsScheduleClosed.mockReturnValue(false);
    mockPrisma.schedule.update.mockResolvedValue({} as never);

    await handleAttendanceInteraction(interaction as never, client as never);

    expect(mockPrisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          attendees: expect.objectContaining({
            'Team Alpha': { user1: 'Tester' },
          }),
        }),
      }),
    );
  });

  it('adds member to Not Participating when responding no', async () => {
    const interaction = createMockInteraction({
      customId: '1!no',
      member: {
        user: { id: 'user1', username: 'testuser', globalName: 'Test User' },
        nickname: null,
        roles: {
          cache: new Map([['333', { id: '333', name: 'Team Alpha' }]]),
        },
      },
    });
    const client = createMockClient();

    mockPrisma.schedule.findUnique
      .mockResolvedValueOnce({
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: BigInt(789),
        guildName: 'Test',
        name: 'Event',
        date: new Date('2099-01-01'),
        dateUtc: new Date('2099-01-01'),
        closingDate: null,
        closingDateUtc: null,
        image: null,
        timeBefore: '-6',
        botPosted: true,
        attendees: { 'Team Alpha': {}, 'Not Participating': {} },
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({} as never);

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
    mockIsScheduleClosed.mockReturnValue(false);
    mockPrisma.schedule.update.mockResolvedValue({} as never);

    await handleAttendanceInteraction(interaction as never, client as never);

    expect(mockPrisma.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendees: expect.objectContaining({
            'Not Participating': { user1: 'Test User' },
          }),
        }),
      }),
    );
  });

  it('rejects member without matching role', async () => {
    const interaction = createMockInteraction({
      customId: '1!yes',
      member: {
        user: { id: 'user1', username: 'testuser', globalName: 'Test User' },
        nickname: null,
        roles: {
          cache: new Map([['999', { id: '999', name: 'Unrelated Role' }]]),
        },
      },
    });
    const client = createMockClient();

    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 1,
      guildId: BigInt(123),
      channelId: BigInt(456),
      messageId: BigInt(789),
      guildName: 'Test',
      name: 'Event',
      date: new Date('2099-01-01'),
      dateUtc: new Date('2099-01-01'),
      closingDate: null,
      closingDateUtc: null,
      image: null,
      timeBefore: '-6',
      botPosted: true,
      attendees: { 'Team Alpha': {}, 'Not Participating': {} },
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
    mockIsScheduleClosed.mockReturnValue(false);

    await handleAttendanceInteraction(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'You are not allowed to participate in this event.',
      }),
    );
  });
});
