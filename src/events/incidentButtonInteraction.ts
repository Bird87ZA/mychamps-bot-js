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
  formatRoleMentions,
  getIncidentsCategoryId,
  getTicketAccessRoleIds,
} from '../utils/incidentSettings';
import type { ButtonInteraction, StringSelectMenuInteraction, User } from 'discord.js';

interface EvidenceFile {
  name: string;
  url: string;
}

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
      content: 'Could not find the incident button configuration.',
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
    .setLabel('Description of the incident')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const evidenceUrlInput = new TextInputBuilder()
    .setCustomId('evidence_url')
    .setLabel('Evidence URL (optional)')
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
    await modalSubmit.editReply({ content: 'Could not resolve the server.' });
    return;
  }

  // Call API to create the incident
  let apiIncidentId: number | null = null;
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
  }

  // Resolve settings
  const incidentCategoryId = await getIncidentsCategoryId(guildId);
  const ticketAccessRoleIds = await getTicketAccessRoleIds(guildId);

  // Create private text channel
  const channelName = `incident-${Date.now()}`;
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
          deny: [PermissionFlagsBits.ViewChannel],
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
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        })),
        {
          id: interaction.user.id,
          type: OverwriteType.Member,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ],
    };

    incidentChannel = await guild.channels.create(channelOptions);
  } catch (err) {
    console.error('[IncidentReport] Failed to create channel:', err);
    await modalSubmit.editReply({
      content: 'Failed to create the incident channel. Please contact an administrator.',
    });
    return;
  }

  // Post incident embed in the new channel
  const defendants = selectedDriverUsers.map((user) => user.id);
  const evidenceValue = formatEvidenceValue(evidenceUrl, evidenceFiles);

  const embed = new EmbedBuilder()
    .setTitle('Incident Report')
    .addFields(
      { name: 'Championship', value: incidentButton.championshipSlug, inline: true },
      { name: 'Reported By', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Driver(s) Involved', value: formatUserMentions(selectedDriverUsers) },
      { name: 'Description', value: description },
      ...(evidenceValue ? [{ name: 'Evidence', value: evidenceValue }] : []),
    )
    .setColor(0xe74c3c)
    .setTimestamp();

  // Add defence buttons for each defendant (simplified — tag steward for review)
  const doneRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`defence_done_yes!0`)
      .setLabel('Submit Defence')
      .setStyle(ButtonStyle.Success),
  );

  await (incidentChannel as TextChannel).send({ embeds: [embed], components: [doneRow] });

  if (selectedDriverUsers.length > 0) {
    await (incidentChannel as TextChannel).send(
      `${selectedDriverUsers.map((user) => `<@${user.id}>`).join(' ')} Please post a defence`,
    );
  }

  // Save local incident record
  const savedIncident = await prisma.incident.create({
    data: {
      guildId,
      channelId: incidentChannel.id,
      mychampsIncidentId: apiIncidentId,
      championshipSlug: incidentButton.championshipSlug,
      defendants: defendants,
      status: 'open',
      defenceSubmitted: [],
    },
  });

  console.log(`[IncidentReport] Created incident ${savedIncident.id} in #${channelName}`);

  await modalSubmit.editReply({
    content: `Incident reported successfully. Channel created: <#${incidentChannel.id}>`,
  });
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

export async function handleIncidentDefenceButtonInteraction(
  interaction: ButtonInteraction,
  _client: Client,
): Promise<void> {
  if (!interaction.customId.startsWith('defence_done_')) return;

  const [action] = interaction.customId.split('!');
  const isDone = action === 'defence_done_yes';

  if (!isDone) {
    await interaction.reply({
      content: 'Understood. You can continue to post your defence in this channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;

  const incident = await prisma.incident.findFirst({
    where: { guildId, channelId, status: { not: 'closed' } },
  });

  if (!incident) {
    await interaction.reply({
      content: 'Could not find an active incident for this channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const defendants = (incident.defendants as string[]) ?? [];
  const defenceSubmitted = (incident.defenceSubmitted as string[]) ?? [];

  const userId = interaction.user.id;

  if (defenceSubmitted.includes(userId)) {
    await interaction.reply({
      content: 'You have already submitted your defence.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Mark this defendant as done
  const updatedDefence = [...defenceSubmitted, userId];

  // Remove send permissions for this user
  const channel = interaction.channel;
  if (channel && 'permissionOverwrites' in channel) {
    try {
      await channel.permissionOverwrites.edit(userId, {
        SendMessages: false,
      });
    } catch (err) {
      console.error('[Defence] Failed to revoke send permissions:', err);
    }
  }

  // Check if all defendants have submitted
  const allDone = defendants.length > 0 && updatedDefence.length >= defendants.length;

  await prisma.incident.update({
    where: { id: incident.id },
    data: {
      defenceSubmitted: updatedDefence,
      status: allDone ? 'awaiting_review' : 'open',
    },
  });

  await interaction.reply({
    content: 'Your defence has been submitted. You can no longer send messages in this channel.',
    flags: MessageFlags.Ephemeral,
  });

  if (allDone) {
    const ticketAccessRoleIds = await getTicketAccessRoleIds(guildId);
    const mention = formatRoleMentions(ticketAccessRoleIds);
    if (channel && 'send' in channel) {
      await channel.send(
        `${mention} All defendants have submitted their defence. This incident is awaiting your review.`,
      );
    }
  }
}

export async function handleIncidentSelectMenuInteraction(
  interaction: StringSelectMenuInteraction,
  _client: Client,
): Promise<void> {
  // Handled inline within the command collectors — no additional global handling needed
  void interaction;
}
