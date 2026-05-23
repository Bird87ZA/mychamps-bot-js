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

function createSettingsModalSubmit({
  customId = 'settings_modal',
  textValues,
  incidentsCategoryId,
  ticketAccessRoleIds = [],
}: {
  customId?: string;
  textValues: Record<string, string>;
  incidentsCategoryId?: string;
  ticketAccessRoleIds?: string[];
}) {
  return {
    user: { id: 'user1' },
    customId,
    deferReply: vi.fn(),
    editReply: vi.fn(),
    fields: {
      getTextInputValue: vi.fn((field: string) => textValues[field] ?? ''),
      getSelectedChannels: vi.fn(() =>
        incidentsCategoryId ? { first: () => ({ id: incidentsCategoryId }) } : null,
      ),
      getSelectedRoles: vi.fn(() =>
        ticketAccessRoleIds.length > 0
          ? new Map(ticketAccessRoleIds.map((roleId) => [roleId, { id: roleId }]))
          : null,
      ),
    },
  };
}

describe('settingsCommand', () => {
  it('has correct command name', () => {
    expect(settingsCommand.data.name).toBe('settings');
  });

  it('opens settings directly and keeps optional settings sections', () => {
    const json = settingsCommand.data.toJSON();
    const optionNames = json.options?.map((o: { name: string }) => o.name) ?? [];
    const sectionOption = json.options?.find(
      (option: { name: string }) => option.name === 'section',
    ) as { choices?: Array<{ value: string }> } | undefined;

    expect(optionNames).not.toContain('mychamps-api-url');
    expect(optionNames).not.toContain('mychamps-api-token');
    expect(optionNames).toContain('section');
    expect(sectionOption?.choices?.map((choice) => choice.value)).toEqual(
      expect.arrayContaining(['stats', 'incidents']),
    );
  });

  it('rejects settings modal for non-admin users', async () => {
    const interaction = createMockInteraction({
      memberPermissions: {
        has: vi.fn().mockReturnValue(false),
      },
    });
    interaction.options.getString.mockReturnValue(null);
    const client = createMockClient();

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('permissions') }),
    );
  });

  it('shows settings modal with saved settings', async () => {
    const interaction = createMockInteraction({
      memberPermissions: {
        has: vi.fn((perm) => perm === PermissionFlagsBits.ManageGuild),
      },
      showModal: vi.fn(),
      awaitModalSubmit: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    interaction.options.getString.mockReturnValue(null);
    const client = createMockClient();
    mockGetSetting.mockImplementation(async (_guildId, key) => {
      const values: Record<string, string> = {
        timezone: 'Europe/Berlin',
        'post-time': '3',
        'remind-attendees': '4',
        'incident-reminder-interval': '12',
        'mychamps-api-token': 'token-abc',
        'incidents-category': 'category-123',
        'ticket-access-roles': '["role-456","role-789"]',
      };

      return values[key] ?? null;
    });

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.showModal).toHaveBeenCalled();

    const modalJson = interaction.showModal.mock.calls[0][0].toJSON();
    const timezoneComponent = modalJson.components.find(
      (component: { label?: string }) => component.label === 'Timezone',
    )?.component;

    expect(modalJson.custom_id).toBe('settings_modal');
    expect(modalJson.components).toHaveLength(5);
    expect(timezoneComponent).not.toHaveProperty('label');
    expect(modalJson.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Timezone',
          component: expect.objectContaining({
            custom_id: 'settings_timezone',
            value: 'Europe/Berlin',
          }),
        }),
      ]),
    );
    expect(modalJson.components).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Incidents Category' }),
        expect.objectContaining({ label: 'Ticket Access Roles' }),
      ]),
    );
  });

  it('shows incident settings modal with saved settings', async () => {
    const interaction = createMockInteraction({
      memberPermissions: {
        has: vi.fn((perm) => perm === PermissionFlagsBits.ManageGuild),
      },
      showModal: vi.fn(),
      awaitModalSubmit: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'section') return 'incidents';
      return null;
    });
    const client = createMockClient();
    mockGetSetting.mockImplementation(async (_guildId, key) => {
      const values: Record<string, string> = {
        'incidents-category': 'category-123',
        'ticket-access-roles': '["role-456","role-789"]',
      };

      return values[key] ?? null;
    });

    await settingsCommand.execute(interaction as never, client as never);

    expect(interaction.showModal).toHaveBeenCalled();

    const modalJson = interaction.showModal.mock.calls[0][0].toJSON();

    expect(modalJson.custom_id).toBe('incident_settings_modal');
    expect(modalJson.components).toHaveLength(2);
    expect(modalJson.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Incidents Category',
          component: expect.objectContaining({ custom_id: 'settings_incidents_category' }),
        }),
        expect.objectContaining({
          label: 'Ticket Access Roles',
          component: expect.objectContaining({
            custom_id: 'settings_ticket_access_roles',
            max_values: 25,
          }),
        }),
      ]),
    );
  });

  it('saves settings from modal submission', async () => {
    const { rebuildReminders } = await import('../../src/utils/reminders');
    const modalSubmit = createSettingsModalSubmit({
      textValues: {
        settings_timezone: 'Africa/Johannesburg',
        settings_post_time: '3',
        settings_remind_attendees: '4',
        settings_incident_reminder_interval: '12',
        settings_mychamps_api_token: 'super-secret-token-abc',
      },
    });

    const interaction = createMockInteraction({
      memberPermissions: {
        has: vi.fn((perm) => perm === PermissionFlagsBits.ManageGuild),
      },
      showModal: vi.fn(),
      awaitModalSubmit: vi.fn().mockResolvedValue(modalSubmit),
    });
    interaction.options.getString.mockReturnValue(null);
    const client = createMockClient();
    mockGetSetting.mockResolvedValue(null);

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledWith('123456789', 'timezone', 'Africa/Johannesburg');
    expect(setSetting).toHaveBeenCalledWith('123456789', 'post-time', '3');
    expect(setSetting).toHaveBeenCalledWith('123456789', 'remind-attendees', '4');
    expect(setSetting).toHaveBeenCalledWith('123456789', 'incident-reminder-interval', '12');
    expect(setSetting).toHaveBeenCalledWith(
      '123456789',
      'mychamps-api-token',
      'super-secret-token-abc',
    );
    expect(setSetting).not.toHaveBeenCalledWith(
      '123456789',
      'incidents-category',
      expect.anything(),
    );
    expect(setSetting).not.toHaveBeenCalledWith(
      '123456789',
      'ticket-access-roles',
      expect.anything(),
    );
    expect(rebuildReminders).toHaveBeenCalledWith('123456789');
    expect(modalSubmit.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Settings updated successfully.' }),
    );
  });

  it('saves incident settings from modal submission', async () => {
    const { rebuildReminders } = await import('../../src/utils/reminders');
    const modalSubmit = createSettingsModalSubmit({
      customId: 'incident_settings_modal',
      textValues: {},
      incidentsCategoryId: 'cat-channel-id-111',
      ticketAccessRoleIds: ['role-id-222', 'role-id-333'],
    });

    const interaction = createMockInteraction({
      memberPermissions: {
        has: vi.fn((perm) => perm === PermissionFlagsBits.ManageGuild),
      },
      showModal: vi.fn(),
      awaitModalSubmit: vi.fn().mockResolvedValue(modalSubmit),
    });
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'section') return 'incidents';
      return null;
    });
    const client = createMockClient();
    mockGetSetting.mockResolvedValue(null);

    await settingsCommand.execute(interaction as never, client as never);

    expect(setSetting).toHaveBeenCalledTimes(2);
    expect(setSetting).toHaveBeenCalledWith(
      '123456789',
      'incidents-category',
      'cat-channel-id-111',
    );
    expect(setSetting).toHaveBeenCalledWith(
      '123456789',
      'ticket-access-roles',
      '["role-id-222","role-id-333"]',
    );
    expect(rebuildReminders).not.toHaveBeenCalled();
    expect(modalSubmit.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Incident settings updated successfully.' }),
    );
  });

  it('rejects invalid timezone from modal submission', async () => {
    const modalSubmit = createSettingsModalSubmit({
      textValues: {
        settings_timezone: 'Invalid/Zone',
      },
    });

    const interaction = createMockInteraction({
      memberPermissions: {
        has: vi.fn((perm) => perm === PermissionFlagsBits.ManageGuild),
      },
      showModal: vi.fn(),
      awaitModalSubmit: vi.fn().mockResolvedValue(modalSubmit),
    });
    interaction.options.getString.mockReturnValue(null);
    const client = createMockClient();
    mockGetSetting.mockResolvedValue(null);

    await settingsCommand.execute(interaction as never, client as never);

    expect(modalSubmit.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Invalid timezone: Invalid/Zone' }),
    );
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('handles errors gracefully', async () => {
    const interaction = createMockInteraction();
    interaction.options.getString.mockImplementation(() => {
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
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'section') return 'stats';
      return null;
    });
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
    interaction.options.getString.mockImplementation((name: string) => {
      if (name === 'section') return 'stats';
      return null;
    });
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
