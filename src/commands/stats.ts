import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { BotCommand } from '../types';
import { DriverStats, LinkedStatsResponse, MyChampsApiClient } from '../services/myChampsApiClient';
import { getSetting } from '../utils/settings';

const STATS_SETTING_KEY = 'stats-league-ids';

export const statsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show your MyChamps stats for this server'),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'Stats are only available in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const teamIds = parseStatsLeagueIds(await getSetting(guildId, STATS_SETTING_KEY));
    if (teamIds.length === 0) {
      await interaction.reply({
        content: 'Stats are not configured for this server. Ask an admin to run `/settings stats`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let apiClient: MyChampsApiClient;
    try {
      apiClient = await MyChampsApiClient.fromGuild(guildId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'MyChamps API is not configured for this server. Please set `mychamps-api-token` in settings.';

      await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let stats: LinkedStatsResponse;
    try {
      await interaction.deferReply();
      stats = await apiClient.getLinkedStats(interaction.user.id, teamIds);
    } catch (error) {
      console.error('[StatsCommand] Failed to fetch stats:', error);
      await interaction.editReply({
        content: 'Failed to fetch stats from MyChamps API.',
      });
      return;
    }

    if (stats.leagues.length === 0 && stats.combined.entries === 0) {
      await interaction.deleteReply();
      await interaction.followUp({
        content:
          'Your account is not yet linked with MyChamps. Head over to https://mychamps.gg/user/profile and link your Social Accounts',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.editReply({ embeds: [buildStatsEmbed(interaction, stats)] });
  },
};

export function parseStatsLeagueIds(value: string | null): number[] {
  if (!value) {
    return [];
  }

  try {
    const decoded = JSON.parse(value);
    if (!Array.isArray(decoded)) {
      return [];
    }

    return decoded
      .map((teamId) => Number(teamId))
      .filter((teamId) => Number.isInteger(teamId) && teamId > 0);
  } catch {
    return [];
  }
}

function buildStatsEmbed(
  interaction: ChatInputCommandInteraction,
  stats: LinkedStatsResponse,
): EmbedBuilder {
  const displayName = interaction.user.globalName ?? interaction.user.username;

  const embed = new EmbedBuilder()
    .setTitle(`${displayName}'s MyChamps Stats`)
    .setColor(0x5865f2)
    .setTimestamp(new Date());

  for (const league of stats.leagues.slice(0, 24)) {
    embed.addFields({
      name: league.name,
      value: formatStats(league.stats),
      inline: false,
    });
  }

  embed.addFields({
    name: 'Combined',
    value: formatStats(stats.combined),
    inline: false,
  });

  return embed;
}

function formatStats(stats: DriverStats): string {
  return [
    `Entries: **${stats.entries}**`,
    `Wins: **${stats.wins}**`,
    `Podiums: **${stats.podiums}**`,
    `Poles: **${stats.poles}**`,
    `DNFs: **${stats.dnfs}**`,
    `FLs: **${stats.fastest_laps}**`,
  ].join(' | ');
}

export { STATS_SETTING_KEY };
