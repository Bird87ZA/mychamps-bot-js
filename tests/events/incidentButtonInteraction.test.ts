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
          if (field === 'driver_names') return 'Driver A, Driver B';
          if (field === 'description') return 'Collision at turn 1';
          if (field === 'evidence_url') return 'https://example.com/video';
          return '';
        }),
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
    mockGetSetting.mockResolvedValue(null);

    await handleIncidentButtonInteraction(interaction as never, client as never);

    expect(mockCreateChannel).toHaveBeenCalled();
    expect(mockPrisma.incident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guildId: '123456789',
          championshipSlug: 'champ-a',
          defendants: expect.arrayContaining(['Driver A', 'Driver B']),
          status: 'open',
        }),
      }),
    );
    expect(mockModalSubmit.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Incident reported') }),
    );
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

  it('tags steward role when all defendants submit defence', async () => {
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
    mockGetSetting.mockResolvedValue('steward-role-id');

    await handleIncidentDefenceButtonInteraction(interaction as never, client as never);

    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('<@&steward-role-id>'));
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
