import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageFlags } from 'discord.js';
import { statsCommand, parseStatsLeagueIds } from '../../src/commands/stats';
import { createMockInteraction, createMockClient } from '../mocks/discord';

vi.mock('../../src/utils/settings', () => ({
  getSetting: vi.fn(),
}));

vi.mock('../../src/services/myChampsApiClient', () => ({
  MyChampsApiClient: {
    fromGuild: vi.fn(),
  },
}));

import { getSetting } from '../../src/utils/settings';
import { MyChampsApiClient } from '../../src/services/myChampsApiClient';

const mockGetSetting = vi.mocked(getSetting);
const mockFromGuild = vi.mocked(MyChampsApiClient.fromGuild);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('statsCommand', () => {
  it('has correct command name', () => {
    expect(statsCommand.data.name).toBe('stats');
  });

  it('parses configured league ids defensively', () => {
    expect(parseStatsLeagueIds('[1,"2",0,-1,"abc",3]')).toEqual([1, 2, 3]);
    expect(parseStatsLeagueIds('not-json')).toEqual([]);
    expect(parseStatsLeagueIds(null)).toEqual([]);
  });

  it('rejects when stats are not configured for the guild', async () => {
    const interaction = createMockInteraction();
    const client = createMockClient();
    mockGetSetting.mockResolvedValue(null);

    await statsCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Stats are not configured'),
      }),
    );
  });

  it('fetches linked stats and renders a stats embed', async () => {
    const interaction = createMockInteraction();
    const client = createMockClient();
    const mockApiClient = {
      getLinkedStats: vi.fn().mockResolvedValue({
        leagues: [
          {
            id: 1,
            name: 'League A',
            stats: {
              entries: 4,
              wins: 1,
              podiums: 2,
              poles: 1,
              dnfs: 0,
              fastest_laps: 1,
            },
          },
        ],
        combined: {
          entries: 4,
          wins: 1,
          podiums: 2,
          poles: 1,
          dnfs: 0,
          fastest_laps: 1,
        },
      }),
    };
    mockGetSetting.mockResolvedValue('[1,2]');
    mockFromGuild.mockResolvedValue(mockApiClient as never);

    await statsCommand.execute(interaction as never, client as never);

    expect(mockApiClient.getLinkedStats).toHaveBeenCalledWith('user1', [1, 2]);
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: "Test User's MyChamps Stats",
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: 'League A',
                  value: expect.stringContaining('Wins: **1**'),
                }),
                expect.objectContaining({
                  name: 'Combined',
                  value: expect.stringContaining('Entries: **4**'),
                }),
              ]),
            }),
          }),
        ]),
      }),
    );
  });

  it('replies when MyChamps returns no stats for the linked profile', async () => {
    const interaction = createMockInteraction();
    const client = createMockClient();
    const mockApiClient = {
      getLinkedStats: vi.fn().mockResolvedValue({
        leagues: [],
        combined: {
          entries: 0,
          wins: 0,
          podiums: 0,
          poles: 0,
          dnfs: 0,
          fastest_laps: 0,
        },
      }),
    };
    mockGetSetting.mockResolvedValue('[1]');
    mockFromGuild.mockResolvedValue(mockApiClient as never);

    await statsCommand.execute(interaction as never, client as never);

    expect(interaction.deleteReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          'Your account is not yet linked with MyChamps. Head over to https://mychamps.gg/user/profile and link your Social Accounts',
        ),
        flags: MessageFlags.Ephemeral,
      }),
    );
  });
});
