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

  // ── Issue #2: new incident/API settings ────────────────────────────────────

  it('saves incident-category channel id', async () => {
    const interaction = createMockInteraction({
      options: {
        getString: vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(null),
        getChannel: vi.fn().mockImplementation((name: string) => {
          if (name === 'incident-category') return { id: 'cat-channel-id-111' };
          return null;
        }),
        getRole: vi.fn().mockReturnValue(null),
      },
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'incident-category', 'cat-channel-id-111');
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Settings updated successfully.' }),
    );
  });

  it('saves steward-role role id', async () => {
    const interaction = createMockInteraction({
      options: {
        getString: vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(null),
        getChannel: vi.fn().mockReturnValue(null),
        getRole: vi.fn().mockImplementation((name: string) => {
          if (name === 'steward-role') return { id: 'role-id-222' };
          return null;
        }),
      },
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'steward-role', 'role-id-222');
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Settings updated successfully.' }),
    );
  });

  it('saves incident-reminder-interval', async () => {
    const interaction = createMockInteraction({
      options: {
        getString: vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockImplementation((name: string) => {
          if (name === 'incident-reminder-interval') return 12;
          return null;
        }),
        getChannel: vi.fn().mockReturnValue(null),
        getRole: vi.fn().mockReturnValue(null),
      },
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'incident-reminder-interval', '12');
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Settings updated successfully.' }),
    );
  });

  it('saves mychamps-api-url', async () => {
    const interaction = createMockInteraction({
      options: {
        getString: vi.fn().mockImplementation((name: string) => {
          if (name === 'mychamps-api-url') return 'https://api.mychamps.example.com';
          return null;
        }),
        getInteger: vi.fn().mockReturnValue(null),
        getChannel: vi.fn().mockReturnValue(null),
        getRole: vi.fn().mockReturnValue(null),
      },
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith(
      '123456789',
      'mychamps-api-url',
      'https://api.mychamps.example.com',
    );
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Settings updated successfully.' }),
    );
  });

  it('saves mychamps-api-token', async () => {
    const interaction = createMockInteraction({
      options: {
        getString: vi.fn().mockImplementation((name: string) => {
          if (name === 'mychamps-api-token') return 'super-secret-token-abc';
          return null;
        }),
        getInteger: vi.fn().mockReturnValue(null),
        getChannel: vi.fn().mockReturnValue(null),
        getRole: vi.fn().mockReturnValue(null),
      },
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith(
      '123456789',
      'mychamps-api-token',
      'super-secret-token-abc',
    );
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Settings updated successfully.' }),
    );
  });

  it('saves multiple new settings in one call', async () => {
    const interaction = createMockInteraction({
      options: {
        getString: vi.fn().mockImplementation((name: string) => {
          if (name === 'mychamps-api-url') return 'https://api.mychamps.example.com';
          if (name === 'mychamps-api-token') return 'tok-xyz';
          return null;
        }),
        getInteger: vi.fn().mockImplementation((name: string) => {
          if (name === 'incident-reminder-interval') return 48;
          return null;
        }),
        getChannel: vi.fn().mockImplementation((name: string) => {
          if (name === 'incident-category') return { id: 'cat-999' };
          return null;
        }),
        getRole: vi.fn().mockImplementation((name: string) => {
          if (name === 'steward-role') return { id: 'role-777' };
          return null;
        }),
      },
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'incident-category', 'cat-999');
    expect(setSetting).toHaveBeenCalledWith('123456789', 'steward-role', 'role-777');
    expect(setSetting).toHaveBeenCalledWith('123456789', 'incident-reminder-interval', '48');
    expect(setSetting).toHaveBeenCalledWith(
      '123456789',
      'mychamps-api-url',
      'https://api.mychamps.example.com',
    );
    expect(setSetting).toHaveBeenCalledWith('123456789', 'mychamps-api-token', 'tok-xyz');
  });

  it('handles errors gracefully', async () => {
    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation(() => {
      throw new Error('Something went wrong');
    });
    interaction.options.getInteger.mockReturnValue(null);
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Something went wrong' }),
    );
  });
});
