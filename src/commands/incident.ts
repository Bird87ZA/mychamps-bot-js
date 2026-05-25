import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
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

const BUTTON_COLOR_MAP: Record<string, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

const SETUP_MODAL_CUSTOM_ID = 'incident_setup_modal';
const DEFAULT_BUTTON_LABEL = 'Report Incident';
const DEFAULT_BUTTON_COLOR = 'Danger';

const SETUP_FIELD_IDS = {
  championship: 'incident_setup_championship',
  buttonLabel: 'incident_setup_button_label',
  buttonColor: 'incident_setup_button_color',
  stewardRoles: 'incident_setup_steward_roles',
  channelGroup: 'incident_setup_channel_group',
} as const;

const BUTTON_COLOR_OPTIONS = [
  {
    label: 'Blue',
    value: 'Primary',
    description: 'Primary button style',
    emoji: '🔵',
  },
  {
    label: 'Grey',
    value: 'Secondary',
    description: 'Secondary button style',
    emoji: '⚪',
  },
  {
    label: 'Green',
    value: 'Success',
    description: 'Success button style',
    emoji: '🟢',
  },
  {
    label: 'Red',
    value: 'Danger',
    description: 'Danger button style',
    emoji: '🔴',
  },
] as const;

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
    .setPlaceholder('Select a button color')
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true)
    .addOptions(
      BUTTON_COLOR_OPTIONS.map((option) => ({
        ...option,
        default: option.value === DEFAULT_BUTTON_COLOR,
      })),
    );

  const stewardRolesSelect = new RoleSelectMenuBuilder()
    .setCustomId(SETUP_FIELD_IDS.stewardRoles)
    .setPlaceholder('Select steward roles')
    .setMinValues(1)
    .setMaxValues(25)
    .setRequired(true);

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
        .setDescription('Discord buttons support four predefined styles')
        .setStringSelectMenuComponent(buttonColorSelect),
      new LabelBuilder()
        .setLabel('Stewards Role')
        .setDescription('Roles that can view the created incident channel')
        .setRoleSelectMenuComponent(stewardRolesSelect),
      new LabelBuilder()
        .setLabel('Channel Group')
        .setDescription('Category where new incident channels are created')
        .setChannelSelectMenuComponent(channelGroupSelect),
    );
}

function getFirstStringSelectValue(modalSubmit: ModalSubmitInteraction, customId: string): string {
  return modalSubmit.fields.getStringSelectValues(customId)[0] ?? '';
}

function getSelectedRoleIds(modalSubmit: ModalSubmitInteraction, customId: string): string[] {
  const roles = modalSubmit.fields.getSelectedRoles(customId, true);

  return Array.from(roles.keys());
}

function getSelectedChannelId(modalSubmit: ModalSubmitInteraction, customId: string): string {
  const channels = modalSubmit.fields.getSelectedChannels(customId, true, [
    ChannelType.GuildCategory,
  ]);

  return Array.from(channels.keys())[0] ?? '';
}

function normalizeButtonColor(value: string): string {
  return value in BUTTON_COLOR_MAP ? value : DEFAULT_BUTTON_COLOR;
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
  const buttonStyle = BUTTON_COLOR_MAP[buttonColor];
  const stewardRoleIds = getSelectedRoleIds(modalSubmit, SETUP_FIELD_IDS.stewardRoles);
  const incidentCategoryId = getSelectedChannelId(modalSubmit, SETUP_FIELD_IDS.channelGroup);

  // Build and post the incident button
  const button = new ButtonBuilder()
    .setCustomId(`incident_report!${selectedSlug}`)
    .setLabel(buttonLabel)
    .setStyle(buttonStyle);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  const embed = new EmbedBuilder()
    .setTitle(`${selectedChampionship?.name ?? selectedSlug} — Incident Reporting`)
    .setDescription(
      'Click the button below to report an incident. You will be asked to provide details.',
    )
    .setColor(0xe74c3c);

  const postedMessage = await channel.send({ embeds: [embed], components: [buttonRow] });

  // Save to database
  await prisma.incidentButton.create({
    data: {
      guildId: interaction.guildId!,
      channelId: channel.id,
      messageId: postedMessage.id,
      championshipSlug: selectedSlug,
      incidentCategoryId,
      stewardRoleIds,
      buttonLabel,
      buttonColor,
    },
  });

  await modalSubmit.editReply({
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
        SendMessages: false,
      });
      for (const roleId of ticketAccessRoleIds) {
        await channel.permissionOverwrites.edit(roleId, {
          ViewChannel: true,
          SendMessages: false,
        });
      }
    } catch (err) {
      console.error('[IncidentClose] Failed to lock channel:', err);
    }
  }

  // Update local incident status
  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'closed' },
  });
}
