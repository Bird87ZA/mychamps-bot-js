import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  CheckboxBuilder,
  ChatInputCommandInteraction,
  Client,
  ComponentType,
  EmbedBuilder,
  LabelBuilder,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { BotCommand } from '../types';
import { prisma } from '../database';
import { ChampionshipSummary, MyChampsApiClient } from '../services/myChampsApiClient';
import { getTicketAccessRoleIds } from '../utils/incidentSettings';
import { formatMyChampsConfigError, formatUserError } from '../utils/errors';

interface IncidentButtonColorOption {
  label: string;
  value: string;
  description: string;
  emoji: string;
  buttonStyle: ButtonStyle;
  embedColor: number;
}

const SETUP_MODAL_CUSTOM_ID = 'incident_setup_modal';
const SETUP_ROLES_MODAL_CUSTOM_ID = 'incident_setup_roles_modal';
const SETUP_CONTINUE_CUSTOM_ID = 'incident_setup_continue';
const MERGE_SELECT_CUSTOM_ID_PREFIX = 'incident_merge_select';
const MERGE_CONFIRM_CUSTOM_ID_PREFIX = 'incident_merge_confirm';
const DEFAULT_BUTTON_LABEL = 'Report Incident';
const DEFAULT_BUTTON_COLOR = 'Red';
const DEFAULT_BUTTON_MESSAGE =
  'Click the button below to report an incident. You will be asked to provide details.';
const DISCORD_MESSAGE_LIMIT = 2000;
const INCIDENT_CHANNEL_LOCK_PERMISSIONS = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
} as const;
const MERGED_DEFENDANT_PERMISSIONS = {
  ViewChannel: true,
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
} as const;

const SETUP_FIELD_IDS = {
  championship: 'incident_setup_championship',
  buttonLabel: 'incident_setup_button_label',
  buttonColor: 'incident_setup_button_color',
  buttonMessage: 'incident_setup_button_message',
  stewardRoles: 'incident_setup_steward_roles',
  channelRoles: 'incident_setup_channel_roles',
  addReporterToChannel: 'incident_setup_add_reporter_to_channel',
  channelGroup: 'incident_setup_channel_group',
} as const;

const BUTTON_COLOR_OPTIONS: IncidentButtonColorOption[] = [
  {
    label: 'Blue',
    value: 'Blue',
    description: 'Blue embed, primary button style',
    emoji: '🔵',
    buttonStyle: ButtonStyle.Primary,
    embedColor: 0x3498db,
  },
  {
    label: 'Grey',
    value: 'Grey',
    description: 'Grey embed, secondary button style',
    emoji: '⚪',
    buttonStyle: ButtonStyle.Secondary,
    embedColor: 0x95a5a6,
  },
  {
    label: 'Green',
    value: 'Green',
    description: 'Green embed, success button style',
    emoji: '🟢',
    buttonStyle: ButtonStyle.Success,
    embedColor: 0x2ecc71,
  },
  {
    label: 'Red',
    value: 'Red',
    description: 'Red embed, danger button style',
    emoji: '🔴',
    buttonStyle: ButtonStyle.Danger,
    embedColor: 0xe74c3c,
  },
  {
    label: 'Purple',
    value: 'Purple',
    description: 'Purple embed, primary button style',
    emoji: '🟣',
    buttonStyle: ButtonStyle.Primary,
    embedColor: 0x9b59b6,
  },
  {
    label: 'Orange',
    value: 'Orange',
    description: 'Orange embed, danger button style',
    emoji: '🟠',
    buttonStyle: ButtonStyle.Danger,
    embedColor: 0xe67e22,
  },
  {
    label: 'Yellow',
    value: 'Yellow',
    description: 'Yellow embed, success button style',
    emoji: '🟡',
    buttonStyle: ButtonStyle.Success,
    embedColor: 0xf1c40f,
  },
  {
    label: 'Teal',
    value: 'Teal',
    description: 'Teal embed, primary button style',
    emoji: '🟦',
    buttonStyle: ButtonStyle.Primary,
    embedColor: 0x1abc9c,
  },
  {
    label: 'Pink',
    value: 'Pink',
    description: 'Pink embed, danger button style',
    emoji: '🌸',
    buttonStyle: ButtonStyle.Danger,
    embedColor: 0xe91e63,
  },
];

const BUTTON_COLOR_ALIASES: Record<string, string> = {
  Primary: 'Blue',
  Secondary: 'Grey',
  Success: 'Green',
  Danger: 'Red',
};

