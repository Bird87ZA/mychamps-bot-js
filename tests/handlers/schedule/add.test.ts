import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAdd } from '../../../src/handlers/schedule/add';
import { prisma } from '../../../src/database';
import { createMockInteraction } from '../../mocks/discord';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../../src/utils/reminders', () => ({
  rebuildReminders: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleAdd', () => {
  it('rejects when no timezone is set', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue(null);

    const interaction = createMockInteraction();
    await handleAdd(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('timezone') }),
    );
  });

  it('rejects invalid date format', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      key: 'timezone',
      value: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'name') return 'Test Event';
      if (name === 'date') return 'invalid-date';
      return null;
    });

    await handleAdd(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Invalid date format') }),
    );
  });

  it('rejects dates in the past', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      key: 'timezone',
      value: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'name') return 'Test Event';
      if (name === 'date') return '20200101 12:00';
      return null;
    });

    await handleAdd(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'The date is in the past.' }),
    );
  });

  it('creates schedule successfully', async () => {
    mockPrisma.setting.findFirst.mockImplementation(async (args: { where: { key: string } }) => {
      if (args.where.key === 'timezone') {
        return {
          id: 1,
          guildId: '123456789',
          key: 'timezone',
          value: 'UTC',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never;
      }
      return null as never;
    });
    mockPrisma.schedule.create.mockResolvedValue({} as never);
    mockPrisma.attendance.findFirst.mockResolvedValue(null);

    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'name') return 'Test Event';
      if (name === 'date') return '20990601 14:00';
      return null;
    });

    await handleAdd(interaction as never);

    expect(mockPrisma.schedule.create).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Event scheduled successfully'),
      }),
    );
  });

  it('suggests creating attendance when none exists', async () => {
    mockPrisma.setting.findFirst.mockImplementation(async (args: { where: { key: string } }) => {
      if (args.where.key === 'timezone') {
        return {
          id: 1,
          guildId: '123456789',
          key: 'timezone',
          value: 'UTC',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never;
      }
      return null as never;
    });
    mockPrisma.schedule.create.mockResolvedValue({} as never);
    mockPrisma.attendance.findFirst.mockResolvedValue(null);

    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'name') return 'Test Event';
      if (name === 'date') return '20990601 14:00';
      return null;
    });

    await handleAdd(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('/attendance create'),
      }),
    );
  });

  it('rejects invalid closing date format', async () => {
    mockPrisma.setting.findFirst.mockImplementation(async (args: { where: { key: string } }) => {
      if (args.where.key === 'timezone') {
        return {
          id: 1,
          guildId: '123456789',
          key: 'timezone',
          value: 'UTC',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never;
      }
      return null as never;
    });

    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'name') return 'Test Event';
      if (name === 'date') return '20990601 14:00';
      if (name === 'closing-date') return 'bad-date';
      return null;
    });

    await handleAdd(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Invalid closing date format'),
      }),
    );
  });
});
