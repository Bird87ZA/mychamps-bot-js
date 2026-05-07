import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  Client,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { BotCommand } from '../types';
import { getSetting, setSetting } from '../utils/settings';
import { isValidTimezone } from '../utils/timezone';
import { rebuildReminders } from '../utils/reminders';
import { ephemeralReply } from '../utils/reply';
import { MyChampsApiClient, StatsLeague } from '../services/myChampsApiClient';
import { parseStatsLeagueIds, STATS_SETTING_KEY } from './stats';

export const settingsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Create and manage settings for your server')
    .addSubcommand((sub) =>
      sub
        .setName('timezone')
        .setDescription('Set the timezone')
        .addStringOption((opt) =>
          opt
            .setName('value')
            .setDescription('IANA identifier, e.g. Africa/Johannesburg')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('post-time')
        .setDescription('Set how many days before an event the attendance bot should post')
        .addIntegerOption((opt) =>
          opt.setName('days').setDescription('Days before the event').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remind-attendees')
        .setDescription('Set reminder frequency for attendees')
        .addIntegerOption((opt) =>
          opt
            .setName('hours')
            .setDescription('Reminder frequency in hours (0 to disable)')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('incident-category')
        .setDescription('Set the Discord category for incident channels')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Discord category channel').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('steward-role')
        .setDescription('Set the steward notification role')
        .addRoleOption((opt) =>
          opt
            .setName('role')
            .setDescription('Role to tag for steward notifications')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('incident-reminder-interval')
        .setDescription('Set hours between incident reminders')
        .addIntegerOption((opt) =>
          opt.setName('hours').setDescription('Hours between reminders').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mychamps-api-url')
        .setDescription('Set the base URL for the MyChamps API')
        .addStringOption((opt) =>
          opt.setName('value').setDescription('Base URL for MyChamps API').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mychamps-api-token')
        .setDescription('Set the API token for MyChamps')
        .addStringOption((opt) =>
          opt.setName('value').setDescription('API token for MyChamps').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('Choose the MyChamps leagues returned by /stats'),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    const guildId = interaction.guildId!;

    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'timezone') {
        const timezone = interaction.options.getString('value', true);
        if (!isValidTimezone(timezone)) {
          await ephemeralReply(interaction, `Invalid timezone: ${timezone}`);
          return;
        }
        await saveSettingAndReply(interaction, guildId, 'timezone', timezone);
        return;
      }

      if (subcommand === 'post-time') {
        await saveSettingAndReply(
          interaction,
          guildId,
          'post-time',
          interaction.options.getInteger('days', true).toString(),
        );
        return;
      }

      if (subcommand === 'remind-attendees') {
        const remindAttendees = interaction.options.getInteger('hours', true).toString();
        await setSetting(guildId, 'remind-attendees', remindAttendees);
        await rebuildReminders(guildId);
        await ephemeralReply(interaction, 'Settings updated successfully.');
        return;
      }

      if (subcommand === 'incident-category') {
        await saveSettingAndReply(
          interaction,
          guildId,
          'incident-category',
          interaction.options.getChannel('channel', true).id,
        );
        return;
      }

      if (subcommand === 'steward-role') {
        await saveSettingAndReply(
          interaction,
          guildId,
          'steward-role',
          interaction.options.getRole('role', true).id,
        );
        return;
      }

      if (subcommand === 'incident-reminder-interval') {
        await saveSettingAndReply(
          interaction,
          guildId,
          'incident-reminder-interval',
          interaction.options.getInteger('hours', true).toString(),
        );
        return;
      }

      if (subcommand === 'mychamps-api-url') {
        await saveSettingAndReply(
          interaction,
          guildId,
          'mychamps-api-url',
          interaction.options.getString('value', true),
        );
        return;
      }

      if (subcommand === 'mychamps-api-token') {
        await saveSettingAndReply(
          interaction,
          guildId,
          'mychamps-api-token',
          interaction.options.getString('value', true),
        );
        return;
      }

      if (subcommand === 'stats') {
        await handleStatsSettings(interaction);
        return;
      }

      await ephemeralReply(interaction, 'Unknown settings command.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      console.log('Settings update:', message);
      await ephemeralReply(interaction, message);
    }
  },
};

async function saveSettingAndReply(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  key: string,
  value: string,
): Promise<void> {
  await setSetting(guildId, key, value);
  await ephemeralReply(interaction, 'Settings updated successfully.');
}

async function handleStatsSettings(interaction: ChatInputCommandInteraction): Promise<void> {
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    await interaction.reply({
      content: 'You need Administrator or Manage Guild permissions to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId!;

  let apiClient: MyChampsApiClient;
  try {
    apiClient = await MyChampsApiClient.fromGuild(guildId);
  } catch {
    await interaction.reply({
      content:
        'MyChamps API is not configured for this server. Please set `mychamps-api-url` and `mychamps-api-token` in settings.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let leagues: StatsLeague[];
  try {
    leagues = await apiClient.getManagedStatsLeagues(interaction.user.id);
  } catch {
    await interaction.reply({
      content: 'Failed to fetch managed leagues from MyChamps API.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (leagues.length === 0) {
    await interaction.reply({
      content:
        'No managed leagues found for your linked MyChamps account. Make sure your Discord account is linked on MyChamps and you manage at least one league.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const savedLeagueIds = parseStatsLeagueIds(await getSetting(guildId, STATS_SETTING_KEY));
  const visibleLeagues = leagues.slice(0, 25);
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('settings_stats_select')
    .setPlaceholder('Select leagues for /stats...')
    .setMinValues(0)
    .setMaxValues(visibleLeagues.length)
    .addOptions(
      visibleLeagues.map((league) => ({
        label: truncateSelectText(league.name),
        value: league.id.toString(),
        description: league.slug ? truncateSelectText(league.slug) : undefined,
        default: savedLeagueIds.includes(league.id),
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  const suffix =
    leagues.length > visibleLeagues.length
      ? ` Discord can show 25 options at a time, so only the first 25 of ${leagues.length} leagues are listed.`
      : '';

  await interaction.reply({
    content: `Select the leagues that /stats should include.${suffix}`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });

  const channelForCollect = interaction.channel;
  if (!channelForCollect) return;

  let selectInteraction: StringSelectMenuInteraction;
  try {
    const collected = await channelForCollect.awaitMessageComponent({
      filter: (i) => i.customId === 'settings_stats_select' && i.user.id === interaction.user.id,
      time: 60_000,
    });
    selectInteraction = collected as StringSelectMenuInteraction;
  } catch {
    await interaction.editReply({ content: 'Stats settings timed out.', components: [] });
    return;
  }

  const selectedLeagueIds = selectInteraction.values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  await setSetting(guildId, STATS_SETTING_KEY, JSON.stringify(selectedLeagueIds));

  await selectInteraction.update({
    content:
      selectedLeagueIds.length === 0
        ? '/stats is now disabled for this server.'
        : `/stats will now include ${selectedLeagueIds.length} league${selectedLeagueIds.length === 1 ? '' : 's'}.`,
    components: [],
  });
}

function truncateSelectText(value: string): string {
  return value.length > 100 ? value.slice(0, 97) + '...' : value;
}
