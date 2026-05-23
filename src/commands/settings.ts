import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { BotCommand } from '../types';
import { getSetting, setSetting } from '../utils/settings';
import { isValidTimezone } from '../utils/timezone';
import { rebuildReminders } from '../utils/reminders';
import { ephemeralReply } from '../utils/reply';
import { MyChampsApiClient, StatsLeague } from '../services/myChampsApiClient';
import { parseStatsLeagueIds, STATS_SETTING_KEY } from './stats';
import {
  getIncidentsCategoryId,
  getTicketAccessRoleIds,
  INCIDENTS_CATEGORY_SETTING_KEY,
  TICKET_ACCESS_ROLES_SETTING_KEY,
} from '../utils/incidentSettings';

const SETTINGS_MODAL_CUSTOM_ID = 'settings_modal';

const SETTINGS_FIELD_IDS = {
  timezone: 'settings_timezone',
  postTime: 'settings_post_time',
  remindAttendees: 'settings_remind_attendees',
  incidentReminderInterval: 'settings_incident_reminder_interval',
  myChampsApiToken: 'settings_mychamps_api_token',
  incidentsCategory: 'settings_incidents_category',
  ticketAccessRoles: 'settings_ticket_access_roles',
} as const;

interface BotSettingsValues {
  timezone: string | null;
  postTime: string | null;
  remindAttendees: string | null;
  incidentReminderInterval: string | null;
  myChampsApiToken: string | null;
  incidentsCategory: string | null;
  ticketAccessRoleIds: string[];
}

export const settingsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Create and manage settings for your server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('section')
        .setDescription('Open a specific settings section')
        .setRequired(false)
        .addChoices({ name: '/stats leagues', value: 'stats' }),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    const guildId = interaction.guildId!;

    try {
      const section = interaction.options.getString('section');

      if (section === 'stats') {
        await handleStatsSettings(interaction);
        return;
      }

      await handleSettingsModal(interaction, guildId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      console.log('Settings update:', message);
      await ephemeralReply(interaction, message);
    }
  },
};

async function handleSettingsModal(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  if (!canManageSettings(interaction)) {
    await interaction.reply({
      content: 'You need Administrator or Manage Guild permissions to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const values = await getBotSettingsValues(guildId);
  const modal = buildSettingsModal(values);

  await interaction.showModal(modal);

  let modalSubmit: ModalSubmitInteraction;
  try {
    modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.customId === SETTINGS_MODAL_CUSTOM_ID && i.user.id === interaction.user.id,
      time: 300_000,
    });
  } catch {
    return;
  }

  await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await saveSettingsFromModal(guildId, modalSubmit);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Settings could not be saved.';
    await modalSubmit.editReply({ content: message });
    return;
  }

  await modalSubmit.editReply({ content: 'Settings updated successfully.' });
}

function canManageSettings(interaction: ChatInputCommandInteraction): boolean {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
  );
}

async function getBotSettingsValues(guildId: string): Promise<BotSettingsValues> {
  const [
    timezone,
    postTime,
    remindAttendees,
    incidentReminderInterval,
    myChampsApiToken,
    incidentsCategory,
    ticketAccessRoleIds,
  ] = await Promise.all([
    getSetting(guildId, 'timezone'),
    getSetting(guildId, 'post-time'),
    getSetting(guildId, 'remind-attendees'),
    getSetting(guildId, 'incident-reminder-interval'),
    getSetting(guildId, 'mychamps-api-token'),
    getIncidentsCategoryId(guildId),
    getTicketAccessRoleIds(guildId),
  ]);

  return {
    timezone,
    postTime,
    remindAttendees,
    incidentReminderInterval,
    myChampsApiToken,
    incidentsCategory,
    ticketAccessRoleIds,
  };
}

