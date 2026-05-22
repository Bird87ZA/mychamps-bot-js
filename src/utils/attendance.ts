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

function toAttendees(value: unknown): Attendees {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const attendees: Attendees = {};

  for (const [role, members] of Object.entries(value)) {
    if (!members || typeof members !== 'object' || Array.isArray(members)) {
      attendees[role] = {};
      continue;
    }

    attendees[role] = {};
    for (const [memberId, memberName] of Object.entries(members)) {
      if (typeof memberName === 'string') {
        attendees[role][memberId] = memberName;
      }
    }
  }

  return attendees;
}

export function mergeAttendeesWithConfig(
  scheduleAttendees: unknown,
  configuredAttendees: unknown,
): Attendees {
  const configured = toAttendees(configuredAttendees);
  const current = toAttendees(scheduleAttendees);
  const attendees: Attendees = {};
  const hasCurrentAttendees = Object.keys(current).length > 0;

  for (const [role, members] of Object.entries(configured)) {
    attendees[role] = hasCurrentAttendees ? { ...(current[role] ?? {}) } : { ...members };
  }

  for (const [role, members] of Object.entries(current)) {
    if (!(role in attendees)) {
      attendees[role] = { ...members };
    }
  }

  return attendees;
}

export async function buildAttendanceMessage(
  schedule: Schedule,
  client: Client,
): Promise<MessageCreateOptions & MessageEditOptions> {
  const closed = isScheduleClosed(schedule);
  const attendance = await prisma.attendance.findFirst({
    where: { channelId: schedule.channelId },
  });

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

  const attendees = mergeAttendeesWithConfig(schedule.attendees, attendance?.attendees);

  // Add fields for each role
  for (const [role, members] of Object.entries(attendees)) {
    const memberNames = Object.values(members);
    embed.addFields({
      name: role,
      value: memberNames.length > 0 ? memberNames.join('\n') : '-',
      inline: true,
    });
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  let content = '';

  if (!closed) {
    // Build role mention content string
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
