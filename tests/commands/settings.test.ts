import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsCommand } from '../../src/commands/settings';
import { createMockInteraction, createMockClient } from '../mocks/discord';

vi.mock('../../src/utils/settings', () => ({
  setSetting: vi.fn(),
}));
vi.mock('../../src/utils/reminders', () => ({
  rebuildReminders: vi.fn(),
}));

import { setSetting } from '../../src/utils/settings';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('settingsCommand', () => {
  it('has correct command name', () => {
    expect(settingsCommand.data.name).toBe('settings');
  });

  it('saves valid timezone', async () => {
    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'timezone') return 'Africa/Johannesburg';
      return null;
    });
    interaction.options.getInteger.mockReturnValue(null);
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'timezone', 'Africa/Johannesburg');
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Settings updated successfully.' }),
    );
  });

  it('rejects invalid timezone', async () => {
    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'timezone') return 'Invalid/Zone';
      return null;
    });
    interaction.options.getInteger.mockReturnValue(null);
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Invalid timezone') }),
    );
  });

  it('saves valid post-time', async () => {
    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'post-time') return '3';
      return null;
    });
    interaction.options.getInteger.mockReturnValue(null);
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'post-time', '3');
  });

  it('rejects non-numeric post-time', async () => {
    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'post-time') return 'abc';
      return null;
    });
    interaction.options.getInteger.mockReturnValue(null);
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Invalid post-time') }),
    );
  });

  it('saves remind-attendees and rebuilds reminders', async () => {
    const { rebuildReminders } = await import('../../src/utils/reminders');

    const interaction = createMockInteraction();
    interaction.options.getString.mockReturnValue(null);
    interaction.options.getInteger.mockReturnValue(4);
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'remind-attendees', '4');
    expect(rebuildReminders).toHaveBeenCalledWith('123456789');
  });
});
