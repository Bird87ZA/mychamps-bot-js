import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleIncidentButtonInteraction,
  handleIncidentDefenceButtonInteraction,
} from '../../src/events/incidentButtonInteraction';
import { prisma } from '../../src/database';
import { createMockInteraction, createMockClient } from '../mocks/discord';

const mockPrisma = vi.mocked(prisma);

vi.mock('../../src/services/myChampsApiClient', () => ({
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

describe('handleIncidentButtonInteraction', () => {
  it('ignores interactions that are not incident report buttons', async () => {
    const interaction = createMockInteraction({ customId: 'attendance_button' });
    const client = createMockClient();

    await handleIncidentButtonInteraction(interaction as never, client as never);

    expect(mockPrisma.incidentButton.findUnique).not.toHaveBeenCalled();
  });

  it('replies with error when incident button record not found', async () => {
    const interaction = createMockInteraction({
      customId: 'incident_report!champ-a',
      message: { id: 'msg-123' },
    });
    const client = createMockClient();

    mockPrisma.incidentButton.findUnique.mockResolvedValue(null);

    await handleIncidentButtonInteraction(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Could not find'),
      }),
    );
  });

  it('shows incident report modal when button record is found', async () => {
    const mockShowModal = vi.fn();
    const mockAwaitModal = vi.fn().mockRejectedValue(new Error('timeout'));

    const interaction = createMockInteraction({
      customId: 'incident_report!champ-a',
      message: { id: 'msg-123' },
      showModal: mockShowModal,
      awaitModalSubmit: mockAwaitModal,
    });
    const client = createMockClient();

    mockPrisma.incidentButton.findUnique.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      messageId: 'msg-123',
      championshipSlug: 'champ-a',
      buttonLabel: 'Report Incident',
      buttonColor: 'Danger',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await handleIncidentButtonInteraction(interaction as never, client as never);

    expect(mockShowModal).toHaveBeenCalled();

    const modalJson = mockShowModal.mock.calls[0][0].toJSON();
    const descriptionComponent = modalJson.components.find(
      (component: { label?: string }) => component.label === 'Description',
    )?.component;
    const evidenceUrlComponent = modalJson.components.find(
      (component: { label?: string }) => component.label === 'Evidence URL',
    )?.component;

    expect(descriptionComponent).not.toHaveProperty('label');
    expect(evidenceUrlComponent).not.toHaveProperty('label');
    expect(modalJson.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Driver(s) Involved',
          component: expect.objectContaining({
            custom_id: 'driver_users',
            type: 5,
            min_values: 0,
            required: false,
          }),
        }),
        expect.objectContaining({
          label: 'Evidence Files',
          component: expect.objectContaining({ custom_id: 'evidence_files', type: 19 }),
        }),
      ]),
    );
  });

  it('creates incident channel and saves record on modal submit', async () => {
    const mockSend = vi.fn().mockResolvedValue({ id: 'new-channel-msg' });
    const mockCreateChannel = vi.fn().mockResolvedValue({
      id: 'new-channel-id',
      send: mockSend,
    });

    const mockModalSubmit = {
      fields: {
        getTextInputValue: vi.fn((field: string) => {
          if (field === 'description') return 'Collision at turn 1';
          if (field === 'evidence_url') return 'https://example.com/video';
          return '';
        }),
        getSelectedUsers: vi.fn(
          () =>
            new Map([
              ['driver-user-a', { id: 'driver-user-a', username: 'Driver A' }],
              ['driver-user-b', { id: 'driver-user-b', username: 'Driver B' }],
            ]),
        ),
        getUploadedFiles: vi.fn(
          () =>
            new Map([['file-1', { name: 'clip.mp4', url: 'https://cdn.discordapp.com/clip.mp4' }]]),
        ),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
      user: { id: 'user1' },
    };

    const mockShowModal = vi.fn();
    const mockAwaitModal = vi.fn().mockResolvedValue(mockModalSubmit);

    const interaction = createMockInteraction({
      customId: 'incident_report!champ-a',
      message: { id: 'msg-123' },
      showModal: mockShowModal,
      awaitModalSubmit: mockAwaitModal,
      guild: {
        name: 'Test Guild',
        iconURL: () => 'https://icon.url',
        roles: {
          everyone: { id: 'everyone-role-id' },
        },
        channels: {
          create: mockCreateChannel,
        },
      },
    });
    const client = createMockClient();

    mockPrisma.incidentButton.findUnique.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      messageId: 'msg-123',
      championshipSlug: 'champ-a',
      buttonLabel: 'Report Incident',
      buttonColor: 'Danger',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.incident.create.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: 'new-channel-id',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['Driver A', 'Driver B'],
      status: 'open',
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockApiClient = { createIncident: vi.fn().mockResolvedValue({ id: 42 }) };
    mockFromGuild.mockResolvedValue(mockApiClient as never);
    mockGetSetting.mockImplementation(async (_guildId, key) => {
      if (key === 'incidents-category') return 'incidents-category-id';
      if (key === 'ticket-access-roles') return '["ticket-role-a","ticket-role-b"]';
      return null;
    });

    await handleIncidentButtonInteraction(interaction as never, client as never);

    expect(mockCreateChannel).toHaveBeenCalled();
    expect(mockPrisma.incident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guildId: '123456789',
          championshipSlug: 'champ-a',
          defendants: expect.arrayContaining(['driver-user-a', 'driver-user-b']),
          status: 'open',
        }),
      }),
    );
    expect(mockCreateChannel.mock.calls[0][0].permissionOverwrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ticket-role-a' }),
        expect.objectContaining({ id: 'ticket-role-b' }),
        expect.objectContaining({ id: 'driver-user-a' }),
        expect.objectContaining({ id: 'driver-user-b' }),
      ]),
    );
    expect(mockCreateChannel.mock.calls[0][0].parent).toBe('incidents-category-id');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: 'Driver(s) Involved',
                  value: '<@driver-user-a>, <@driver-user-b>',
                }),
                expect.objectContaining({
                  name: 'Evidence',
                  value: expect.stringContaining('clip.mp4'),
                }),
              ]),
            }),
          }),
        ]),
      }),
    );
    expect(mockSend).toHaveBeenCalledWith(
      '<@driver-user-a> <@driver-user-b> Please post a defence',
    );
    expect(mockModalSubmit.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Incident reported') }),
    );
  });

  it('does not add driver access or prompt for defence when no users are selected', async () => {
    const mockSend = vi.fn().mockResolvedValue({ id: 'new-channel-msg' });
    const mockCreateChannel = vi.fn().mockResolvedValue({
      id: 'new-channel-id',
      send: mockSend,
    });

    const mockModalSubmit = {
      fields: {
        getTextInputValue: vi.fn((field: string) => {
          if (field === 'description') return 'Unsafe rejoin';
          return '';
        }),
        getSelectedUsers: vi.fn(() => null),
        getUploadedFiles: vi.fn(() => null),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
      user: { id: 'user1' },
    };

    const interaction = createMockInteraction({
      customId: 'incident_report!champ-a',
      message: { id: 'msg-123' },
      showModal: vi.fn(),
      awaitModalSubmit: vi.fn().mockResolvedValue(mockModalSubmit),
      guild: {
        name: 'Test Guild',
        iconURL: () => 'https://icon.url',
        roles: {
          everyone: { id: 'everyone-role-id' },
        },
        channels: {
          create: mockCreateChannel,
        },
      },
    });
    const client = createMockClient();

    mockPrisma.incidentButton.findUnique.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: '987654321',
      messageId: 'msg-123',
      championshipSlug: 'champ-a',
      buttonLabel: 'Report Incident',
      buttonColor: 'Danger',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.incident.create.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: 'new-channel-id',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: [],
      status: 'open',
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockApiClient = { createIncident: vi.fn().mockResolvedValue({ id: 42 }) };
    mockFromGuild.mockResolvedValue(mockApiClient as never);
    mockGetSetting.mockResolvedValue(null);

    await handleIncidentButtonInteraction(interaction as never, client as never);

    expect(mockPrisma.incident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          defendants: [],
        }),
      }),
    );
    expect(mockCreateChannel.mock.calls[0][0].permissionOverwrites).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'driver-user-a' }),
        expect.objectContaining({ id: 'driver-user-b' }),
      ]),
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalledWith(expect.stringContaining('Please post a defence'));
  });
});

