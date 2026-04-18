import { Client, TextChannel } from 'discord.js';
import { prisma } from '../database';
import { ServiceInterval } from '../types';
import { buildAttendanceMessage } from '../utils/attendance';

export const scheduleCheckerService: ServiceInterval = {
  name: 'ScheduleChecker',
  interval: 60,

  async execute(client: Client): Promise<void> {
    // Find schedules that are due to be posted
    // bot_posted = false AND date_utc + time_before days < now
    const schedules = await prisma.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM schedule
      WHERE bot_posted = false
        AND DATE_ADD(date_utc, INTERVAL CAST(time_before AS SIGNED) DAY) < NOW()
    `;

    for (const row of schedules) {
      const id = Number(row.id);
      const schedule = await prisma.schedule.findUnique({ where: { id } });
      if (!schedule) continue;

      // Check that attendance config exists for this channel
      const attendance = await prisma.attendance.findFirst({
        where: { channelId: schedule.channelId },
      });
      if (!attendance) continue;

      try {
        const channel = await client.channels.fetch(schedule.channelId.toString());
        if (!channel || !('send' in channel)) continue;

        const messageData = await buildAttendanceMessage(schedule, client);
        const message = await (channel as TextChannel).send(messageData);

        await prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            botPosted: true,
            messageId: BigInt(message.id),
          },
        });
      } catch (error) {
        console.error(`[ScheduleChecker] Failed to post schedule ${id}:`, error);
      }
    }
  },
};
