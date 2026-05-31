import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleList } from '../../../src/handlers/schedule/list';
import { prisma } from '../../../src/database';
import { createMockInteraction } from '../../mocks/discord';

const mockPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleList (schedule)', () => {
  it('shows empty message when no schedules exist', async () => {
    mockPrisma.schedule.findMany.mockResolvedValue([]);

    const interaction = createMockInteraction();
    await handleList(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              description: 'No events scheduled.',
            }),
          }),
        ]),
      }),
    );
  });

  it('lists schedules with formatted dates', async () => {
    mockPrisma.schedule.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: null,
        guildName: 'Test Guild',
        name: 'Event One',
        date: new Date('2099-06-01T14:00:00'),
        dateUtc: new Date('2099-06-01T12:00:00Z'),
        closingDate: null,
        closingDateUtc: null,
        image: null,
        timeBefore: '-6',
        botPosted: false,
        attendees: {},
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const interaction = createMockInteraction();
    await handleList(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              description: expect.stringContaining('Event One'),
            }),
          }),
        ]),
      }),
    );
  });

  it('handles errors gracefully', async () => {
    mockPrisma.schedule.findMany.mockRejectedValue(new Error('DB error'));

    const interaction = createMockInteraction();
    await handleList(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('I could not list schedules') }),
    );
  });
});
