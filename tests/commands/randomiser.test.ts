import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomiserCommand } from '../../src/commands/randomiser';
import { prisma } from '../../src/database';
import { createMockInteraction, createMockClient } from '../mocks/discord';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../src/utils/settings', () => ({
  hasTimezone: vi.fn(),
  getSetting: vi.fn(),
}));

import { hasTimezone, getSetting } from '../../src/utils/settings';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('randomiserCommand', () => {
  it('has correct command name', () => {
    expect(randomiserCommand.data.name).toBe('randomiser');
  });

  it('rejects when no timezone is set', async () => {
    vi.mocked(hasTimezone).mockRejectedValue(new Error('Please set a timezone first'));

    const interaction = createMockInteraction();
    const client = createMockClient();

    await randomiserCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('timezone') }),
    );
  });

  it('creates randomiser with default values', async () => {
    vi.mocked(hasTimezone).mockResolvedValue(true);
    mockPrisma.randomiser.create.mockResolvedValue({} as never);

    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'options') return 'A||B||C';
      return null;
    });
    interaction.options.getBoolean.mockReturnValue(null);
    interaction.options.getInteger.mockReturnValue(null);
    const client = createMockClient();

    await randomiserCommand.execute(interaction as never, client as never);

    expect(mockPrisma.randomiser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        options: 'A||B||C',
        repick: false,
        frequency: 1,
        repeat: 1,
        message: '{{ result }}',
      }),
    });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Randomiser created successfully.' }),
    );
  });

  it('rejects invalid post_at date', async () => {
    vi.mocked(hasTimezone).mockResolvedValue(true);

    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'options') return 'A||B';
      if (name === 'post_at') return 'invalid';
      return null;
    });
    interaction.options.getBoolean.mockReturnValue(null);
    interaction.options.getInteger.mockReturnValue(null);
    const client = createMockClient();

    await randomiserCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Invalid date format') }),
    );
  });

  it('converts post_at to UTC using guild timezone', async () => {
    vi.mocked(hasTimezone).mockResolvedValue(true);
    vi.mocked(getSetting).mockResolvedValue('Africa/Johannesburg');
    mockPrisma.randomiser.create.mockResolvedValue({} as never);

    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'options') return 'A||B';
      if (name === 'post_at') return '20990601 14:00';
      if (name === 'message') return 'Pick: {{ result }}';
      return null;
    });
    interaction.options.getBoolean.mockReturnValue(null);
    interaction.options.getInteger.mockReturnValue(null);
    const client = createMockClient();

    await randomiserCommand.execute(interaction as never, client as never);

    expect(mockPrisma.randomiser.create).toHaveBeenCalled();
    const createArgs = mockPrisma.randomiser.create.mock.calls[0][0];
    // 14:00 SAST = 12:00 UTC
    expect(createArgs.data.postAt.getUTCHours()).toBe(12);
  });
});
