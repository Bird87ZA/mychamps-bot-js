import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { settingsCommand } from '../../src/commands/settings';
import { createMockInteraction, createMockClient } from '../mocks/discord';

vi.mock('../../src/utils/settings', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock('../../src/utils/reminders', () => ({
  rebuildReminders: vi.fn(),
}));
vi.mock('../../src/services/myChampsApiClient', () => ({
  MyChampsApiClient: {
    fromGuild: vi.fn(),
  },
}));

import { getSetting, setSetting } from '../../src/utils/settings';
import { MyChampsApiClient } from '../../src/services/myChampsApiClient';

const mockGetSetting = vi.mocked(getSetting);
const mockFromGuild = vi.mocked(MyChampsApiClient.fromGuild);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('settingsCommand', () => {
  it('has correct command name', () => {
    expect(settingsCommand.data.name).toBe('settings');
  });

  it('saves valid timezone', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('timezone');
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'value') return 'Africa/Johannesburg';
      return null;
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'timezone', 'Africa/Johannesburg');
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Settings updated successfully.' }),
    );
  });

  it('rejects invalid timezone', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('timezone');
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'value') return 'Invalid/Zone';
      return null;
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Invalid timezone') }),
    );
  });

  it('saves valid post-time', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('post-time');
    interaction.options.getInteger.mockImplementation((name: string) => {
      if (name === 'days') return 3;
      return null;
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'post-time', '3');
  });

  it('saves remind-attendees and rebuilds reminders', async () => {
    const { rebuildReminders } = await import('../../src/utils/reminders');

    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('remind-attendees');
    interaction.options.getInteger.mockImplementation((name: string) => {
      if (name === 'hours') return 4;
      return null;
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'remind-attendees', '4');
    expect(rebuildReminders).toHaveBeenCalledWith('123456789');
  });

  it('saves incident-category channel id', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('incident-category');
    interaction.options.getChannel.mockImplementation((name: string) => {
      if (name === 'channel') return { id: 'cat-channel-id-111' };
      return null;
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'incident-category', 'cat-channel-id-111');
  });

  it('saves steward-role role id', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('steward-role');
    interaction.options.getRole.mockImplementation((name: string) => {
      if (name === 'role') return { id: 'role-id-222' };
      return null;
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'steward-role', 'role-id-222');
  });

  it('saves incident-reminder-interval', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('incident-reminder-interval');
    interaction.options.getInteger.mockImplementation((name: string) => {
      if (name === 'hours') return 12;
      return null;
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'incident-reminder-interval', '12');
  });

  it('saves mychamps-api-url', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('mychamps-api-url');
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'value') return 'https://api.mychamps.example.com';
      return null;
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith(
      '123456789',
      'mychamps-api-url',
      'https://api.mychamps.example.com',
    );
  });

  it('saves mychamps-api-token', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('mychamps-api-token');
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'value') return 'super-secret-token-abc';
      return null;
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith(
      '123456789',
      'mychamps-api-token',
      'super-secret-token-abc',
    );
  });

  it('handles errors gracefully', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockImplementation(() => {
      throw new Error('Something went wrong');
    });
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Something went wrong' }),
    );
  });

  it('rejects stats settings for non-admin users', async () => {
    const interaction = createMockInteraction({
      memberPermissions: {
        has: vi.fn().mockReturnValue(false),
      },
    });
    interaction.options.getSubcommand.mockReturnValue('stats');
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('permissions') }),
    );
  });

  it('saves selected stats leagues', async () => {
    const mockSelectInteraction = {
      user: { id: 'user1' },
      values: ['1', '2'],
      update: vi.fn(),
    };
    const interaction = createMockInteraction({
      memberPermissions: {
        has: vi.fn((perm) => perm === PermissionFlagsBits.ManageGuild),
      },
      channel: {
        awaitMessageComponent: vi.fn().mockResolvedValue(mockSelectInteraction),
      },
      editReply: vi.fn(),
    });
    interaction.options.getSubcommand.mockReturnValue('stats');
    const client = createMockClient();
    const mockApiClient = {
      getManagedStatsLeagues: vi.fn().mockResolvedValue([
        { id: 1, name: 'League A', slug: 'league-a' },
        { id: 2, name: 'League B', slug: 'league-b' },
      ]),
    };
    mockFromGuild.mockResolvedValue(mockApiClient as never);
    mockGetSetting.mockResolvedValue('[2]');

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Select the leagues'),
        components: expect.any(Array),
      }),
    );
    expect(setSetting).toHaveBeenCalledWith('123456789', 'stats-league-ids', '[1,2]');
    expect(mockSelectInteraction.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('2 leagues') }),
    );
  });
});
