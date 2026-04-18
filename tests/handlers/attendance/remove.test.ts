import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRemove } from '../../../src/handlers/attendance/remove';
import { prisma } from '../../../src/database';
import { createMockInteraction } from '../../mocks/discord';

const mockPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleRemove (attendance)', () => {
  it('reports when no attendance exists', async () => {
    mockPrisma.attendance.findFirst.mockResolvedValue(null);

    const interaction = createMockInteraction();
    await handleRemove(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'No attendance configuration found.' }),
    );
  });

  it('deletes attendance and related reminders', async () => {
    mockPrisma.attendance.findFirst.mockResolvedValue({
      id: 5,
      guildId: BigInt(123),
      channelId: BigInt(987654321),
      fullTime: BigInt(111),
      reserve: null,
      commentator: null,
      attendees: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.schedule.findMany.mockResolvedValue([{ id: 10 } as never, { id: 20 } as never]);
    mockPrisma.reminder.deleteMany.mockResolvedValue({ count: 3 });
    mockPrisma.attendance.delete.mockResolvedValue({} as never);

    const interaction = createMockInteraction();
    await handleRemove(interaction as never);

    expect(mockPrisma.reminder.deleteMany).toHaveBeenCalledWith({
      where: { scheduleId: { in: ['10', '20'] } },
    });
    expect(mockPrisma.attendance.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Attendance configuration removed.' }),
    );
  });

  it('deletes attendance without reminders when no schedules exist', async () => {
    mockPrisma.attendance.findFirst.mockResolvedValue({
      id: 5,
      guildId: BigInt(123),
      channelId: BigInt(987654321),
      fullTime: BigInt(111),
      reserve: null,
      commentator: null,
      attendees: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.schedule.findMany.mockResolvedValue([]);
    mockPrisma.attendance.delete.mockResolvedValue({} as never);

    const interaction = createMockInteraction();
    await handleRemove(interaction as never);

    expect(mockPrisma.reminder.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('handles errors gracefully', async () => {
    mockPrisma.attendance.findFirst.mockRejectedValue(new Error('DB error'));

    const interaction = createMockInteraction();
    await handleRemove(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'An error occurred.' }),
    );
  });
});
