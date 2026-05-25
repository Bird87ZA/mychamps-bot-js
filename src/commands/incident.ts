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
import { prisma } from '../database';
import { ChampionshipSummary, MyChampsApiClient } from '../services/myChampsApiClient';
import { getTicketAccessRoleIds } from '../utils/incidentSettings';

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
const DEFAULT_BUTTON_LABEL = 'Report Incident';
const DEFAULT_BUTTON_COLOR = 'Red';
const DEFAULT_BUTTON_MESSAGE =
  'Click the button below to report an incident. You will be asked to provide details.';
const INCIDENT_CHANNEL_LOCK_PERMISSIONS = {
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
    ),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      await handleSetup(interaction);
    } else if (subcommand === 'close') {
      await handleClose(interaction, client);
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

  let championships: ChampionshipSummary[];
  try {
    championships = await apiClient.getChampionships(interaction.user.id);
  } catch (error) {
    console.error('[IncidentCommand] Failed to fetch championships:', error);

    await interaction.reply({
      content: [
        'Failed to fetch championships from MyChamps API.',
        'Check that `mychamps-api-token` is valid and that your Discord account is linked on MyChamps.',
      ]
        .filter(Boolean)
        .join('\n'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!championships || championships.length === 0) {
    await interaction.reply({
      content: 'No championships found for your account.',
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
    await modalSubmit.editReply({ content: 'Selected championship could not be found.' });
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
    await modalSubmit.editReply({ content: 'Setup timed out.', components: [] });
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
    await modalSubmit.editReply({ content: 'Setup timed out.', components: [] });
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
    await interaction.editReply({ content: 'Close command timed out.', components: [] });
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
    await interaction.editReply({ content: 'Close command timed out.', components: [] });
    return;
  }

  const verdictDescription = modalSubmit.fields.getTextInputValue('verdict_description');
  const penaltyValue =
    verdictType === 'Penalty' ? modalSubmit.fields.getTextInputValue('penalty_value') : undefined;

  // Submit verdict to API if we have a remote incident ID
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

  await modalSubmit.reply({ embeds: [embed] });

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