function getChampionshipCreatedAtTimestamp(championship: ChampionshipSummary): number {
  const timestamp = Date.parse(championship.created_at ?? '');

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareChampionshipsForSetup(
  championshipA: ChampionshipSummary,
  championshipB: ChampionshipSummary,
): number {
  const teamComparison = (championshipA.team_name ?? '').localeCompare(
    championshipB.team_name ?? '',
    undefined,
    { sensitivity: 'base' },
  );

  if (teamComparison !== 0) {
    return teamComparison;
  }

  return (
    getChampionshipCreatedAtTimestamp(championshipB) -
    getChampionshipCreatedAtTimestamp(championshipA)
  );
}

function formatChampionshipOptionLabel(championship: ChampionshipSummary): string {
  const championshipName = championship.name || championship.slug;

  return championship.team_name
    ? `${championship.team_name} - ${championshipName}`
    : championshipName;
}

function getChampionshipTeamKey(championship: ChampionshipSummary): string {
  return String(championship.team_id ?? championship.team_name ?? championship.slug);
}

function newestChampionshipPerTeam(
  sortedChampionships: ChampionshipSummary[],
): ChampionshipSummary[] {
  const seenTeams = new Set<string>();

  return sortedChampionships.filter((championship) => {
    const teamKey = getChampionshipTeamKey(championship);

    if (seenTeams.has(teamKey)) {
      return false;
    }

    seenTeams.add(teamKey);

    return true;
  });
}

function truncateSelectText(value: string): string {
  return value.length > 100 ? value.slice(0, 97) + '...' : value;
}

function getButtonColorOption(value: string): IncidentButtonColorOption {
  const normalizedValue = BUTTON_COLOR_ALIASES[value] ?? value;

  return (
    BUTTON_COLOR_OPTIONS.find((option) => option.value === normalizedValue) ??
    BUTTON_COLOR_OPTIONS.find((option) => option.value === DEFAULT_BUTTON_COLOR) ??
    BUTTON_COLOR_OPTIONS[0]
  );
}

function normalizeButtonColor(value: string): string {
  return getButtonColorOption(value).value;
}

function getButtonStyle(value: string): ButtonStyle {
  return getButtonColorOption(value).buttonStyle;
}

function getEmbedColor(value: string): number {
  return getButtonColorOption(value).embedColor;
}

function buildIncidentSetupModal(championships: ChampionshipSummary[]): ModalBuilder {
  const championshipSelect = new StringSelectMenuBuilder()
    .setCustomId(SETUP_FIELD_IDS.championship)
    .setPlaceholder('Select a championship')
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true)
    .addOptions(
      championships.slice(0, 25).map((championship) => ({
        label: truncateSelectText(formatChampionshipOptionLabel(championship)),
        value: championship.slug,
      })),
    );

  const buttonLabelInput = new TextInputBuilder()
    .setCustomId(SETUP_FIELD_IDS.buttonLabel)
    .setStyle(TextInputStyle.Short)
    .setValue(DEFAULT_BUTTON_LABEL)
    .setRequired(true)
    .setMaxLength(80);

  const buttonColorSelect = new StringSelectMenuBuilder()
    .setCustomId(SETUP_FIELD_IDS.buttonColor)
    .setPlaceholder('Select a color')
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true)
    .addOptions(
      BUTTON_COLOR_OPTIONS.map((option) => ({
        ...option,
        default: option.value === DEFAULT_BUTTON_COLOR,
      })),
    );

  const buttonMessageInput = new TextInputBuilder()
    .setCustomId(SETUP_FIELD_IDS.buttonMessage)
    .setStyle(TextInputStyle.Paragraph)
    .setValue(DEFAULT_BUTTON_MESSAGE)
    .setRequired(true)
    .setMaxLength(1000);

  const channelGroupSelect = new ChannelSelectMenuBuilder()
    .setCustomId(SETUP_FIELD_IDS.channelGroup)
    .setPlaceholder('Select an incident channel category')
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(SETUP_MODAL_CUSTOM_ID)
    .setTitle('Configure Incident Button')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Championship')
        .setDescription('Championship used when incidents are reported')
        .setStringSelectMenuComponent(championshipSelect),
      new LabelBuilder()
        .setLabel('Button Label')
        .setDescription('Text shown on the incident report button')
        .setTextInputComponent(buttonLabelInput),
      new LabelBuilder()
        .setLabel('Button Color')
        .setDescription('Some colors use the nearest Discord button style')
        .setStringSelectMenuComponent(buttonColorSelect),
      new LabelBuilder()
        .setLabel('Button Message')
        .setDescription('Text shown above the incident report button')
        .setTextInputComponent(buttonMessageInput),
      new LabelBuilder()
        .setLabel('Channel Group')
        .setDescription('Category where new incident channels are created')
        .setChannelSelectMenuComponent(channelGroupSelect),
    );
}

