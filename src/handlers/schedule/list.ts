import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { prisma } from '../../database';
import { format } from 'date-fns';
import { formatUserError } from '../../utils/errors';

export async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const schedules = await prisma.schedule.findMany({
      where: { channelId: BigInt(interaction.channelId) },
      orderBy: { date: 'asc' },
    });

    const embed = new EmbedBuilder().setColor(0x9370db);

    if (schedules.length === 0) {
      embed.setDescription('No events scheduled.');
    } else {
      embed.setAuthor({ name: schedules[0].guildName });

      const guild = interaction.guild;
      if (guild?.iconURL()) {
        embed.setThumbnail(guild.iconURL());
      }

      let description = 'Events scheduled:';
      schedules.forEach((schedule, index) => {
        description += `\n**Round ${index + 1}**: ${schedule.name} on ${format(schedule.date, 'yyyy-MM-dd HH:mm')}`;
        if (schedule.closingDate) {
          description += ` (Closes ${format(schedule.closingDate, 'yyyy-MM-dd HH:mm')})`;
        }
      });

      embed.setDescription(description);
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Schedule list error:', error);
    await interaction.reply({
      content: formatUserError(error, 'list schedules'),
      flags: MessageFlags.Ephemeral,
    });
  }
}
