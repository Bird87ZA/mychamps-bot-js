import { Client, TextChannel } from 'discord.js';
import { prisma } from '../database';
import { ServiceInterval } from '../types';
import { buildAttendanceMessage } from '../utils/attendance';

export const botCloserService: ServiceInterval = {
  name: 'BotCloser',
  interval: 60,

  async execute(client: Client): Promise<void> {
    const schedules = await prisma.schedule.findMany({
      where: {
        closed: false,
        closingDateUtc: { lt: new Date() },
        messageId: { not: null },
      },
    });

    for (const schedule of schedules) {
      try {
        const channel = await client.channels.fetch(schedule.channelId.toString());
        if (!channel || !('messages' in channel)) continue;

        const message = await (channel as TextChannel).messages.fetch(
          schedule.messageId!.toString(),
        );

        const messageData = await buildAttendanceMessage({ ...schedule, closed: true }, client);
        await message.edit(messageData);

        await prisma.schedule.update({
          where: { id: schedule.id },
          data: { closed: true },
        });
      } catch (error) {
        console.error(`[BotCloser] Failed to close schedule ${schedule.id}:`, error);
      }
    }
  },
};
