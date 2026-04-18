import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../types';
import { prisma } from '../database';
import { hasTimezone, getSetting } from '../utils/settings';
import { parseDate, convertToUtc } from '../utils/timezone';
import { ephemeralReply } from '../utils/reply';

export const randomiserCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('randomiser')
    .setDescription('Create a randomiser for this channel')
    .addStringOption((opt) =>
      opt
        .setName('options')
        .setDescription('Options separated by || (e.g. "Option A||Option B||Option C")')
        .setRequired(true),
    )
    .addBooleanOption((opt) =>
      opt
        .setName('repick')
        .setDescription('Allow the same option to be picked again (default: false)'),
    )
    .addIntegerOption((opt) =>
      opt.setName('frequency').setDescription('How often to post in days (default: 1)'),
    )
    .addIntegerOption((opt) =>
      opt.setName('repeat').setDescription('How many times to repeat (default: 1)'),
    )
    .addStringOption((opt) =>
      opt.setName('post_at').setDescription('First post time (YYYYMMDD HH:MM, default: now)'),
    )
    .addStringOption((opt) =>
      opt
        .setName('message')
        .setDescription('Message template, use {{ result }} for the pick (default: {{ result }})'),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    const guildId = interaction.guildId!;

    try {
      await hasTimezone(guildId);

      const options = interaction.options.getString('options', true);
      const repick = interaction.options.getBoolean('repick') ?? false;
      const frequency = interaction.options.getInteger('frequency') ?? 1;
      const repeat = interaction.options.getInteger('repeat') ?? 1;
      const message = interaction.options.getString('message') ?? '{{ result }}';
      const postAtStr = interaction.options.getString('post_at');

      let postAt = new Date();
      if (postAtStr) {
        const parsed = parseDate(postAtStr);
        if (!parsed) {
          await ephemeralReply(interaction, 'Invalid date format. Use YYYYMMDD HH:MM.');
          return;
        }
        const timezone = await getSetting(guildId, 'timezone');
        postAt = convertToUtc(parsed, timezone!);
      }

      await prisma.randomiser.create({
        data: {
          guildId: BigInt(guildId),
          channelId: BigInt(interaction.channelId),
          options,
          repick,
          frequency,
          repeat,
          postAt,
          message,
        },
      });

      await ephemeralReply(interaction, 'Randomiser created successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      console.log('Randomiser create:', message);
      await ephemeralReply(interaction, message);
    }
  },
};
