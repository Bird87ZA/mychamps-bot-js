import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageCreateOptions,
  MessageEditOptions,
} from 'discord.js';
import { Schedule } from '@prisma/client';
import { prisma } from '../database';
import { Attendees } from '../types';
import { format } from 'date-fns';

export function isScheduleClosed(schedule: Schedule): boolean {
  const now = new Date();
  return (
    schedule.closed ||
    (schedule.closingDateUtc !== null && schedule.closingDateUtc < now) ||
    schedule.dateUtc < now
  );
}

export async function buildAttendanceMessage(
  schedule: Schedule,
  client: Client,
): Promise<MessageCreateOptions & MessageEditOptions> {
  const closed = isScheduleClosed(schedule);

  const embed = new EmbedBuilder()
    .setAuthor({ name: schedule.guildName })
    .setColor(closed ? 0xff0000 : 0x00ff00);

  // Set thumbnail
  const guild = client.guilds.cache.get(schedule.guildId.toString());
  const thumbnail = schedule.image ?? guild?.iconURL();
  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  // Build description
  let description = `Please mark attendance for **${schedule.name}** which will take place on **${format(schedule.date, 'yyyy-MM-dd HH:mm')}**.`;
  if (!closed) {
    const closingDate = schedule.closingDate ?? schedule.date;
    description += ` Attendance will close on **${format(closingDate, 'yyyy-MM-dd HH:mm')}**.`;
  }
  embed.setDescription(description);

  // Get attendees - use schedule's attendees, or fall back to attendance config
  let attendees = schedule.attendees as Attendees;
  if (!attendees || Object.keys(attendees).length === 0) {
    const attendance = await prisma.attendance.findFirst({
      where: { channelId: schedule.channelId },
    });
    if (attendance) {
      attendees = attendance.attendees as Attendees;
    }
  }

  // Add fields for each role
  if (attendees) {
    for (const [role, members] of Object.entries(attendees)) {
      const memberNames = Object.values(members);
      embed.addFields({
        name: role,
        value: memberNames.length > 0 ? memberNames.join('\n') : '-',
        inline: true,
      });
    }
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  let content = '';

  if (!closed) {
    // Build role mention content string
    const attendance = await prisma.attendance.findFirst({
      where: { channelId: schedule.channelId },
    });
    if (attendance) {
      const roles = [attendance.fullTime, attendance.reserve, attendance.commentator].filter(
        Boolean,
      );
      content = roles.map((r) => `<@&${r}>`).join('');
    }

    // Add buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${schedule.id}!yes`)
        .setLabel('Participating')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${schedule.id}!no`)
        .setLabel('Not Participating')
        .setStyle(ButtonStyle.Danger),
    );
    components.push(row);
  }

  return {
    content: content || undefined,
    embeds: [embed],
    components,
  };
}
