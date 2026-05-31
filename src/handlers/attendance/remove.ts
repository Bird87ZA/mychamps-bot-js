import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../database';
import { ephemeralReply } from '../../utils/reply';
import { formatUserError } from '../../utils/errors';

export async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const attendance = await prisma.attendance.findFirst({
      where: { channelId: BigInt(interaction.channelId) },
    });

    if (!attendance) {
      await ephemeralReply(interaction, 'No attendance configuration found.');
      return;
    }

    // Find related schedules and delete their reminders
    const schedules = await prisma.schedule.findMany({
      where: { channelId: attendance.channelId },
      select: { id: true },
    });

    if (schedules.length > 0) {
      await prisma.reminder.deleteMany({
        where: { scheduleId: { in: schedules.map((s) => s.id.toString()) } },
      });
    }

    await prisma.attendance.delete({ where: { id: attendance.id } });

    await ephemeralReply(interaction, 'Attendance configuration removed.');
  } catch (error) {
    console.error('Attendance remove error:', error);
    await ephemeralReply(
      interaction,
      formatUserError(error, 'remove the attendance configuration'),
    );
  }
}
