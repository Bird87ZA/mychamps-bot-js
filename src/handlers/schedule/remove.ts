import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../database';
import { ephemeralReply } from '../../utils/reply';

export async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const id = interaction.options.getInteger('id', true);

    const deleted = await prisma.schedule.deleteMany({
      where: {
        id,
        channelId: BigInt(interaction.channelId),
      },
    });

    if (deleted.count === 0) {
      await ephemeralReply(interaction, 'No event found to delete.');
      return;
    }

    await prisma.reminder.deleteMany({
      where: { scheduleId: id.toString() },
    });

    await ephemeralReply(interaction, 'Event deleted successfully.');
  } catch (error) {
    console.error('Schedule remove error:', error);
    await ephemeralReply(interaction, 'An error occurred.');
  }
}