describe('handleIncidentDefenceButtonInteraction', () => {
  it('ignores non-defence buttons', async () => {
    const interaction = createMockInteraction({ customId: 'other_button' });
    const client = createMockClient();

    await handleIncidentDefenceButtonInteraction(interaction as never, client as never);

    expect(mockPrisma.incident.findFirst).not.toHaveBeenCalled();
  });

  it('dismisses when user clicks No', async () => {
    const interaction = createMockInteraction({ customId: 'defence_done_no!1' });
    const client = createMockClient();

    await handleIncidentDefenceButtonInteraction(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('continue'),
      }),
    );
    expect(mockPrisma.incident.findFirst).not.toHaveBeenCalled();
  });

  it('marks defence as submitted when user clicks Yes', async () => {
    const mockChannel = {
      type: 0,
      id: '987654321',
      send: vi.fn(),
      permissionOverwrites: {
        edit: vi.fn(),
      },
    };

    const interaction = createMockInteraction({
      customId: 'defence_done_yes!1',
      channelId: '987654321',
      channel: mockChannel,
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
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.incident.update.mockResolvedValue({} as never);
    mockGetSetting.mockResolvedValue(null);

    await handleIncidentDefenceButtonInteraction(interaction as never, client as never);

    expect(mockPrisma.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          defenceSubmitted: ['user1'],
          status: 'awaiting_review',
        }),
      }),
    );
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('defence has been submitted'),
      }),
    );
  });

  it('tags ticket access roles when all defendants submit defence', async () => {
    const mockSend = vi.fn();
    const mockChannel = {
      type: 0,
      id: '987654321',
      send: mockSend,
      permissionOverwrites: { edit: vi.fn() },
    };

    const interaction = createMockInteraction({
      customId: 'defence_done_yes!1',
      channelId: '987654321',
      channel: mockChannel,
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

    await handleIncidentDefenceButtonInteraction(interaction as never, client as never);

    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('<@&ticket-role-a>'));
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('<@&ticket-role-b>'));
  });

  it('replies with error when incident not found', async () => {
    const interaction = createMockInteraction({
      customId: 'defence_done_yes!99',
      channelId: '987654321',
    });
    const client = createMockClient();

    mockPrisma.incident.findFirst.mockResolvedValue(null);

    await handleIncidentDefenceButtonInteraction(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Could not find'),
      }),
    );
  });
});
