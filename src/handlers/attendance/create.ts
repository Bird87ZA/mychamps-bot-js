import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../database';
import { hasTimezone } from '../../utils/settings';
import { rebuildReminders } from '../../utils/reminders';
import { Attendees } from '../../types';
import { ephemeralReply } from '../../utils/reply';
import { formatUserError } from '../../utils/errors';

export async function handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  try {
    await hasTimezone(guildId);

    // Check if attendance already exists for this channel
    const existing = await prisma.attendance.findFirst({
      where: { channelId: BigInt(interaction.channelId) },
    });
    if (existing) {
      await ephemeralReply(interaction, 'An attendance bot already exists for this channel.');
      return;
    }

    const fullTime = interaction.options.getRole('full-time', true);
    const reserve = interaction.options.getRole('reserve');
    const commentator = interaction.options.getRole('commentator');

    // Build teams from team-1 through team-20
    const attendees: Attendees = {};

    for (let i = 1; i <= 20; i++) {
      const teamRole = interaction.options.getRole(`team-${i}`);
      if (teamRole) {
        attendees[teamRole.name] = {};
      }
    }

    if (reserve) {
      attendees['Reserves'] = {};
    }
    if (commentator) {
      attendees['Commentators'] = {};
    }
    attendees['Not Participating'] = {};

    await prisma.attendance.create({
      data: {
        guildId: BigInt(guildId),
        channelId: BigInt(interaction.channelId),
        fullTime: BigInt(fullTime.id),
        reserve: reserve ? BigInt(reserve.id) : null,
        commentator: commentator ? BigInt(commentator.id) : null,
        attendees,
      },
    });

    let message = 'Event created successfully.';

    const schedule = await prisma.schedule.findFirst({
      where: { channelId: BigInt(interaction.channelId) },
    });
    if (!schedule) {
      message += '\nPlease schedule the event using the `/schedule add` command.';
    }

    await rebuildReminders(guildId);
    await ephemeralReply(interaction, message);
  } catch (error) {
    const message = formatUserError(error, 'create the attendance configuration');
    console.error('Attendance create error:', error);
    await ephemeralReply(interaction, message);
  }
}
