import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database';
import { hasTimezone, getSetting } from '../../utils/settings';
import { parseDate, convertToUtc } from '../../utils/timezone';
import { rebuildReminders } from '../../utils/reminders';
import { ephemeralReply } from '../../utils/reply';
import { formatUserError } from '../../utils/errors';

const INVALID_IMAGE_MESSAGE = 'The image must be a valid Discord image URL.';

function normalizeImage(image: string | null): string | null {
  const trimmedImage = image?.trim();
  return trimmedImage ? trimmedImage : null;
}

function isValidDiscordImageUrl(image: string): boolean {
  try {
    new EmbedBuilder().setThumbnail(image);
    const { protocol } = new URL(image);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  try {
    await hasTimezone(guildId);

    const name = interaction.options.getString('name', true);
    const dateStr = interaction.options.getString('date', true);
    const closingDateStr = interaction.options.getString('closing-date');
    const image = normalizeImage(interaction.options.getString('image'));

    if (image && !isValidDiscordImageUrl(image)) {
      await ephemeralReply(interaction, INVALID_IMAGE_MESSAGE);
      return;
    }

    const date = parseDate(dateStr);
    if (!date) {
      await ephemeralReply(interaction, 'Invalid date format. Use YYYYMMDD HH:MM.');
      return;
    }

    const timezone = (await getSetting(guildId, 'timezone'))!;
    const dateUtc = convertToUtc(date, timezone);

    if (dateUtc < new Date()) {
      await ephemeralReply(interaction, 'The date is in the past.');
      return;
    }

    let closingDate: Date | null = null;
    let closingDateUtc: Date | null = null;
    if (closingDateStr) {
      closingDate = parseDate(closingDateStr);
      if (!closingDate) {
        await ephemeralReply(interaction, 'Invalid closing date format. Use YYYYMMDD HH:MM.');
        return;
      }
      closingDateUtc = convertToUtc(closingDate, timezone);
    }

    const postTime = (await getSetting(guildId, 'post-time')) ?? '6';

    await prisma.schedule.create({
      data: {
        guildId: BigInt(guildId),
        channelId: BigInt(interaction.channelId),
        guildName: interaction.guild!.name,
        name,
        date,
        dateUtc,
        closingDate,
        closingDateUtc,
        timeBefore: `-${postTime}`,
        attendees: {},
        image,
      },
    });

    let message = 'Event scheduled successfully.';

    const attendance = await prisma.attendance.findFirst({
      where: { channelId: BigInt(interaction.channelId) },
    });
    if (!attendance) {
      message += '\nPlease create the attendance message using the `/attendance create` command.';
    }

    await rebuildReminders(guildId);
    await ephemeralReply(interaction, message);
  } catch (error) {
    const message = formatUserError(error, 'add the schedule');
    console.error('Schedule add error:', error);
    await ephemeralReply(interaction, message);
  }
}
