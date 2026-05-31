import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  FileUploadBuilder,
  GuildChannelCreateOptions,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  OverwriteType,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { prisma } from '../database';
import { MyChampsApiClient } from '../services/myChampsApiClient';
import {
  getIncidentsCategoryId,
  getTicketAccessRoleIds,
  parseSettingIds,
} from '../utils/incidentSettings';
import { formatUserError } from '../utils/errors';
import type { ButtonInteraction, Guild, StringSelectMenuInteraction, User } from 'discord.js';

interface EvidenceFile {
  name: string;
  url: string;
}

const INCIDENT_WRITE_PERMISSION_DENIES = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.AddReactions,
];

export async function handleIncidentButtonInteraction(
  interaction: ButtonInteraction,
  client: Client,
): Promise<void> {
  // customId format: incident_report!<championshipSlug>
  if (!interaction.customId.startsWith('incident_report!')) return;

  const messageId = interaction.message.id;

  // Look up the IncidentButton record
  const incidentButton = await prisma.incidentButton.findUnique({
    where: { messageId },
  });

  if (!incidentButton) {
    await interaction.reply({
      content:
        'This incident button is no longer configured. Ask an admin to run `/incident setup` again in this channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show modal: driver names, description, evidence URL
  const modal = new ModalBuilder()
    .setCustomId(`incident_report_modal!${incidentButton.id}`)
    .setTitle('Report an Incident');

  const driverUsersInput = new UserSelectMenuBuilder()
    .setCustomId('driver_users')
    .setPlaceholder('Select driver(s) involved')
    .setMinValues(0)
    .setMaxValues(10)
    .setRequired(false);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const evidenceUrlInput = new TextInputBuilder()
    .setCustomId('evidence_url')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder('https://...');

  const evidenceFilesInput = new FileUploadBuilder()
    .setCustomId('evidence_files')
    .setRequired(false)
    .setMinValues(0)
    .setMaxValues(5);

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Driver(s) Involved')
      .setDescription('Select the Discord user(s) involved in the incident')
      .setUserSelectMenuComponent(driverUsersInput),
    new LabelBuilder().setLabel('Description').setTextInputComponent(descriptionInput),
    new LabelBuilder().setLabel('Evidence URL').setTextInputComponent(evidenceUrlInput),
    new LabelBuilder()
      .setLabel('Evidence Files')
      .setDescription('Optional screenshots, clips, or supporting files')
      .setFileUploadComponent(evidenceFilesInput),
  );

  await interaction.showModal(modal);

  // Wait for modal submission
  let modalSubmit: ModalSubmitInteraction;
  try {
    modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) =>
        i.customId === `incident_report_modal!${incidentButton.id}` &&
        i.user.id === interaction.user.id,
      time: 300_000,
    });
  } catch {
    return; // timed out — no action needed
  }

  await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

  const selectedDriverUsers = getSelectedDriverUsers(modalSubmit);
  const description = modalSubmit.fields.getTextInputValue('description');
  const evidenceUrl = modalSubmit.fields.getTextInputValue('evidence_url') || undefined;
  const evidenceFiles = getEvidenceFiles(modalSubmit);

  const guildId = interaction.guildId!;
  const guild = interaction.guild;

  if (!guild) {
    await modalSubmit.editReply({
      content:
        'I could not resolve this Discord server while creating the incident. This looks like a bot state issue; please try again.',
    });
    return;
  }

  // Call API to create the incident
  let apiIncidentId: number | null = null;
  let apiSyncWarning: string | null = null;
  try {
    const apiClient = await MyChampsApiClient.fromGuild(guildId);
    const result = await apiClient.createIncident({
      championship_slug: incidentButton.championshipSlug,
      reported_by_discord_id: interaction.user.id,
      description,
      evidence_url: evidenceUrl ?? evidenceFiles[0]?.url,
      defendant_driver_ids: [],
    });
    apiIncidentId = result?.id ?? null;
  } catch (err) {
    console.error('[IncidentReport] API error:', err);
    apiSyncWarning = formatUserError(err, 'sync the incident to MyChamps');
  }

  // Resolve per-button setup, with global settings as a fallback for older buttons.
  const incidentCategoryId =
    incidentButton.incidentCategoryId ?? (await getIncidentsCategoryId(guildId));
  const configuredStewardRoleIds = parseStoredRoleIds(incidentButton.stewardRoleIds);
  const configuredChannelRoleIds = parseStoredRoleIds(incidentButton.channelRoleIds);
  const configuredAccessRoleIds = uniqueIds([
    ...configuredStewardRoleIds,
    ...configuredChannelRoleIds,
  ]);
  const ticketAccessRoleIds =
    configuredAccessRoleIds.length > 0
      ? configuredAccessRoleIds
      : await getTicketAccessRoleIds(guildId);

  // Create private text channel
  const incidentNumber = await getNextIncidentNumber(guildId, guild);
  const channelName = `incident-${formatIncidentNumber(incidentNumber)}`;
  const reporterAccessOverwrites =
    incidentButton.addReporterToChannel &&
    !selectedDriverUsers.some((user) => user.id === interaction.user.id)
      ? [
          {
            id: interaction.user.id,
            type: OverwriteType.Member as const,
            allow: [PermissionFlagsBits.ViewChannel],
            deny: INCIDENT_WRITE_PERMISSION_DENIES,
          },
        ]
      : [];
  let incidentChannel;
  try {
    const channelOptions: GuildChannelCreateOptions = {
      name: channelName,
      type: ChannelType.GuildText,
      parent: incidentCategoryId ?? undefined,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel, ...INCIDENT_WRITE_PERMISSION_DENIES],
        },
        {
          id: client.user!.id,
          type: OverwriteType.Member,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        ...ticketAccessRoleIds.map((roleId) => ({
          id: roleId,
          type: OverwriteType.Role as const,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        })),
        ...selectedDriverUsers.map((user) => ({
          id: user.id,
          type: OverwriteType.Member as const,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: INCIDENT_WRITE_PERMISSION_DENIES,
        })),
        ...reporterAccessOverwrites,
      ],
    };

    incidentChannel = await guild.channels.create(channelOptions);
  } catch (err) {
    console.error('[IncidentReport] Failed to create channel:', err);
    await modalSubmit.editReply({
      content: formatIncidentChannelCreateError(incidentCategoryId, err),
    });
    return;
  }

  // Post incident embed in the new channel
  const defendants = selectedDriverUsers.map((user) => user.id);
  const evidenceValue = formatEvidenceValue(evidenceUrl, evidenceFiles);

  const embed = new EmbedBuilder()
    .setTitle('Incident Report')
    .addFields(
      { name: 'Reported By', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Driver(s) Involved', value: formatUserMentions(selectedDriverUsers) },
      { name: 'Description', value: description },
      ...(evidenceValue ? [{ name: 'Evidence', value: evidenceValue }] : []),
    )
    .setColor(0x95a5a6)
    .setTimestamp();

  // Save local incident record
  const savedIncident = await prisma.incident.create({
    data: {
      guildId,
      channelId: incidentChannel.id,
      incidentNumber,
      mychampsIncidentId: apiIncidentId,
      championshipSlug: incidentButton.championshipSlug,
      defendants: defendants,
      stewardRoleIds: configuredStewardRoleIds,
      status: 'open',
      defenceSubmitted: [],
    },
  });

  const incidentMessageOptions =
    selectedDriverUsers.length > 0
      ? {
          embeds: [embed],
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`defence_done_yes!${savedIncident.id}`)
                .setLabel('Submit Defence')
                .setStyle(ButtonStyle.Success),
            ),
          ],
        }
      : { embeds: [embed] };

  await (incidentChannel as TextChannel).send(incidentMessageOptions);

  if (selectedDriverUsers.length > 0) {
    await (incidentChannel as TextChannel).send(
      `${selectedDriverUsers.map((user) => `<@${user.id}>`).join(' ')} Please submit a defence`,
    );
  }

  console.log(`[IncidentReport] Created incident ${savedIncident.id} in #${channelName}`);

  await modalSubmit.editReply({
    content: [
      `Incident reported successfully. Channel created: <#${incidentChannel.id}>`,
      apiSyncWarning ? `Warning: ${apiSyncWarning}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  });
}

function parseStoredRoleIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((roleId): roleId is string => typeof roleId === 'string')
      .map((roleId) => roleId.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return parseSettingIds(value);
  }

  return [];
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function formatIncidentNumber(incidentNumber: number): string {
  return incidentNumber.toString().padStart(4, '0');
}

async function getNextIncidentNumber(guildId: string, guild: Guild): Promise<number> {
  const incidents =
    (await prisma.incident.findMany({
      where: { guildId },
      select: { incidentNumber: true },
    })) ?? [];

  const storedMax = incidents.reduce(
    (max, incident) => Math.max(max, incident.incidentNumber ?? 0),
    0,
  );
  const channelMax = getMaxIncidentChannelNumber(guild);

  return Math.max(storedMax, channelMax) + 1;
}

function getMaxIncidentChannelNumber(guild: Guild): number {
  const channels = guild.channels.cache;
  if (!channels) {
    return 0;
  }

  let max = 0;
  for (const channel of channels.values()) {
    const match = /^incident-(\d+)$/i.exec(channel.name);
    if (!match) {
      continue;
    }

    max = Math.max(max, Number(match[1]));
  }

  return max;
}

function formatUserMentions(users: User[]): string {
  return users.length > 0 ? users.map((user) => `<@${user.id}>`).join(', ') : 'N/A';
}

function getEvidenceFiles(modalSubmit: ModalSubmitInteraction): EvidenceFile[] {
  try {
    return Array.from(modalSubmit.fields.getUploadedFiles('evidence_files')?.values() ?? []).map(
      (file) => ({ name: file.name, url: file.url }),
    );
  } catch {
    return [];
  }
}

function getSelectedDriverUsers(modalSubmit: ModalSubmitInteraction): User[] {
  try {
    return Array.from(modalSubmit.fields.getSelectedUsers('driver_users')?.values() ?? []);
  } catch {
    return [];
  }
}

function isMissingPermissionsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorWithCode = error as { code?: unknown; rawError?: { code?: unknown } };

  return errorWithCode.code === 50013 || errorWithCode.rawError?.code === 50013;
}

function formatIncidentChannelCreateError(categoryId: string | null, error: unknown): string {
  const target = categoryId ? ` in <#${categoryId}>` : '';

  if (isMissingPermissionsError(error)) {
    return [
      `I could not create the incident channel${target} because Discord rejected the permission setup.`,
      'Grant the bot `Manage Channels`, `View Channel`, and `Send Messages` on the incident category, and make sure the bot role is high enough to manage channel overwrites.',
    ].join('\n');
  }

  return [
    `I could not create the incident channel${target}.`,
    'This looks like a bot or Discord server error; please try again or ask an admin to check the bot logs.',
  ].join('\n');
}

function formatEvidenceValue(
  evidenceUrl: string | undefined,
  evidenceFiles: EvidenceFile[],
): string | null {
  const evidenceLinks = [
    ...(evidenceUrl ? [evidenceUrl] : []),
    ...evidenceFiles.map((file) => `[${file.name}](${file.url})`),
  ];

  if (evidenceLinks.length === 0) {
    return null;
  }

  const value = evidenceLinks.join('\n');

  return value.length > 1024 ? value.slice(0, 1021) + '...' : value;
}

export async function handleIncidentSelectMenuInteraction(
  interaction: StringSelectMenuInteraction,
  _client: Client,
): Promise<void> {
  // Handled inline within the command collectors — no additional global handling needed
  void interaction;
}
