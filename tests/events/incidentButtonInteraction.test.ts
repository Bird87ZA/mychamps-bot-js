import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleIncidentButtonInteraction } from '../../src/events/incidentButtonInteraction';
import { prisma } from '../../src/database';
import { createMockInteraction, createMockClient } from '../mocks/discord';
import { PermissionFlagsBits } from 'discord.js';

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
        content: expect.stringContaining('no longer configured'),
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
      incidentCategoryId: null,
      stewardRoleIds: [],
      channelRoleIds: [],
      addReporterToChannel: false,
      buttonMessage:
        'Click the button below to report an incident. You will be asked to provide details.',
      buttonLabel: 'Report Incident',
      buttonColor: 'Red',
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
          cache: new Map([
            ['old-incident-channel', { id: 'old-incident-channel', name: 'incident-0003' }],
          ]),
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
      incidentCategoryId: 'setup-category-id',
      stewardRoleIds: ['setup-role-a', 'setup-role-b'],
      channelRoleIds: ['channel-role-a'],
      addReporterToChannel: false,
      buttonMessage:
        'Click the button below to report an incident. You will be asked to provide details.',
      buttonLabel: 'Report Incident',
      buttonColor: 'Red',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.incident.findMany.mockResolvedValue([]);

    mockPrisma.incident.create.mockResolvedValue({
      id: 1,
      incidentNumber: 4,
      guildId: '123456789',
      channelId: 'new-channel-id',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['Driver A', 'Driver B'],
      stewardRoleIds: ['setup-role-a', 'setup-role-b'],
      status: 'open',
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockApiClient = { createIncident: vi.fn().mockResolvedValue({ id: 42 }) };
    mockFromGuild.mockResolvedValue(mockApiClient as never);

    await handleIncidentButtonInteraction(interaction as never, client as never);

    expect(mockCreateChannel).toHaveBeenCalled();
    expect(mockPrisma.incident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guildId: '123456789',
          incidentNumber: 4,
          championshipSlug: 'champ-a',
          defendants: expect.arrayContaining(['driver-user-a', 'driver-user-b']),
          stewardRoleIds: ['setup-role-a', 'setup-role-b'],
          status: 'open',
        }),
      }),
    );
    expect(mockCreateChannel.mock.calls[0][0].permissionOverwrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'setup-role-a' }),
        expect.objectContaining({ id: 'setup-role-b' }),
        expect.objectContaining({ id: 'channel-role-a' }),
        expect.objectContaining({ id: 'driver-user-a' }),
        expect.objectContaining({ id: 'driver-user-b' }),
      ]),
    );
    const permissionOverwrites = mockCreateChannel.mock.calls[0][0].permissionOverwrites;
    const driverOverwrite = permissionOverwrites.find(
      (overwrite: { id: string }) => overwrite.id === 'driver-user-a',
    );
    expect(driverOverwrite.allow).toEqual(
      expect.arrayContaining([PermissionFlagsBits.ViewChannel]),
    );
    expect(driverOverwrite.allow).not.toEqual(
      expect.arrayContaining([PermissionFlagsBits.SendMessages]),
    );
    expect(driverOverwrite.deny).toEqual(
      expect.arrayContaining([PermissionFlagsBits.SendMessages]),
    );
    expect(permissionOverwrites).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'user1',
          allow: expect.arrayContaining([PermissionFlagsBits.ViewChannel]),
        }),
      ]),
    );
    expect(mockCreateChannel.mock.calls[0][0].name).toBe('incident-0004');
    expect(mockCreateChannel.mock.calls[0][0].parent).toBe('setup-category-id');
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
              color: 0x95a5a6,
            }),
          }),
        ]),
      }),
    );
    const embedPayload = mockSend.mock.calls[0][0].embeds[0].data;
    expect(embedPayload.fields.map((field: { name: string }) => field.name)).not.toContain(
      'Championship',
    );
    expect(mockSend).not.toHaveBeenCalledWith(expect.stringContaining('<@&setup-role-a>'));
    expect(mockSend).toHaveBeenCalledWith(
      '<@driver-user-a> <@driver-user-b> Please submit a defence',
    );
    const defenceButton = mockSend.mock.calls[0][0].components[0].components[0].data;
    expect(defenceButton.custom_id).toBe('defence_done_yes!1');
    expect(mockModalSubmit.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Incident reported') }),
    );
  });

  it('adds reporter view-only access when setup option is enabled', async () => {
    const mockSend = vi.fn().mockResolvedValue({ id: 'new-channel-msg' });
    const mockCreateChannel = vi.fn().mockResolvedValue({
      id: 'new-channel-id',
      send: mockSend,
    });

    const mockModalSubmit = {
      fields: {
        getTextInputValue: vi.fn((field: string) => {
          if (field === 'description') return 'Collision at turn 1';
          return '';
        }),
        getSelectedUsers: vi.fn(
          () => new Map([['driver-user-a', { id: 'driver-user-a', username: 'Driver A' }]]),
        ),
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
      incidentCategoryId: null,
      stewardRoleIds: ['setup-role-a'],
      channelRoleIds: [],
      addReporterToChannel: true,
      buttonMessage:
        'Click the button below to report an incident. You will be asked to provide details.',
      buttonLabel: 'Report Incident',
      buttonColor: 'Red',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.incident.create.mockResolvedValue({
      id: 1,
      guildId: '123456789',
      channelId: 'new-channel-id',
      mychampsIncidentId: null,
      championshipSlug: 'champ-a',
      defendants: ['driver-user-a'],
      stewardRoleIds: ['setup-role-a'],
      status: 'open',
      defenceSubmitted: [],
      lastReminderAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockApiClient = { createIncident: vi.fn().mockResolvedValue({ id: 42 }) };
    mockFromGuild.mockResolvedValue(mockApiClient as never);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    await handleIncidentButtonInteraction(interaction as never, client as never);

    const permissionOverwrites = mockCreateChannel.mock.calls[0][0].permissionOverwrites;
    const reporterOverwrite = permissionOverwrites.find(
      (overwrite: { id: string }) => overwrite.id === 'user1',
    );

    expect(reporterOverwrite.allow).toEqual(
      expect.arrayContaining([PermissionFlagsBits.ViewChannel]),
    );
    expect(reporterOverwrite.allow).not.toEqual(
      expect.arrayContaining([PermissionFlagsBits.SendMessages]),
    );
    expect(reporterOverwrite.deny).toEqual(
      expect.arrayContaining([PermissionFlagsBits.SendMessages]),
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
      incidentCategoryId: null,
      stewardRoleIds: [],
      channelRoleIds: [],
      addReporterToChannel: false,
      buttonMessage:
        'Click the button below to report an incident. You will be asked to provide details.',
      buttonLabel: 'Report Incident',
      buttonColor: 'Red',
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
      stewardRoleIds: [],
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
    expect(mockSend).not.toHaveBeenCalledWith(expect.stringContaining('Please submit a defence'));
  });
});