function buildIncidentSetupRolesModal(): ModalBuilder {
  const stewardRolesSelect = new RoleSelectMenuBuilder()
    .setCustomId(SETUP_FIELD_IDS.stewardRoles)
    .setPlaceholder('Select steward roles')
    .setMinValues(1)
    .setMaxValues(25)
    .setRequired(true);

  const channelRolesSelect = new RoleSelectMenuBuilder()
    .setCustomId(SETUP_FIELD_IDS.channelRoles)
    .setPlaceholder('Select additional channel roles')
    .setMinValues(0)
    .setMaxValues(25)
    .setRequired(false);

  const addReporterCheckbox = new CheckboxBuilder()
    .setCustomId(SETUP_FIELD_IDS.addReporterToChannel)
    .setDefault(false);

  return new ModalBuilder()
    .setCustomId(SETUP_ROLES_MODAL_CUSTOM_ID)
    .setTitle('Incident Channel Access')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Stewards Role')
        .setDescription('Roles tagged when a defence is submitted')
        .setRoleSelectMenuComponent(stewardRolesSelect),
      new LabelBuilder()
        .setLabel('Roles to Add to Channel')
        .setDescription('Additional roles that can view the incident channel')
        .setRoleSelectMenuComponent(channelRolesSelect),
      new LabelBuilder()
        .setLabel('Add reporter to channel')
        .setDescription('Allow the person reporting an incident to view the created channel')
        .setCheckboxComponent(addReporterCheckbox),
    );
}

function getFirstStringSelectValue(modalSubmit: ModalSubmitInteraction, customId: string): string {
  return modalSubmit.fields.getStringSelectValues(customId)[0] ?? '';
}

function getSelectedRoleIds(modalSubmit: ModalSubmitInteraction, customId: string): string[] {
  let roles;
  try {
    roles = modalSubmit.fields.getSelectedRoles(customId, true);
  } catch {
    return [];
  }

  return Array.from(roles.keys());
}

function getSelectedChannelId(modalSubmit: ModalSubmitInteraction, customId: string): string {
  const channels = modalSubmit.fields.getSelectedChannels(customId, true, [
    ChannelType.GuildCategory,
  ]);

  return Array.from(channels.keys())[0] ?? '';
}

function getCheckboxValue(modalSubmit: ModalSubmitInteraction, customId: string): boolean {
  try {
    return modalSubmit.fields.getCheckbox(customId);
  } catch {
    return false;
  }
}

function isMissingAccessError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorWithCode = error as { code?: unknown; rawError?: { code?: unknown } };

  return errorWithCode.code === 50001 || errorWithCode.rawError?.code === 50001;
}

function isMissingPermissionsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorWithCode = error as { code?: unknown; rawError?: { code?: unknown } };

  return errorWithCode.code === 50013 || errorWithCode.rawError?.code === 50013;
}

function formatIncidentSetupPostError(channelId: string, error: unknown): string {
  const permissionsMessage = [
    `I couldn't post the incident report button in <#${channelId}>.`,
    'Grant the bot `View Channel`, `Send Messages`, and `Embed Links` in that channel.',
    'If the channel is in a private category, grant those permissions on the category or add a channel override for the bot role.',
  ].join('\n');

  if (isMissingAccessError(error)) {
    return permissionsMessage;
  }

  return [
    permissionsMessage,
    'Discord rejected the message unexpectedly; check the bot role permissions and channel overrides.',
  ].join('\n');
}

function formatIncidentPermissionEditError(action: string, error: unknown): string {
  const baseMessage = `I could not ${action} because Discord rejected the channel permission update.`;

  if (!isMissingPermissionsError(error)) {
    return `${baseMessage} Please check the bot logs and channel permission overrides.`;
  }

  return [
    baseMessage,
    'Grant the bot `Manage Roles` and `Manage Channels`, and make sure the bot role is above the roles it needs to manage.',
  ].join('\n');
}

export const incidentCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('incident')
    .setDescription('Manage incident reporting')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set up an incident report button in this channel (admin only)'),
    )
    .addSubcommand((sub) =>
      sub.setName('close').setDescription('Close the current incident channel with a verdict'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('merge')
        .setDescription('Merge another open incident into the current incident channel'),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      await handleSetup(interaction);
    } else if (subcommand === 'close') {
      await handleClose(interaction, client);
    } else if (subcommand === 'merge') {
      await handleMerge(interaction, client);
    }
  },
};

