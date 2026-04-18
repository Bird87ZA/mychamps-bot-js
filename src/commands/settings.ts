import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../types';
import { setSetting } from '../utils/settings';
import { isValidTimezone } from '../utils/timezone';
import { rebuildReminders } from '../utils/reminders';
import { ephemeralReply } from '../utils/reply';

export const settingsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Create and manage settings for your server')
    .addStringOption((opt) =>
      opt
        .setName('timezone')
        .setDescription('Set the timezone (IANA identifier, e.g. Africa/Johannesburg)'),
    )
    .addStringOption((opt) =>
      opt
        .setName('post-time')
        .setDescription('Days before the event the attendance bot should post'),
    )
    .addIntegerOption((opt) =>
      opt.setName('remind-attendees').setDescription('Reminder frequency in hours (0 to disable)'),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    const guildId = interaction.guildId!;

    try {
      const timezone = interaction.options.getString('timezone');
      if (timezone) {
        if (!isValidTimezone(timezone)) {
          await ephemeralReply(interaction, `Invalid timezone: ${timezone}`);
          return;
        }
        await setSetting(guildId, 'timezone', timezone);
      }

      const postTime = interaction.options.getString('post-time');
      if (postTime) {
        const parsed = parseInt(postTime, 10);
        if (isNaN(parsed)) {
          await ephemeralReply(interaction, `Invalid post-time: ${postTime}. Must be a number.`);
          return;
        }
        await setSetting(guildId, 'post-time', parsed.toString());
      }

      const remindAttendees = interaction.options.getInteger('remind-attendees');
      if (remindAttendees !== null) {
        await setSetting(guildId, 'remind-attendees', remindAttendees.toString());
        await rebuildReminders(guildId);
      }

      await ephemeralReply(interaction, 'Settings updated successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      console.log('Settings update:', message);
      await ephemeralReply(interaction, message);
    }
  },
};
