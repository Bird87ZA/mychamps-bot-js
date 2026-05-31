import { describe, it, expect, vi, beforeEach } from 'vitest';
import { incidentCommand } from '../../src/commands/incident';
import { prisma } from '../../src/database';
import { createMockInteraction, createMockClient } from '../mocks/discord';
import { PermissionFlagsBits } from 'discord.js';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../src/services/myChampsApiClient', () => ({
  MYCHAMPS_API_BASE_URL: 'https://mychamps.gg',
  MyChampsApiClient: {
    fromGuild: vi.fn(),
  },
}));

vi.mock('../../src/utils/settings', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  hasTimezone: vi.fn(),
  guildsWithRemindersEnabled: vi.fn(),
}));

import { MyChampsApiClient } from '../../src/services/myChampsApiClient';
import { getSetting } from '../../src/utils/settings';

const mockFromGuild = vi.mocked(MyChampsApiClient.fromGuild);
const mockGetSetting = vi.mocked(getSetting);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('incidentCommand', () => {
  it('has correct command name', () => {
    expect(incidentCommand.data.name).toBe('incident');
  });

  it('has setup and close subcommands', () => {
    const json = incidentCommand.data.toJSON();
    const subcommands = json.options?.map((o: { name: string }) => o.name) ?? [];
    expect(subcommands).toContain('setup');
    expect(subcommands).toContain('close');
  });

  describe('setup subcommand', () => {
    it('rejects non-admin users', async () => {
      const interaction = createMockInteraction({
        memberPermissions: {
          has: vi.fn().mockReturnValue(false),
        },
      });
      interaction.options.getSubcommand.mockReturnValue('setup');
      const client = createMockClient();

      await incidentCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('permissions'),
        }),
      );
    });

    it('replies with error when API client cannot be created', async () => {
      const interaction = createMockInteraction({
        memberPermissions: {
          has: vi.fn((perm) => perm === PermissionFlagsBits.Administrator),
        },
      });
      interaction.options.getSubcommand.mockReturnValue('setup');
      const client = createMockClient();

      mockFromGuild.mockRejectedValue(new Error('API not configured'));

      await incidentCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('API token is missing'),
        }),
      );
    });

    it('replies with error when no championships found', async () => {
      const interaction = createMockInteraction({
        memberPermissions: {
          has: vi.fn((perm) => perm === PermissionFlagsBits.Administrator),
        },
      });
      interaction.options.getSubcommand.mockReturnValue('setup');
      const client = createMockClient();

      const mockApiClient = { getChampionships: vi.fn().mockResolvedValue([]) };
      mockFromGuild.mockResolvedValue(mockApiClient as never);

      await incidentCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No championships were found'),
        }),
      );
    });

    it('replies with error when championships fetch fails', async () => {
      const interaction = createMockInteraction({
        memberPermissions: {
          has: vi.fn((perm) => perm === PermissionFlagsBits.Administrator),
        },
      });
      interaction.options.getSubcommand.mockReturnValue('setup');
      const client = createMockClient();

      const mockApiClient = {
        getChampionships: vi.fn().mockRejectedValue(new Error('API error')),
      };
      mockFromGuild.mockResolvedValue(mockApiClient as never);

      await incidentCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('I could not fetch championships from MyChamps'),
        }),
      );
    });

    it('opens setup modal with newest championship per team in setup order', async () => {
      const championships = [
        {
          id: 1,
          team_id: 2,
          name: 'Championship 1',
          slug: 'team-b-champ-1',
          team_name: 'Team B',
          created_at: '2026-01-01T12:00:00.000Z',
        },
        {
          id: 2,
          team_id: 1,
          name: 'Championship 1',
          slug: 'team-a-champ-1',
          team_name: 'Team A',
          created_at: '2026-01-01T12:00:00.000Z',
        },
        {
          id: 3,
          team_id: 2,
          name: 'Championship 3',
          slug: 'team-b-champ-3',
          team_name: 'Team B',
          created_at: '2026-01-03T12:00:00.000Z',
        },
        {
          id: 4,
          team_id: 1,
          name: 'Championship 3',
          slug: 'team-a-champ-3',
          team_name: 'Team A',
          created_at: '2026-01-03T12:00:00.000Z',
        },
        {
          id: 5,
          team_id: 2,
          name: 'Championship 2',
          slug: 'team-b-champ-2',
          team_name: 'Team B',
          created_at: '2026-01-02T12:00:00.000Z',
        },
        {
          id: 6,
          team_id: 1,
          name: 'Championship 2',
          slug: 'team-a-champ-2',
          team_name: 'Team A',
          created_at: '2026-01-02T12:00:00.000Z',
        },
      ];

      const interaction = createMockInteraction({
        memberPermissions: {
          has: vi.fn((perm) => perm === PermissionFlagsBits.Administrator),
        },
        channel: {
          type: 0, // GuildText
          id: '987654321',
          send: vi.fn(),
        },
        showModal: vi.fn(),
        awaitModalSubmit: vi.fn().mockRejectedValue(new Error('timeout')),
      });
      interaction.options.getSubcommand.mockReturnValue('setup');
      const client = createMockClient();

      const mockApiClient = { getChampionships: vi.fn().mockResolvedValue(championships) };
      mockFromGuild.mockResolvedValue(mockApiClient as never);

      await incidentCommand.execute(interaction as never, client as never);

      expect(interaction.showModal).toHaveBeenCalled();

      const modalJson = interaction.showModal.mock.calls[0][0].toJSON();
      const championshipComponent = modalJson.components.find(
        (component: { label?: string }) => component.label === 'Championship',
      )?.component as {
        options: Array<{ label: string; value: string }>;
      };

      expect(championshipComponent.options.map((option) => option.label)).toEqual([
        'Team A - Championship 3',
        'Team B - Championship 3',
      ]);
      expect(championshipComponent.options.map((option) => option.value)).toEqual([
        'team-a-champ-3',
        'team-b-champ-3',
      ]);
      expect(modalJson.components.map((component: { label?: string }) => component.label)).toEqual([
        'Championship',
        'Button Label',
        'Button Color',
        'Button Message',
        'Channel Group',
      ]);

      const colorComponent = modalJson.components.find(
        (component: { label?: string }) => component.label === 'Button Color',
      )?.component as {
        options: Array<{ label: string; value: string }>;
      };
      expect(colorComponent.options.map((option) => option.label)).toEqual([
        'Blue',
        'Grey',
        'Green',
        'Red',
        'Purple',
        'Orange',
        'Yellow',
        'Teal',
        'Pink',
      ]);
    });

    it('posts incident button from setup modal selections', async () => {
      const championships = [{ name: 'Championship A', slug: 'champ-a' }];
      const mockSend = vi.fn().mockResolvedValue({ id: 'posted-message-id' });
      const mockRolesModalSubmit = {
        fields: {
          getSelectedRoles: vi.fn((field: string) => {
            if (field === 'incident_setup_steward_roles') {
              return new Map([
                ['steward-role-a', { id: 'steward-role-a' }],
                ['steward-role-b', { id: 'steward-role-b' }],
              ]);
            }
            if (field === 'incident_setup_channel_roles') {
              return new Map([
                ['channel-role-a', { id: 'channel-role-a' }],
                ['channel-role-b', { id: 'channel-role-b' }],
              ]);
            }
            return new Map();
          }),
          getCheckbox: vi.fn((field: string) => field === 'incident_setup_add_reporter_to_channel'),
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
        user: { id: 'user1' },
      };
      const mockContinueInteraction = {
        customId: 'incident_setup_continue',
        user: { id: 'user1' },
        showModal: vi.fn(),
        awaitModalSubmit: vi.fn().mockResolvedValue(mockRolesModalSubmit),
      };
      const mockContinueMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(mockContinueInteraction),
      };
      const mockModalSubmit = {
        fields: {
          getStringSelectValues: vi.fn((field: string) => {
            if (field === 'incident_setup_championship') return ['champ-a'];
            if (field === 'incident_setup_button_color') return ['Purple'];
            return [];
          }),
          getTextInputValue: vi.fn((field: string) => {
            if (field === 'incident_setup_button_label') return 'Report Race Incident';
            if (field === 'incident_setup_button_message') return 'Use this custom intro.';
            return '';
          }),
          getSelectedChannels: vi.fn(
            () => new Map([['incident-category-id', { id: 'incident-category-id' }]]),
          ),
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(mockContinueMessage),
        user: { id: 'user1' },
      };
      const interaction = createMockInteraction({
        memberPermissions: {
          has: vi.fn((perm) => perm === PermissionFlagsBits.Administrator),
        },
        channel: {
          type: 0,
          id: '987654321',
          send: mockSend,
        },
        showModal: vi.fn(),
        awaitModalSubmit: vi.fn().mockResolvedValue(mockModalSubmit),
      });
      interaction.options.getSubcommand.mockReturnValue('setup');
      const client = createMockClient();

      mockFromGuild.mockResolvedValue({
        getChampionships: vi.fn().mockResolvedValue(championships),
      } as never);
      mockPrisma.incidentButton.create.mockResolvedValue({} as never);

      await incidentCommand.execute(interaction as never, client as never);

      expect(mockContinueInteraction.showModal).toHaveBeenCalled();
      const rolesModalJson = mockContinueInteraction.showModal.mock.calls[0][0].toJSON();
      expect(
        rolesModalJson.components.map((component: { label?: string }) => component.label),
      ).toEqual(['Stewards Role', 'Roles to Add to Channel', 'Add reporter to channel']);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.any(Array),
          embeds: expect.any(Array),
        }),
      );
      const embedPayload = mockSend.mock.calls[0][0].embeds[0].data;
      expect(embedPayload.description).toBe('Use this custom intro.');
      expect(embedPayload.color).toBe(0x9b59b6);
      expect(mockPrisma.incidentButton.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            championshipSlug: 'champ-a',
            incidentCategoryId: 'incident-category-id',
            stewardRoleIds: ['steward-role-a', 'steward-role-b'],
            channelRoleIds: ['channel-role-a', 'channel-role-b'],
            addReporterToChannel: true,
            buttonMessage: 'Use this custom intro.',
            buttonLabel: 'Report Race Incident',
            buttonColor: 'Purple',
          }),
        }),
      );
      expect(mockRolesModalSubmit.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('posted successfully') }),
      );
    });

    it('explains missing channel permissions when setup message cannot be posted', async () => {
      const championships = [{ name: 'Championship A', slug: 'champ-a' }];
      const mockSend = vi.fn().mockRejectedValue({ code: 50001 });
      const mockRolesModalSubmit = {
        fields: {
          getSelectedRoles: vi.fn((field: string) => {
            if (field === 'incident_setup_steward_roles') {
              return new Map([['steward-role-a', { id: 'steward-role-a' }]]);
            }
            return new Map();
          }),
          getCheckbox: vi.fn(() => false),
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
        user: { id: 'user1' },
      };
      const mockContinueInteraction = {
        customId: 'incident_setup_continue',
        user: { id: 'user1' },
        showModal: vi.fn(),
        awaitModalSubmit: vi.fn().mockResolvedValue(mockRolesModalSubmit),
      };
      const mockContinueMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(mockContinueInteraction),
      };
      const mockModalSubmit = {
        fields: {
          getStringSelectValues: vi.fn((field: string) => {
            if (field === 'incident_setup_championship') return ['champ-a'];
            if (field === 'incident_setup_button_color') return ['Grey'];
            return [];
          }),
          getTextInputValue: vi.fn((field: string) => {
            if (field === 'incident_setup_button_label') return 'Report Race Incident';
            if (field === 'incident_setup_button_message') return 'Use this custom intro.';
            return '';
          }),
          getSelectedChannels: vi.fn(
            () => new Map([['incident-category-id', { id: 'incident-category-id' }]]),
          ),
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(mockContinueMessage),
        user: { id: 'user1' },
      };
      const interaction = createMockInteraction({
        memberPermissions: {
          has: vi.fn((perm) => perm === PermissionFlagsBits.Administrator),
        },
        channel: {
          type: 0,
          id: '987654321',
          send: mockSend,
        },
        showModal: vi.fn(),
        awaitModalSubmit: vi.fn().mockResolvedValue(mockModalSubmit),
      });
      interaction.options.getSubcommand.mockReturnValue('setup');
      const client = createMockClient();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      mockFromGuild.mockResolvedValue({
        getChampionships: vi.fn().mockResolvedValue(championships),
      } as never);

      await incidentCommand.execute(interaction as never, client as never);

      expect(mockPrisma.incidentButton.create).not.toHaveBeenCalled();
      expect(mockRolesModalSubmit.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('View Channel'),
        }),
      );
      expect(mockRolesModalSubmit.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Send Messages'),
        }),
      );
      expect(mockRolesModalSubmit.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Embed Links'),
        }),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('close subcommand', () => {
    it('rejects when not in an incident channel', async () => {
      const interaction = createMockInteraction();
      interaction.options.getSubcommand.mockReturnValue('close');
      const client = createMockClient();

      mockPrisma.incident.findFirst.mockResolvedValue(null);

      await incidentCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('active incident channel'),
        }),
      );
    });

    it('shows verdict select menu when in incident channel', async () => {
      const mockVerdictSelectInteraction = {
        user: { id: 'user1' },
        values: ['Warning'],
        showModal: vi.fn(),
        awaitModalSubmit: vi.fn().mockRejectedValue(new Error('timeout')),
        editReply: vi.fn(),
      };

      const interaction = createMockInteraction({
        channel: {
          type: 0,
          id: '987654321',
          awaitMessageComponent: vi.fn().mockResolvedValue(mockVerdictSelectInteraction),
        },
        editReply: vi.fn(),
      });
      interaction.options.getSubcommand.mockReturnValue('close');
      const client = createMockClient();

      mockPrisma.incident.findFirst.mockResolvedValue({
        id: 1,
        guildId: '123456789',
        channelId: '987654321',
        mychampsIncidentId: null,
        championshipSlug: 'champ-a',
        defendants: ['Driver A'],
        status: 'awaiting_review',
        defenceSubmitted: [],
        lastReminderAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockGetSetting.mockResolvedValue(null);

      await incidentCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Select the verdict type'),
          components: expect.any(Array),
        }),
      );
    });

    it('closes incident and posts verdict embed on submission', async () => {
      const mockModalSubmit = {
        fields: {
          getTextInputValue: vi.fn((field: string) => {
            if (field === 'verdict_description') return 'No action taken.';
            return '';
          }),
        },
        reply: vi.fn(),
        user: { id: 'user1' },
      };

      const mockVerdictSelectInteraction = {
        user: { id: 'user1' },
        values: ['NFA'],
        showModal: vi.fn(),
        awaitModalSubmit: vi.fn().mockResolvedValue(mockModalSubmit),
        editReply: vi.fn(),
      };

      const mockChannel = {
        type: 0,
        id: '987654321',
        awaitMessageComponent: vi.fn().mockResolvedValue(mockVerdictSelectInteraction),
        permissionOverwrites: {
          edit: vi.fn(),
        },
      };

      const interaction = createMockInteraction({
        channel: mockChannel,
        guild: {
          name: 'Test Guild',
          iconURL: () => 'https://icon.url',
          roles: {
            everyone: { id: 'everyone-id' },
          },
        },
        editReply: vi.fn(),
      });
      interaction.options.getSubcommand.mockReturnValue('close');
      const client = createMockClient();

      mockPrisma.incident.findFirst.mockResolvedValue({
        id: 1,
        guildId: '123456789',
        channelId: '987654321',
        mychampsIncidentId: null,
        championshipSlug: 'champ-a',
        defendants: ['Driver A'],
        status: 'awaiting_review',
        defenceSubmitted: [],
        lastReminderAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.incident.update.mockResolvedValue({} as never);
      mockGetSetting.mockImplementation(async (_guildId, key) => {
        if (key === 'ticket-access-roles') return '["ticket-role-a","ticket-role-b"]';
        return null;
      });

      await incidentCommand.execute(interaction as never, client as never);

      expect(mockModalSubmit.reply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
      expect(mockPrisma.incident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: 'closed' }),
        }),
      );
      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        'ticket-role-a',
        expect.objectContaining({ ViewChannel: true, SendMessages: false }),
      );
      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        'ticket-role-b',
        expect.objectContaining({ ViewChannel: true, SendMessages: false }),
      );
    });
  });
});