function buildSettingsModal(values: BotSettingsValues): ModalBuilder {
  const categorySelect = new ChannelSelectMenuBuilder()
    .setCustomId(SETTINGS_FIELD_IDS.incidentsCategory)
    .setPlaceholder('Select an incident category')
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(0)
    .setMaxValues(1)
    .setRequired(false);

  if (values.incidentsCategory) {
    categorySelect.setDefaultChannels(values.incidentsCategory);
  }

  const ticketAccessRoleSelect = new RoleSelectMenuBuilder()
    .setCustomId(SETTINGS_FIELD_IDS.ticketAccessRoles)
    .setPlaceholder('Select ticket access roles')
    .setMinValues(0)
    .setMaxValues(25)
    .setRequired(false);

  if (values.ticketAccessRoleIds.length > 0) {
    ticketAccessRoleSelect.setDefaultRoles(...values.ticketAccessRoleIds);
  }

  return new ModalBuilder()
    .setCustomId(SETTINGS_MODAL_CUSTOM_ID)
    .setTitle('Bot Settings')
    .addLabelComponents(
      textInputLabel({
        customId: SETTINGS_FIELD_IDS.timezone,
        label: 'Timezone',
        description: 'IANA timezone, e.g. Europe/Berlin',
        value: values.timezone,
      }),
      textInputLabel({
        customId: SETTINGS_FIELD_IDS.postTime,
        label: 'Post Time',
        description: 'Days before an event to post attendance',
        value: values.postTime,
      }),
      textInputLabel({
        customId: SETTINGS_FIELD_IDS.remindAttendees,
        label: 'Reminder Frequency',
        description: 'Hours between attendee reminders; 0 disables reminders',
        value: values.remindAttendees,
      }),
      textInputLabel({
        customId: SETTINGS_FIELD_IDS.incidentReminderInterval,
        label: 'Incident Reminder Interval',
        description: 'Hours between incident reminders',
        value: values.incidentReminderInterval,
      }),
      textInputLabel({
        customId: SETTINGS_FIELD_IDS.myChampsApiToken,
        label: 'MyChamps API Token',
        value: values.myChampsApiToken,
        maxLength: 1000,
      }),
      new LabelBuilder()
        .setLabel('Incidents Category')
        .setDescription('Category where incident channels are created')
        .setChannelSelectMenuComponent(categorySelect),
      new LabelBuilder()
        .setLabel('Ticket Access Roles')
        .setDescription('Roles that can view and review incident tickets')
        .setRoleSelectMenuComponent(ticketAccessRoleSelect),
    );
}

function textInputLabel({
  customId,
  label,
  description,
  value,
  maxLength = 100,
}: {
  customId: string;
  label: string;
  description?: string;
  value: string | null;
  maxLength?: number;
}): LabelBuilder {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(maxLength);

  if (value) {
    input.setValue(value);
  }

  const labelBuilder = new LabelBuilder().setLabel(label).setTextInputComponent(input);

  if (description) {
    labelBuilder.setDescription(description);
  }

  return labelBuilder;
}

async function saveSettingsFromModal(
  guildId: string,
  modalSubmit: ModalSubmitInteraction,
): Promise<void> {
  const timezone = cleanModalText(
    modalSubmit.fields.getTextInputValue(SETTINGS_FIELD_IDS.timezone),
  );
  const postTime = cleanModalText(
    modalSubmit.fields.getTextInputValue(SETTINGS_FIELD_IDS.postTime),
  );
  const remindAttendees = cleanModalText(
    modalSubmit.fields.getTextInputValue(SETTINGS_FIELD_IDS.remindAttendees),
  );
  const incidentReminderInterval = cleanModalText(
    modalSubmit.fields.getTextInputValue(SETTINGS_FIELD_IDS.incidentReminderInterval),
  );
  const myChampsApiToken = cleanModalText(
    modalSubmit.fields.getTextInputValue(SETTINGS_FIELD_IDS.myChampsApiToken),
  );
  const incidentCategoryId = modalSubmit.fields
    .getSelectedChannels(SETTINGS_FIELD_IDS.incidentsCategory, false, [ChannelType.GuildCategory])
    ?.first()?.id;
  const ticketAccessRoleIds = Array.from(
    modalSubmit.fields.getSelectedRoles(SETTINGS_FIELD_IDS.ticketAccessRoles)?.keys() ?? [],
  );

  const settingWrites: Array<Promise<void>> = [];

  if (timezone) {
    if (!isValidTimezone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
    settingWrites.push(setSetting(guildId, 'timezone', timezone));
  }

  if (postTime) {
    settingWrites.push(setSetting(guildId, 'post-time', parseModalInteger(postTime, 'Post Time')));
  }

  if (remindAttendees) {
    settingWrites.push(
      setSetting(
        guildId,
        'remind-attendees',
        parseModalInteger(remindAttendees, 'Reminder Frequency'),
      ),
    );
  }

  if (incidentReminderInterval) {
    settingWrites.push(
      setSetting(
        guildId,
        'incident-reminder-interval',
        parseModalInteger(incidentReminderInterval, 'Incident Reminder Interval'),
      ),
    );
  }

  if (myChampsApiToken) {
    settingWrites.push(setSetting(guildId, 'mychamps-api-token', myChampsApiToken));
  }

  settingWrites.push(setSetting(guildId, INCIDENTS_CATEGORY_SETTING_KEY, incidentCategoryId ?? ''));
  settingWrites.push(
    setSetting(guildId, TICKET_ACCESS_ROLES_SETTING_KEY, JSON.stringify(ticketAccessRoleIds)),
  );

  await Promise.all(settingWrites);

  if (remindAttendees) {
    await rebuildReminders(guildId);
  }
}

function cleanModalText(value: string): string | null {
  const cleaned = value.trim();

  return cleaned === '' ? null : cleaned;
}

function parseModalInteger(value: string, label: string): string {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a whole number greater than or equal to 0.`);
  }

  return parsed.toString();
}

async function handleStatsSettings(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!canManageSettings(interaction)) {
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
