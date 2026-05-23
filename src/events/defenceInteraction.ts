import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  Message,
  MessageFlags,
  TextChannel,
} from 'discord.js';
import { prisma } from '../database';
import { formatRoleMentions, getTicketAccessRoleIds } from '../utils/incidentSettings';

/**
 * Called when a new message is created in a guild channel.
 * Checks if the channel is an active incident channel and if the author
 * is a defendant, then shows "Are you done?" Yes/No buttons.
 */
export async function handleDefenceMessage(message: Message, _client: Client): Promise<void> {
  if (message.author.bot) return;

  const guildId = message.guildId;
  const channelId = message.channelId;

  if (!guildId) return;

  const incident = await prisma.incident.findFirst({
    where: {
      guildId,
      channelId,
      status: 'open',
    },
  });

  if (!incident) return;

  const defendants = (incident.defendants as string[]) ?? [];
  const defenceSubmitted = (incident.defenceSubmitted as string[]) ?? [];
  const authorId = message.author.id;

  // Only show prompt to defendants who haven't yet submitted
  if (!defendants.includes(authorId)) return;
  if (defenceSubmitted.includes(authorId)) return;

  const yesButton = new ButtonBuilder()
    .setCustomId(`defence_done_yes!${incident.id}`)
    .setLabel('Yes, I am done')
    .setStyle(ButtonStyle.Success);

  const noButton = new ButtonBuilder()
    .setCustomId(`defence_done_no!${incident.id}`)
    .setLabel('No, continue')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(yesButton, noButton);

  await message.reply({
    content: 'Have you finished submitting your defence?',
    components: [row],
  });
}

/**
 * Handle the Yes/No defence done buttons.
 */
export async function handleDefenceDoneInteraction(
  interaction: ButtonInteraction,
  _client: Client,
): Promise<void> {
  const { customId } = interaction;

  const isYes = customId.startsWith('defence_done_yes!');
  const isNo = customId.startsWith('defence_done_no!');

  if (!isYes && !isNo) return;

  if (isNo) {
    await interaction.reply({
      content: 'Understood. You can continue posting your defence in this channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Yes — mark defence submitted
  const parts = customId.split('!');
  const incidentId = parseInt(parts[1], 10);

  if (isNaN(incidentId)) return;

  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;

  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, guildId, channelId, status: { not: 'closed' } },
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

  const updatedDefence = [...defenceSubmitted, userId];

  // Revoke send permission for this defendant
  const channel = interaction.channel as TextChannel | null;
  if (channel && 'permissionOverwrites' in channel) {
    try {
      await channel.permissionOverwrites.edit(userId, {
        SendMessages: false,
      });
    } catch (err) {
      console.error('[Defence] Failed to revoke send permissions:', err);
    }
  }

  const allDone = defendants.length > 0 && updatedDefence.length >= defendants.length;

  await prisma.incident.update({
    where: { id: incident.id },
    data: {
      defenceSubmitted: updatedDefence,
      status: allDone ? 'awaiting_review' : 'open',
    },
  });

  await interaction.reply({
    content: 'Your defence has been recorded. You can no longer send messages in this channel.',
    flags: MessageFlags.Ephemeral,
  });

  if (allDone && channel) {
    const ticketAccessRoleIds = await getTicketAccessRoleIds(guildId);
    const mention = formatRoleMentions(ticketAccessRoleIds);
    await channel.send(
      `${mention} All defendants have submitted their defence. This incident is now awaiting your review.`,
    );
  }
}