async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  // Admin-only check
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
  } catch (error) {
    await interaction.reply({
      content: formatMyChampsConfigError(error),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let championships: ChampionshipSummary[];
  try {
    championships = await apiClient.getChampionships(interaction.user.id);
  } catch (error) {
    console.error('[IncidentCommand] Failed to fetch championships:', error);

    await interaction.reply({
      content: formatUserError(error, 'fetch championships from MyChamps'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!championships || championships.length === 0) {
    await interaction.reply({
      content:
        'No championships were found for your linked MyChamps account. Check that your Discord account is linked on MyChamps and that you manage or race in at least one championship.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'This command must be used in a text channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sortedChampionships = championships.slice().sort(compareChampionshipsForSetup);
  const newestChampionships = newestChampionshipPerTeam(sortedChampionships);
  const modal = buildIncidentSetupModal(newestChampionships);

  await interaction.showModal(modal);

  let modalSubmit: ModalSubmitInteraction;
  try {
    modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) => i.customId === SETUP_MODAL_CUSTOM_ID && i.user.id === interaction.user.id,
      time: 300_000,
    });
  } catch {
    return;
  }

  await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

  const selectedSlug = getFirstStringSelectValue(modalSubmit, SETUP_FIELD_IDS.championship);
  const selectedChampionship = newestChampionships.find((c) => c.slug === selectedSlug);
  if (!selectedChampionship) {
    await modalSubmit.editReply({
      content:
        'The selected championship is no longer available. Run `/incident setup` again and choose a current championship.',
    });
    return;
  }

  const buttonLabel =
    modalSubmit.fields.getTextInputValue(SETUP_FIELD_IDS.buttonLabel).trim() ||
    DEFAULT_BUTTON_LABEL;
  const buttonColor = normalizeButtonColor(
    getFirstStringSelectValue(modalSubmit, SETUP_FIELD_IDS.buttonColor),
  );
  const buttonMessage =
    modalSubmit.fields.getTextInputValue(SETUP_FIELD_IDS.buttonMessage).trim() ||
    DEFAULT_BUTTON_MESSAGE;
  const incidentCategoryId = getSelectedChannelId(modalSubmit, SETUP_FIELD_IDS.channelGroup);

  const continueButton = new ButtonBuilder()
    .setCustomId(SETUP_CONTINUE_CUSTOM_ID)
    .setLabel('Continue Setup')
    .setStyle(ButtonStyle.Primary);
  const continueRow = new ActionRowBuilder<ButtonBuilder>().addComponents(continueButton);
  const continueMessage = await modalSubmit.editReply({
    content: 'Continue to select steward roles and any extra roles that should access incidents.',
    components: [continueRow],
  });

  let continueInteraction: ButtonInteraction;
  try {
    continueInteraction = (await continueMessage.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.customId === SETUP_CONTINUE_CUSTOM_ID && i.user.id === interaction.user.id,
      time: 300_000,
    })) as ButtonInteraction;
  } catch {
    await modalSubmit.editReply({
      content: 'Incident setup timed out before role selection. Run `/incident setup` again.',
      components: [],
    });
    return;
  }

  await continueInteraction.showModal(buildIncidentSetupRolesModal());

  let rolesModalSubmit: ModalSubmitInteraction;
  try {
    rolesModalSubmit = await continueInteraction.awaitModalSubmit({
      filter: (i) =>
        i.customId === SETUP_ROLES_MODAL_CUSTOM_ID && i.user.id === interaction.user.id,
      time: 300_000,
    });
  } catch {
    await modalSubmit.editReply({
      content: 'Incident setup timed out before saving roles. Run `/incident setup` again.',
      components: [],
    });
    return;
  }

  await rolesModalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

  const stewardRoleIds = getSelectedRoleIds(rolesModalSubmit, SETUP_FIELD_IDS.stewardRoles);
  const channelRoleIds = getSelectedRoleIds(rolesModalSubmit, SETUP_FIELD_IDS.channelRoles);
  const addReporterToChannel = getCheckboxValue(
    rolesModalSubmit,
    SETUP_FIELD_IDS.addReporterToChannel,
  );
  const buttonStyle = getButtonStyle(buttonColor);

  // Build and post the incident button
  const button = new ButtonBuilder()
    .setCustomId(`incident_report!${selectedSlug}`)
    .setLabel(buttonLabel)
    .setStyle(buttonStyle);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  const embed = new EmbedBuilder()
    .setTitle(`${selectedChampionship?.name ?? selectedSlug} — Incident Reporting`)
    .setDescription(buttonMessage)
    .setColor(getEmbedColor(buttonColor));

  let postedMessage: Awaited<ReturnType<typeof channel.send>>;
  try {
    postedMessage = await channel.send({ embeds: [embed], components: [buttonRow] });
  } catch (error) {
    console.error('[IncidentSetup] Failed to post incident report button:', error);
    const errorMessage = formatIncidentSetupPostError(channel.id, error);
    await modalSubmit
      .editReply({
        content: errorMessage,
        components: [],
      })
      .catch(() => undefined);
    await rolesModalSubmit.editReply({
      content: errorMessage,
    });
    return;
  }

  // Save to database
  await prisma.incidentButton.create({
    data: {
      guildId: interaction.guildId!,
      channelId: channel.id,
      messageId: postedMessage.id,
      championshipSlug: selectedSlug,
      incidentCategoryId,
      stewardRoleIds,
      channelRoleIds,
      addReporterToChannel,
      buttonMessage,
      buttonLabel,
      buttonColor,
    },
  });

  await modalSubmit
    .editReply({
      content: `Incident report button posted successfully in <#${channel.id}>.`,
      components: [],
    })
    .catch(() => undefined);

  await rolesModalSubmit.editReply({
    content: `Incident report button posted successfully in <#${channel.id}>.`,
  });
}

async function handleClose(
  interaction: ChatInputCommandInteraction,
  _client: Client,
): Promise<void> {
  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;

  // Check if the current channel is an incident channel
  const incident = await prisma.incident.findFirst({
    where: { guildId, channelId, status: { not: 'closed' } },
  });

  if (!incident) {
    await interaction.reply({
      content: 'This command can only be used in an active incident channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show verdict type select menu
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`incident_close_verdict!${incident.id}`)
    .setPlaceholder('Select verdict type...')
    .addOptions([
      { label: 'Penalty', value: 'Penalty', description: 'Issue a penalty with a value' },
      { label: 'Warning', value: 'Warning', description: 'Issue a warning' },
      { label: 'No Further Action', value: 'NFA', description: 'No further action' },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.reply({
    content: 'Select the verdict type for this incident:',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });

  const channelForCollect = interaction.channel;
  if (!channelForCollect) return;

  let verdictSelectInteraction: StringSelectMenuInteraction;
  try {
    const collected = await channelForCollect.awaitMessageComponent({
      filter: (i) =>
        i.customId === `incident_close_verdict!${incident.id}` && i.user.id === interaction.user.id,
      time: 60_000,
    });
    verdictSelectInteraction = collected as StringSelectMenuInteraction;
  } catch {
    await interaction.editReply({
      content:
        'Incident close timed out before a verdict was selected. Run `/incident close` again.',
      components: [],
    });
    return;
  }

  const verdictType = verdictSelectInteraction.values[0];

  // Build modal based on verdict type
  const modal = new ModalBuilder()
    .setCustomId(`incident_close_modal!${incident.id}!${verdictType}`)
    .setTitle(`Incident Verdict — ${verdictType}`);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('verdict_description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput));

  if (verdictType === 'Penalty') {
    const penaltyValueInput = new TextInputBuilder()
      .setCustomId('penalty_value')
      .setLabel('Penalty Value (e.g. 5 seconds, 3 grid places)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(penaltyValueInput));
  }

  await verdictSelectInteraction.showModal(modal);

  let modalSubmit;
  try {
    modalSubmit = await verdictSelectInteraction.awaitModalSubmit({
      filter: (i) =>
        i.customId === `incident_close_modal!${incident.id}!${verdictType}` &&
        i.user.id === interaction.user.id,
      time: 120_000,
    });
  } catch {
    await interaction.editReply({
      content:
        'Incident close timed out before the verdict was submitted. Run `/incident close` again.',
      components: [],
    });
    return;
  }

  const verdictDescription = modalSubmit.fields.getTextInputValue('verdict_description');
  const penaltyValue =
    verdictType === 'Penalty' ? modalSubmit.fields.getTextInputValue('penalty_value') : undefined;

  // Submit verdict to API if we have a remote incident ID
  let apiSyncWarning: string | null = null;
  if (incident.mychampsIncidentId) {
    try {
      const apiClient = await MyChampsApiClient.fromGuild(guildId);
      await apiClient.submitVerdict(incident.mychampsIncidentId, {
        verdict: verdictType,
        penalty_value: penaltyValue,
        verdict_description: verdictDescription,
      });
    } catch (err) {
      console.error('[IncidentClose] Failed to submit verdict to API:', err);
      apiSyncWarning = formatUserError(err, 'sync the verdict to MyChamps');
    }
  }

  // Post verdict embed in the channel
  const ticketAccessRoleIds = await getTicketAccessRoleIds(guildId);
  const embed = new EmbedBuilder()
    .setTitle('Incident Closed')
    .addFields(
      { name: 'Verdict', value: verdictType, inline: true },
      ...(penaltyValue ? [{ name: 'Penalty', value: penaltyValue, inline: true }] : []),
      { name: 'Description', value: verdictDescription },
    )
    .setColor(0x2ecc71)
    .setTimestamp();

  await modalSubmit.reply({
    content: apiSyncWarning ? `Warning: ${apiSyncWarning}` : undefined,
    embeds: [embed],
  });

  // Lock the channel — remove SEND_MESSAGES from @everyone, keep VIEW_CHANNEL for stewards
  const channel = interaction.channel;
  if (channel && 'permissionOverwrites' in channel) {
    try {
      await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
        ...INCIDENT_CHANNEL_LOCK_PERMISSIONS,
      });
      for (const roleId of ticketAccessRoleIds) {
        await channel.permissionOverwrites.edit(roleId, {
          ViewChannel: true,
          ...INCIDENT_CHANNEL_LOCK_PERMISSIONS,
        });
      }
    } catch (err) {
      console.error('[IncidentClose] Failed to lock channel:', err);
      await modalSubmit
        .followUp({
          content: formatIncidentPermissionEditError('lock the incident channel', err),
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => undefined);
    }
  }

  // Update local incident status
  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'closed' },
  });
}

async function handleMerge(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;

  const existingIncident = await prisma.incident.findFirst({
    where: { guildId, channelId, status: { not: 'closed' } },
  });

  if (!existingIncident) {
    await interaction.reply({
      content: 'This command can only be used in the incident channel you want to keep.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mergeCandidates = await prisma.incident.findMany({
    where: {
      guildId,
      status: { not: 'closed' },
      channelId: { not: null },
      id: { not: existingIncident.id },
    },
    orderBy: [{ incidentNumber: 'asc' }, { createdAt: 'asc' }],
  });

  if (mergeCandidates.length === 0) {
    await interaction.reply({
      content: 'There are no other open bot-created incidents to merge into this one.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const visibleCandidates = mergeCandidates.slice(0, 25);
  const selectCustomId = `${MERGE_SELECT_CUSTOM_ID_PREFIX}!${existingIncident.id}`;

  await interaction.reply({
    content: [
      'Select the incident to merge into this channel, then click Merge.',
      mergeCandidates.length > visibleCandidates.length
        ? `Showing the first 25 of ${mergeCandidates.length} open incidents.`
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
    components: buildMergeComponents(existingIncident.id, visibleCandidates),
    flags: MessageFlags.Ephemeral,
  });

  const channelForCollect = interaction.channel;
  if (!channelForCollect) return;

  let selectedIncidentId: number;
  let selectedIncidentReference: string;
  try {
    const collected = await channelForCollect.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.customId === selectCustomId && i.user.id === interaction.user.id,
      time: 120_000,
    });
    const selectInteraction = collected as StringSelectMenuInteraction;
    const selectedIncident = visibleCandidates.find(
      (incident) => incident.id.toString() === selectInteraction.values[0],
    );

    if (!selectedIncident) {
      await selectInteraction.update({
        content: 'That incident is no longer available to merge. Run `/incident merge` again.',
        components: [],
      });
      return;
    }

    selectedIncidentId = selectedIncident.id;
    selectedIncidentReference = formatIncidentReference(selectedIncident);

    await selectInteraction.update({
      content: `Ready to merge ${selectedIncidentReference} into this incident.`,
      components: buildMergeComponents(existingIncident.id, visibleCandidates, selectedIncidentId),
    });
  } catch {
    await interaction.editReply({
      content:
        'Incident merge timed out before an incident was selected. Run `/incident merge` again.',
      components: [],
    });
    return;
  }

  const confirmCustomId = `${MERGE_CONFIRM_CUSTOM_ID_PREFIX}!${existingIncident.id}!${selectedIncidentId}`;
  try {
    const collected = await channelForCollect.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.customId === confirmCustomId && i.user.id === interaction.user.id,
      time: 120_000,
    });
    const buttonInteraction = collected as ButtonInteraction;
    await buttonInteraction.update({
      content: `Merging ${selectedIncidentReference} into this incident...`,
      components: [],
    });
  } catch {
    await interaction.editReply({
      content: 'Incident merge timed out before Merge was clicked. Run `/incident merge` again.',
      components: [],
    });
    return;
  }

  try {
    const result = await mergeIncidentIntoExisting({
      guildId,
      existingIncidentId: existingIncident.id,
      sourceIncidentId: selectedIncidentId,
      existingChannel: interaction.channel,
      client,
    });

    await interaction.editReply({
      content: [
        `${formatIncidentReference(result.sourceIncident)} was merged into ${formatIncidentReference(result.existingIncident)}.`,
        result.sourceChannelDeleted
          ? 'The merged incident channel and record were removed.'
          : 'The merged incident record was removed, but I could not delete its channel. Check `Manage Channels` for the bot and delete that channel manually.',
      ].join('\n'),
      components: [],
    });
  } catch (error) {
    console.error('[IncidentMerge] Failed to merge incidents:', error);
    await interaction.editReply({
      content: formatUserError(error, 'merge the incidents'),
      components: [],
    });
  }
}

function buildMergeComponents(
  existingIncidentId: number,
  incidents: Array<{
    id: number;
    incidentNumber: number | null;
    channelId: string | null;
    status: string;
    championshipSlug: string;
    createdAt: Date;
  }>,
  selectedIncidentId?: number,
): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${MERGE_SELECT_CUSTOM_ID_PREFIX}!${existingIncidentId}`)
    .setPlaceholder('Select incident to merge into this one')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      incidents.map((incident) => ({
        label: truncateSelectText(formatIncidentReference(incident)),
        value: incident.id.toString(),
        description: truncateSelectText(formatIncidentOptionDescription(incident)),
        default: incident.id === selectedIncidentId,
      })),
    );

  const mergeButton = new ButtonBuilder()
    .setCustomId(
      selectedIncidentId
        ? `${MERGE_CONFIRM_CUSTOM_ID_PREFIX}!${existingIncidentId}!${selectedIncidentId}`
        : `${MERGE_CONFIRM_CUSTOM_ID_PREFIX}!${existingIncidentId}`,
    )
    .setLabel('Merge')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!selectedIncidentId);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
    new ActionRowBuilder<ButtonBuilder>().addComponents(mergeButton),
  ];
}

interface MergeIncidentInput {
  guildId: string;
  existingIncidentId: number;
  sourceIncidentId: number;
  existingChannel: unknown;
  client: Client;
}

async function mergeIncidentIntoExisting({
  guildId,
  existingIncidentId,
  sourceIncidentId,
  existingChannel,
  client,
}: MergeIncidentInput) {
  if (existingIncidentId === sourceIncidentId) {
    throw new Error('Select a different incident to merge.');
  }

  const existingIncident = await prisma.incident.findFirst({
    where: { id: existingIncidentId, guildId, status: { not: 'closed' } },
  });
  const sourceIncident = await prisma.incident.findFirst({
    where: { id: sourceIncidentId, guildId, status: { not: 'closed' } },
  });

  if (!existingIncident || !sourceIncident) {
    throw new Error('One of the selected incidents is no longer open. Refresh and try again.');
  }

  if (!sourceIncident.channelId) {
    throw new Error('The incident being merged does not have a Discord channel.');
  }

  const targetChannel = isIncidentTextChannel(existingChannel)
    ? existingChannel
    : await fetchIncidentTextChannel(client, existingIncident.channelId);
  const sourceChannel = await fetchIncidentTextChannel(client, sourceIncident.channelId);

  const existingDefendants = parseStoredIds(existingIncident.defendants);
  const sourceDefendants = parseStoredIds(sourceIncident.defendants);
  const mergedDefendants = uniqueIds([...existingDefendants, ...sourceDefendants]);
  const mergedDefenceSubmitted = uniqueIds([
    ...parseStoredIds(existingIncident.defenceSubmitted),
    ...parseStoredIds(sourceIncident.defenceSubmitted),
  ]).filter((userId) => mergedDefendants.includes(userId));
  const mergedStewardRoleIds = uniqueIds([
    ...parseStoredIds(existingIncident.stewardRoleIds),
    ...parseStoredIds(sourceIncident.stewardRoleIds),
  ]);
  const defendantsAwaitingDefence = mergedDefendants.filter(
    (userId) => !mergedDefenceSubmitted.includes(userId),
  );
  const sourceDefendantsAwaitingDefence = sourceDefendants.filter(
    (userId) => !mergedDefenceSubmitted.includes(userId),
  );

  for (const userId of sourceDefendantsAwaitingDefence) {
    await targetChannel.permissionOverwrites.edit(userId, MERGED_DEFENDANT_PERMISSIONS);
  }

  await copyIncidentChannelContents(sourceChannel, targetChannel, sourceIncident);

  const mergedStatus =
    mergedDefendants.length > 0 &&
    mergedDefendants.every((userId) => mergedDefenceSubmitted.includes(userId))
      ? 'awaiting_review'
      : 'open';

  await prisma.incident.update({
    where: { id: existingIncident.id },
    data: {
      defendants: mergedDefendants,
      defenceSubmitted: mergedDefenceSubmitted,
      stewardRoleIds: mergedStewardRoleIds,
      status: mergedStatus,
      lastReminderAt: null,
    },
  });

  await sendMergeFollowUp({
    channel: targetChannel,
    incidentId: existingIncident.id,
    sourceIncident,
    defendantsAwaitingDefence,
    stewardRoleIds: mergedStewardRoleIds,
  });

  let sourceChannelDeleted = true;
  try {
    await sourceChannel.delete(
      `Merged into ${formatIncidentReference(existingIncident)} by MyChamps bot`,
    );
  } catch (error) {
    sourceChannelDeleted = false;
    console.error('[IncidentMerge] Failed to delete merged incident channel:', error);
  }

  await prisma.incident.delete({ where: { id: sourceIncident.id } });

  return { existingIncident, sourceIncident, sourceChannelDeleted };
}

async function fetchIncidentTextChannel(
  client: Client,
  channelId: string | null,
): Promise<TextChannel> {
  if (!channelId) {
    throw new Error('The incident does not have a Discord channel.');
  }

  const channel = await client.channels.fetch(channelId);

  if (!isIncidentTextChannel(channel)) {
    throw new Error(`The Discord channel for incident <#${channelId}> is unavailable.`);
  }

  return channel;
}

function isIncidentTextChannel(channel: unknown): channel is TextChannel {
  return Boolean(
    channel &&
    typeof channel === 'object' &&
    'send' in channel &&
    'messages' in channel &&
    'permissionOverwrites' in channel,
  );
}

async function copyIncidentChannelContents(
  sourceChannel: TextChannel,
  targetChannel: TextChannel,
  sourceIncident: { id: number; incidentNumber: number | null; channelId: string | null },
): Promise<void> {
  await targetChannel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(`Merged ${formatIncidentReference(sourceIncident)}`)
        .setDescription(
          `Copied from <#${sourceIncident.channelId}> before the channel was removed.`,
        )
        .setColor(0xf1c40f)
        .setTimestamp(),
    ],
  });

  const messages = await fetchAllMessages(sourceChannel);

  for (const message of messages) {
    await copyIncidentMessage(message, targetChannel);
  }
}

async function fetchAllMessages(channel: TextChannel): Promise<Message[]> {
  const messages: Message[] = [];
  let before: string | undefined;

  for (;;) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });
    const batchMessages = Array.from(batch.values()) as Message[];

    if (batchMessages.length === 0) {
      break;
    }

    messages.push(...batchMessages);
    before = batchMessages[batchMessages.length - 1]?.id;

    if (batchMessages.length < 100) {
      break;
    }
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function copyIncidentMessage(message: Message, targetChannel: TextChannel): Promise<void> {
  const author = message.author?.tag ?? message.author?.username ?? message.author?.id ?? 'Unknown';
  const timestamp = message.createdTimestamp
    ? ` <t:${Math.floor(message.createdTimestamp / 1000)}:f>`
    : '';
  const attachments = Array.from(message.attachments.values())
    .map((attachment) => `[${attachment.name ?? 'Attachment'}](${attachment.url})`)
    .join('\n');
  const contentParts = [
    `**Merged message from ${author}**${timestamp}`,
    message.content?.trim() || null,
    attachments ? `Attachments:\n${attachments}` : null,
  ].filter(Boolean);
  const embeds = message.embeds.slice(0, 10).map((embed) => EmbedBuilder.from(embed));

  if (contentParts.length === 1 && embeds.length === 0) {
    return;
  }

  await targetChannel.send({
    content: truncateDiscordMessage(contentParts.join('\n')),
    embeds,
    allowedMentions: { parse: [] },
  });
}

