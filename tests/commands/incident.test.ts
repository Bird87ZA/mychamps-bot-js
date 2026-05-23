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
          content: expect.stringContaining('not configured'),
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
          content: expect.stringContaining('No championships found'),
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
          content: [
            'Failed to fetch championships from MyChamps API.',
            'Check that `mychamps-api-token` is valid and that your Discord account is linked on MyChamps.',
          ].join('\n'),
        }),
      );
    });

    it('shows championship select menu when championships are available', async () => {
      const championships = [
        { name: 'Championship A', slug: 'champ-a' },
        { name: 'Championship B', slug: 'champ-b' },
      ];

      const mockSelectInteraction = {
        user: { id: 'user1' },
        values: ['champ-a'],
        showModal: vi.fn(),
        awaitModalSubmit: vi.fn().mockRejectedValue(new Error('timeout')),
        editReply: vi.fn(),
      };

      const interaction = createMockInteraction({
        memberPermissions: {
          has: vi.fn((perm) => perm === PermissionFlagsBits.Administrator),
        },
        channel: {
          type: 0, // GuildText
          id: '987654321',
          awaitMessageComponent: vi.fn().mockResolvedValue(mockSelectInteraction),
          send: vi.fn(),
        },
        editReply: vi.fn(),
      });
      interaction.options.getSubcommand.mockReturnValue('setup');
      const client = createMockClient();

      const mockApiClient = { getChampionships: vi.fn().mockResolvedValue(championships) };
      mockFromGuild.mockResolvedValue(mockApiClient as never);

      await incidentCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Select the championship'),
          components: expect.any(Array),
        }),
      );
      expect(mockSelectInteraction.showModal).toHaveBeenCalled();
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
      mockGetSetting.mockResolvedValue(null);

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
    });
  });
});
