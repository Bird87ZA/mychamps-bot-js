import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleDefenceMessage,
  handleDefenceDoneInteraction,
} from '../../src/events/defenceInteraction';
import { prisma } from '../../src/database';
import { createMockClient } from '../mocks/discord';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../src/utils/settings', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  hasTimezone: vi.fn(),
  guildsWithRemindersEnabled: vi.fn(),
}));

import { getSetting } from '../../src/utils/settings';
const mockGetSetting = vi.mocked(getSetting);

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockMessage(overrides: Record<string, unknown> = {}) {
  return {
    author: { bot: false, id: 'user1', username: 'testuser' },
    guildId: '123456789',
    channelId: '987654321',
    reply: vi.fn(),
    ...overrides,
  };
}

describe('handleDefenceMessage', () => {
  it('ignores bot messages', async () => {
    const message = createMockMessage({ author: { bot: true, id: 'bot-id', username: 'bot' } });
    const client = createMockClient();

    await handleDefenceMessage(message as never, client as never);

    expect(mockPrisma.incident.findFirst).not.toHaveBeenCalled();
  });

  it('ignores messages with no guildId', async () => {
    const message = createMockMessage({ guildId: null });
    const client = createMockClient();

    await handleDefenceMessage(message as never, client as never);

    expect(mockPrisma.incident.findFirst).not.toHaveBeenCalled();
  });

  it('ignores messages when no open incident exists in channel', async () => {
    const message = createMockMessage();
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue(null);

    await handleDefenceMessage(message as never, client as never);

    expect(message.reply).not.toHaveBeenCalled();
  });

  it('ignores messages from non-defendants', async () => {
    const message = createMockMessage({
      author: { bot: false, id: 'non-defendant', username: 'someone' },
    });
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['defendant1', 'defendant2'],
      status: 'open',
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await handleDefenceMessage(message as never, client as never);

    expect(message.reply).not.toHaveBeenCalled();
  });

  it('ignores messages from defendants who already submitted', async () => {
    const message = createMockMessage({
      author: { bot: false, id: 'user1', username: 'testuser' },
    });
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['user1'],
      status: 'open',
      defenceSubmitted: ['user1'],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await handleDefenceMessage(message as never, client as never);

    expect(message.reply).not.toHaveBeenCalled();
  });

  it('prompts defendant with done/continue buttons', async () => {
    const message = createMockMessage();
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['user1'],
      status: 'open',
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await handleDefenceMessage(message as never, client as never);

    expect(message.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('finished submitting your defence'),
        components: expect.any(Array),
      }),
    );
  });
});

