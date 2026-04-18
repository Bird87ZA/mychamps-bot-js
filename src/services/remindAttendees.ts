import { Client, GuildMember, TextChannel } from 'discord.js';
import { prisma } from '../database';
import { ServiceInterval, Attendees } from '../types';
import { guildsWithRemindersEnabled } from '../utils/settings';

export const remindAttendeesService: ServiceInterval = {
  name: 'RemindAttendees',
  interval: 60,

  async execute(client: Client): Promise<void> {
    const guildIds = await guildsWithRemindersEnabled();
    if (guildIds.length === 0) return;

    // Find due reminders and get their schedule IDs
    const dueReminders = await prisma.reminder.findMany({
      where: { remindAt: { lte: new Date() } },
    });
    if (dueReminders.length === 0) return;

    const dueScheduleIds = [...new Set(dueReminders.map((r) => r.scheduleId))];

    // Find matching schedules
    const schedules = await prisma.schedule.findMany({
      where: {
        id: { in: dueScheduleIds.map((id) => parseInt(id)) },
        guildId: { in: guildIds.map(BigInt) },
        closed: false,
        botPosted: true,
      },
    });

    for (const schedule of schedules) {
      try {
        const attendance = await prisma.attendance.findFirst({
          where: { channelId: schedule.channelId },
        });
        if (!attendance) continue;

        // Collect IDs of members who have already marked attendance
        const attendees = schedule.attendees as Attendees;
        const markedIds = new Set<string>();
        for (const members of Object.values(attendees)) {
          for (const id of Object.keys(members)) {
            markedIds.add(id);
          }
        }

        // Get roles to check
        const roles = [attendance.fullTime, attendance.reserve, attendance.commentator]
          .filter(Boolean)
          .map((r) => r!.toString());

        // Fetch guild members
        const guild = client.guilds.cache.get(schedule.guildId.toString());
        if (!guild) continue;

        await guild.members.fetch();

        // Find members with applicable roles who haven't marked attendance
        const unmarkedMembers: GuildMember[] = [];
        guild.members.cache.forEach((member) => {
          const hasRole = roles.some((roleId) => member.roles.cache.has(roleId));
          if (hasRole && !markedIds.has(member.id)) {
            unmarkedMembers.push(member);
          }
        });

        const scheduleIdStr = schedule.id.toString();

        if (unmarkedMembers.length === 0) {
          await prisma.reminder.deleteMany({
            where: {
              scheduleId: scheduleIdStr,
              remindAt: { lte: new Date() },
            },
          });
          continue;
        }

        // Send reminder
        const mentions = unmarkedMembers.map((m) => `<@${m.id}>`).join(' ');
        const channel = await client.channels.fetch(schedule.channelId.toString());
        if (channel && 'send' in channel) {
          await (channel as TextChannel).send(`${mentions}: Please mark attendance`);
        }

        // Delete processed reminders
        await prisma.reminder.deleteMany({
          where: {
            scheduleId: scheduleIdStr,
            remindAt: { lte: new Date() },
          },
        });
      } catch (error) {
        console.error(`[RemindAttendees] Error for schedule ${schedule.id}:`, error);
      }
    }
  },
};
