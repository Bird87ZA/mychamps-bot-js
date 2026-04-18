import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreate } from '../../../src/handlers/attendance/create';
import { prisma } from '../../../src/database';
import { createMockInteraction } from '../../mocks/discord';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../../src/utils/reminders', () => ({
  rebuildReminders: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleCreate (attendance)', () => {
  it('rejects when no timezone is set', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue(null);

    const interaction = createMockInteraction();
    await handleCreate(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('timezone') }),
    );
  });

  it('rejects when attendance already exists for channel', async () => {
    mockPrisma.setting.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      key: 'timezone',
      value: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.attendance.findFirst.mockResolvedValue({
      id: 1,
      guildId: BigInt(123),
      channelId: BigInt(987654321),
      fullTime: BigInt(111),
      reserve: null,
      commentator: null,
      attendees: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const interaction = createMockInteraction();
    await handleCreate(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'An attendance bot already exists for this channel.',
      }),
    );
  });

  it('creates attendance successfully with roles', async () => {
    // First call for hasTimezone, second call for attendance check
    let settingsCallCount = 0;
    mockPrisma.setting.findFirst.mockImplementation(async () => {
      settingsCallCount++;
      if (settingsCallCount === 1) {
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
    mockPrisma.attendance.findFirst.mockResolvedValue(null);
    mockPrisma.attendance.create.mockResolvedValue({} as never);
    mockPrisma.schedule.findFirst.mockResolvedValue(null);

    const interaction = createMockInteraction();
    interaction.options.getRole.mockImplementation((name: string) => {
      if (name === 'full-time') return { id: '111', name: 'Full Time' };
      if (name === 'reserve') return { id: '222', name: 'Reserve' };
      if (name === 'team-1') return { id: '333', name: 'Team Alpha' };
      return null;
    });

    await handleCreate(interaction as never);

    expect(mockPrisma.attendance.create).toHaveBeenCalled();
    const createArgs = mockPrisma.attendance.create.mock.calls[0][0];
    expect(createArgs.data.attendees).toHaveProperty('Team Alpha');
    expect(createArgs.data.attendees).toHaveProperty('Reserves');
    expect(createArgs.data.attendees).toHaveProperty('Not Participating');
  });

  it('suggests creating schedule when none exists', async () => {
    let settingsCallCount = 0;
    mockPrisma.setting.findFirst.mockImplementation(async () => {
      settingsCallCount++;
      if (settingsCallCount === 1) {
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
    mockPrisma.attendance.findFirst.mockResolvedValue(null);
    mockPrisma.attendance.create.mockResolvedValue({} as never);
    mockPrisma.schedule.findFirst.mockResolvedValue(null);

    const interaction = createMockInteraction();
    interaction.options.getRole.mockImplementation((name: string) => {
      if (name === 'full-time') return { id: '111', name: 'Full Time' };
      return null;
    });

    await handleCreate(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('/schedule add'),
      }),
    );
  });
});