async function sendMergeFollowUp({
  channel,
  incidentId,
  sourceIncident,
  defendantsAwaitingDefence,
  stewardRoleIds,
}: {
  channel: TextChannel;
  incidentId: number;
  sourceIncident: { id: number; incidentNumber: number | null };
  defendantsAwaitingDefence: string[];
  stewardRoleIds: string[];
}): Promise<void> {
  if (defendantsAwaitingDefence.length > 0) {
    await channel.send({
      content: `${defendantsAwaitingDefence.map((userId) => `<@${userId}>`).join(' ')} ${formatIncidentReference(sourceIncident)} was merged into this incident. Please submit your defence here.`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`defence_done_yes!${incidentId}`)
            .setLabel('Submit Defence')
            .setStyle(ButtonStyle.Success),
        ),
      ],
    });
    return;
  }

  if (stewardRoleIds.length > 0) {
    await channel.send(
      `${stewardRoleIds.map((roleId) => `<@&${roleId}>`).join(' ')} ${formatIncidentReference(sourceIncident)} was merged into this incident, and all selected drivers have submitted their defence.`,
    );
  }
}

function parseStoredIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  return [];
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function formatIncidentReference(incident: { id: number; incidentNumber: number | null }): string {
  return `incident-${formatIncidentNumber(incident.incidentNumber ?? incident.id)}`;
}

function formatIncidentNumber(incidentNumber: number): string {
  return incidentNumber.toString().padStart(4, '0');
}

function formatIncidentOptionDescription(incident: {
  status: string;
  championshipSlug: string;
  channelId: string | null;
}): string {
  return `${incident.status} | ${incident.championshipSlug}${incident.channelId ? ` | #${incident.channelId}` : ''}`;
}

function truncateDiscordMessage(value: string): string {
  return value.length > DISCORD_MESSAGE_LIMIT
    ? value.slice(0, DISCORD_MESSAGE_LIMIT - 3) + '...'
    : value;
}
