import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRemove } from '../../../src/handlers/schedule/remove';
import { prisma } from '../../../src/database';
import { createMockInteraction } from '../../mocks/discord';

const mockPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleRemove (schedule)', () => {
  it('deletes schedule and its reminders', async () => {
    mockPrisma.schedule.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.reminder.deleteMany.mockResolvedValue({ count: 2 });

    const interaction = createMockInteraction();
    interaction.options.getInteger.mockReturnValue(42);

    await handleRemove(interaction as never);

    expect(mockPrisma.schedule.deleteMany).toHaveBeenCalledWith({
      where: { id: 42, channelId: BigInt('987654321') },
    });
    expect(mockPrisma.reminder.deleteMany).toHaveBeenCalledWith({
      where: { scheduleId: '42' },
    });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Event deleted successfully.' }),
    );
  });

  it('reports when no event found to delete', async () => {
    mockPrisma.schedule.deleteMany.mockResolvedValue({ count: 0 });

    const interaction = createMockInteraction();
    interaction.options.getInteger.mockReturnValue(999);

    await handleRemove(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'No event found to delete.' }),
    );
  });

  it('handles errors gracefully', async () => {
    mockPrisma.schedule.deleteMany.mockRejectedValue(new Error('DB error'));

    const interaction = createMockInteraction();
    interaction.options.getInteger.mockReturnValue(1);

    await handleRemove(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'An error occurred.' }),
    );
  });
});
