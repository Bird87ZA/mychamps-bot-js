import { ButtonInteraction, Client, EmbedBuilder, MessageFlags } from 'discord.js';
import { prisma } from '../database';
import { Attendees } from '../types';
import {
  buildAttendanceMessage,
  isScheduleClosed,
  mergeAttendeesWithConfig,
} from '../utils/attendance';
import { helpSections } from '../commands/help';

export async function handleAttendanceInteraction(
  interaction: ButtonInteraction,
  client: Client,
): Promise<void> {
  const customId = interaction.customId;

  // Handle help buttons
  if (customId.startsWith('help!')) {
    const section = customId.split('!')[1];
    const helpData = helpSections[section];
    if (helpData) {
      const embed = new EmbedBuilder()
        .setTitle(helpData.title)
        .setDescription(helpData.content)
        .setColor(0x5865f2);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (!customId.includes('!')) return;

  const [scheduleIdStr, response] = customId.split('!');
  const scheduleId = parseInt(scheduleIdStr, 10);
  if (isNaN(scheduleId)) return;

  try {
    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) return;

    if (isScheduleClosed(schedule)) {
      await interaction.reply({
        content: 'The attendance bot is closed.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const attendance = await prisma.attendance.findFirst({
      where: { channelId: schedule.channelId },
    });
    if (!attendance) return;

    const member = interaction.member;
    if (!member || !('roles' in member)) return;

    const memberId = member.user.id;
    const memberRoleMap: Record<string, string> = {};

    // Build a map of roleId -> roleName from the member's roles
    if ('cache' in member.roles) {
      member.roles.cache.forEach((role) => {
        memberRoleMap[role.id] = role.name;
      });
    }

    const memberName =
      ('nickname' in member ? (member.nickname as string | null) : null) ??
      ('globalName' in member.user ? (member.user.globalName as string | null) : null) ??
      member.user.username;

    const attendees: Attendees = mergeAttendeesWithConfig(schedule.attendees, attendance.attendees);

    if (response === 'yes') {
      // Determine which role category the member belongs to
      let assignedRole: string | null = null;

      if (attendance.reserve && memberRoleMap[attendance.reserve.toString()]) {
        assignedRole = 'Reserves';
      } else if (attendance.commentator && memberRoleMap[attendance.commentator.toString()]) {
        assignedRole = 'Commentators';
      } else {
        // Check team roles - match by role name against attendance categories
        const attendeeRoles = Object.keys(attendees);
        for (const roleName of Object.values(memberRoleMap)) {
          if (
            attendeeRoles.includes(roleName) &&
            roleName !== 'Reserves' &&
            roleName !== 'Commentators' &&
            roleName !== 'Not Participating'
          ) {
            assignedRole = roleName;
            break;
          }
        }
      }

      if (!assignedRole) {
        await interaction.reply({
          content: 'You are not allowed to participate in this event.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Add to assigned role
      if (!attendees[assignedRole]) attendees[assignedRole] = {};
      attendees[assignedRole][memberId] = memberName;

      // Remove from all other roles
      for (const role of Object.keys(attendees)) {
        if (role !== assignedRole) {
          delete attendees[role][memberId];
        }
      }
    } else if (response === 'no') {
      // Add to Not Participating
      if (!attendees['Not Participating']) attendees['Not Participating'] = {};
      attendees['Not Participating'][memberId] = memberName;

      // Remove from all other roles
      for (const role of Object.keys(attendees)) {
        if (role !== 'Not Participating') {
          delete attendees[role][memberId];
        }
      }
    }

    // Save updated attendees
    await prisma.schedule.update({
      where: { id: scheduleId },
      data: { attendees, messageId: schedule.messageId ?? BigInt(interaction.message.id) },
    });

    // Update the message
    const updatedSchedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (updatedSchedule) {
      const messageData = await buildAttendanceMessage(updatedSchedule, client);
      await interaction.update(messageData);
    }
  } catch (error) {
    console.error('Attendance interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral });
    }
  }
}
