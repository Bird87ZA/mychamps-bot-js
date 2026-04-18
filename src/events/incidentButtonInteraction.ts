import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GuildChannelCreateOptions,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  OverwriteType,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { prisma } from '../database';
import { MyChampsApiClient } from '../services/myChampsApiClient';
import { getSetting } from '../utils/settings';
import type { ButtonInteraction } from 'discord.js';

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

  const driverNamesInput = new TextInputBuilder()
    .setCustomId('driver_names')
    .setLabel('Driver Name(s) Involved (comma-separated)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder('e.g. Driver A, Driver B');

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

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(driverNamesInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(evidenceUrlInput),
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

  const driverNames = modalSubmit.fields.getTextInputValue('driver_names');
  const description = modalSubmit.fields.getTextInputValue('description');
  const evidenceUrl = modalSubmit.fields.getTextInputValue('evidence_url') || undefined;

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
      evidence_url: evidenceUrl,
      defendant_driver_ids: [],
    });
    apiIncidentId = result?.id ?? null;
  } catch (err) {
    console.error('[IncidentReport] API error:', err);
  }

  // Resolve settings
  const incidentCategoryId = await getSetting(guildId, 'incident-category');
  const stewardRoleId = await getSetting(guildId, 'steward-role');

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
        ...(stewardRoleId
          ? [
              {
                id: stewardRoleId,
                type: OverwriteType.Role as const,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
              },
            ]
          : []),
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
  const defendants = driverNames
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  const embed = new EmbedBuilder()
    .setTitle('Incident Report')
    .addFields(
      { name: 'Championship', value: incidentButton.championshipSlug, inline: true },
      { name: 'Reported By', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Driver(s) Involved', value: defendants.join(', ') || 'N/A' },
      { name: 'Description', value: description },
      ...(evidenceUrl ? [{ name: 'Evidence', value: evidenceUrl }] : []),
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
    const stewardRoleId = await getSetting(guildId, 'steward-role');
    const mention = stewardRoleId ? `<@&${stewardRoleId}>` : 'Stewards';
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
