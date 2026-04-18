import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomiserService } from '../../src/services/randomiser';
import { prisma } from '../../src/database';
import { createMockClient } from '../mocks/discord';

const mockPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('randomiserService', () => {
  it('has correct name and interval', () => {
    expect(randomiserService.name).toBe('Randomiser');
    expect(randomiserService.interval).toBe(60);
  });

  it('does nothing when no randomisers are due', async () => {
    mockPrisma.randomiser.findMany.mockResolvedValue([]);

    const client = createMockClient();
    await randomiserService.execute(client as never);

    expect(mockPrisma.randomiser.update).not.toHaveBeenCalled();
  });

  it('picks a random option and sends message', async () => {
    const mockSend = vi.fn();
    const mockChannel = { send: mockSend };

    mockPrisma.randomiser.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        options: 'Option A||Option B',
        repick: true,
        frequency: 1,
        repeat: 3,
        postAt: new Date('2020-01-01'),
        message: 'The winner is: {{ result }}',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.randomiser.update.mockResolvedValue({} as never);

    const client = createMockClient();
    client.channels.fetch.mockResolvedValue(mockChannel);

    await randomiserService.execute(client as never);

    expect(mockPrisma.randomiser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          repeat: 2,
        }),
      }),
    );
    expect(mockSend).toHaveBeenCalledWith(expect.stringMatching(/The winner is: Option [AB]/));
  });

  it('removes option when repick is disabled', async () => {
    const mockSend = vi.fn();
    const mockChannel = { send: mockSend };

    // Seed Math.random to get predictable result
    vi.spyOn(Math, 'random').mockReturnValue(0); // Picks first option

    mockPrisma.randomiser.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        options: 'A||B||C',
        repick: false,
        frequency: 1,
        repeat: 2,
        postAt: new Date('2020-01-01'),
        message: '{{ result }}',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.randomiser.update.mockResolvedValue({} as never);

    const client = createMockClient();
    client.channels.fetch.mockResolvedValue(mockChannel);

    await randomiserService.execute(client as never);

    expect(mockPrisma.randomiser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          options: 'B||C', // A was removed
          repeat: 1,
        }),
      }),
    );

    vi.restoreAllMocks();
  });

  it('handles errors gracefully', async () => {
    mockPrisma.randomiser.findMany.mockResolvedValue([
      {
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        options: 'A||B',
        repick: true,
        frequency: 1,
        repeat: 1,
        postAt: new Date('2020-01-01'),
        message: '{{ result }}',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.randomiser.update.mockRejectedValue(new Error('DB error'));

    const client = createMockClient();

    // Should not throw
    await randomiserService.execute(client as never);
  });
});