describe('handleDefenceDoneInteraction', () => {
  function createMockButtonInteraction(overrides: Record<string, unknown> = {}) {
    return {
      customId: 'defence_done_yes!1',
      user: { id: 'user1', username: 'testuser' },
      guildId: '123456789',
      channelId: '987654321',
      guild: { name: 'Test Guild' },
      channel: null,
      reply: vi.fn(),
      showModal: vi.fn(),
      awaitModalSubmit: vi.fn().mockRejectedValue(new Error('timeout')),
      ...overrides,
    };
  }

  function createMockDefenceModalSubmit(overrides: Record<string, unknown> = {}) {
    return {
      fields: {
        getTextInputValue: vi.fn((field: string) => {
          if (field === 'defence_answer') return 'I held my line through turn 1.';
          if (field === 'defence_url') return 'https://example.com/defence';
          if (field === 'defence_additional_url_1') return 'https://example.com/view-1';
          if (field === 'defence_additional_url_2') return '';
          return '';
        }),
        getUploadedFiles: vi.fn(
          () =>
            new Map([
              ['file-1', { name: 'defence.png', url: 'https://cdn.discordapp.com/defence.png' }],
            ]),
        ),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
      user: { id: 'user1' },
      ...overrides,
    };
  }

  it('ignores non-defence buttons', async () => {
    const interaction = createMockButtonInteraction({ customId: 'other_button' });
    const client = createMockClient();

    await handleDefenceDoneInteraction(interaction as never, client as never);

    expect(mockPrisma.incident.findFirst).not.toHaveBeenCalled();
  });

  it('replies with continue message when No is clicked', async () => {
    const interaction = createMockButtonInteraction({ customId: 'defence_done_no!1' });
    const client = createMockClient();

    await handleDefenceDoneInteraction(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('continue posting'),
      }),
    );
    expect(mockPrisma.incident.findFirst).not.toHaveBeenCalled();
  });

  it('replies with error when incident not found', async () => {
    const interaction = createMockButtonInteraction({ customId: 'defence_done_yes!99' });
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue(null);

    await handleDefenceDoneInteraction(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Could not find'),
      }),
    );
  });

  it('marks defence submitted and updates status to awaiting_review when all done', async () => {
    const mockModalSubmit = createMockDefenceModalSubmit();
    const mockChannel = {
      type: 0,
      id: '987654321',
      send: vi.fn(),
      permissionOverwrites: { edit: vi.fn() },
    };

    const interaction = createMockButtonInteraction({
      customId: 'defence_done_yes!1',
      channel: mockChannel,
      awaitModalSubmit: vi.fn().mockResolvedValue(mockModalSubmit),
    });
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['user1'],
      stewardRoleIds: ['steward-role-a'],
      status: 'open',
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.incident.update.mockResolvedValue({} as never);
    mockGetSetting.mockResolvedValue(null);

    await handleDefenceDoneInteraction(interaction as never, client as never);

    expect(interaction.showModal).toHaveBeenCalled();
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: 'Answer',
                  value: 'I held my line through turn 1.',
                }),
                expect.objectContaining({
                  name: 'File',
                  value: expect.stringContaining('defence.png'),
                }),
              ]),
            }),
          }),
        ]),
      }),
    );
    expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith('user1', {
      ViewChannel: false,
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      AddReactions: false,
    });
    expect(mockPrisma.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          defenceSubmitted: ['user1'],
          status: 'awaiting_review',
        }),
      }),
    );
    expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining('<@&steward-role-a>'));
    expect(mockModalSubmit.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('defence has been submitted') }),
    );
  });

  it('sets status to open (not awaiting_review) when not all defendants done', async () => {
    const mockModalSubmit = createMockDefenceModalSubmit();
    const mockChannel = {
      type: 0,
      id: '987654321',
      send: vi.fn(),
      permissionOverwrites: { edit: vi.fn() },
    };

    const interaction = createMockButtonInteraction({
      customId: 'defence_done_yes!1',
      channel: mockChannel,
      awaitModalSubmit: vi.fn().mockResolvedValue(mockModalSubmit),
    });
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['user1', 'user2'],
      stewardRoleIds: ['steward-role-a'],
      status: 'open',
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.incident.update.mockResolvedValue({} as never);
    mockGetSetting.mockResolvedValue(null);

    await handleDefenceDoneInteraction(interaction as never, client as never);

    expect(mockPrisma.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'open',
        }),
      }),
    );
  });

  it('falls back to ticket access role mentions when no steward roles are saved', async () => {
    const mockModalSubmit = createMockDefenceModalSubmit();
    const mockSend = vi.fn();
    const mockChannel = {
      type: 0,
      id: '987654321',
      send: mockSend,
      permissionOverwrites: { edit: vi.fn() },
    };

    const interaction = createMockButtonInteraction({
      customId: 'defence_done_yes!1',
      channel: mockChannel,
      awaitModalSubmit: vi.fn().mockResolvedValue(mockModalSubmit),
    });
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['user1'],
      stewardRoleIds: [],
      status: 'open',
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

    await handleDefenceDoneInteraction(interaction as never, client as never);

    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('<@&ticket-role-a>'));
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('<@&ticket-role-b>'));
  });

  it('notifies stewards when the bot cannot remove a defendant from the channel', async () => {
    const mockModalSubmit = createMockDefenceModalSubmit();
    const mockSend = vi.fn();
    const mockChannel = {
      type: 0,
      id: '987654321',
      send: mockSend,
      permissionOverwrites: { edit: vi.fn().mockRejectedValue({ code: 50013 }) },
    };

    const interaction = createMockButtonInteraction({
      customId: 'defence_done_yes!1',
      channel: mockChannel,
      awaitModalSubmit: vi.fn().mockResolvedValue(mockModalSubmit),
    });
    const client = createMockClient();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    mockPrisma.incident.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['user1'],
      stewardRoleIds: ['steward-role-a'],
      status: 'open',
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.incident.update.mockResolvedValue({} as never);

    await handleDefenceDoneInteraction(interaction as never, client as never);

    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('Manage Roles'));
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('could not remove the driver'));
    expect(mockModalSubmit.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('could not remove you') }),
    );

    consoleSpy.mockRestore();
  });

  it('replies with error when defence already submitted by this user', async () => {
    const interaction = createMockButtonInteraction({ customId: 'defence_done_yes!1' });
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['user1'],
      status: 'open',
      defenceSubmitted: ['user1'],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await handleDefenceDoneInteraction(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('already submitted'),
      }),
    );
    expect(mockPrisma.incident.update).not.toHaveBeenCalled();
  });
});
