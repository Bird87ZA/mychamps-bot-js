import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { BotCommand } from '../types';

const helpSections: Record<string, { title: string; content: string }> = {
  general: {
    title: 'MyChamps Bot Help',
    content: [
      '**MyChamps Bot** helps you manage team attendance, event scheduling, reminders, and randomisation.',
      '',
      '**Commands:**',
      '`/schedule` - Schedule events linked to a channel',
      '`/attendance` - Configure attendance tracking',
      '`/settings` - Manage server settings (timezone, post-time, reminders)',
      '`/randomiser` - Create random selection tools',
      '`/help` - Show this help message',
      '',
      'Use the buttons below to learn more about each command.',
    ].join('\n'),
  },
  schedule: {
    title: 'Schedule Command',
    content: [
      '`/schedule add` - Schedule a new event',
      '  - `name` (required): Name of the event',
      '  - `date` (required): Date in YYYYMMDD HH:MM format',
      '  - `closing-date`: When attendance closes (YYYYMMDD HH:MM)',
      '  - `image`: Image URL for the event',
      '',
      '`/schedule remove` - Remove a scheduled event',
      '  - `id` (required): ID of the event',
      '',
      '`/schedule list` - List all events for this channel',
    ].join('\n'),
  },
  attendance: {
    title: 'Attendance Command',
    content: [
      '`/attendance create` - Set up attendance tracking',
      '  - `full-time` (required): Role for full-time participants',
      '  - `reserve`: Role for reserves',
      '  - `commentator`: Role for commentators',
      '  - `team-1` to `team-20`: Team roles',
      '',
      '`/attendance remove` - Remove attendance configuration',
    ].join('\n'),
  },
  settings: {
    title: 'Settings Command',
    content: [
      '`/settings` - Configure server settings',
      '  - `timezone`: IANA timezone (e.g. Africa/Johannesburg)',
      '  - `post-time`: Days before event to post attendance bot',
      '  - `remind-attendees`: Reminder frequency in hours (0 to disable)',
    ].join('\n'),
  },
  randomiser: {
    title: 'Randomiser Command',
    content: [
      '`/randomiser` - Create a randomiser',
      '  - `options` (required): Options separated by `||`',
      '  - `repick`: Allow same option again (default: false)',
      '  - `frequency`: Days between posts (default: 1)',
      '  - `repeat`: How many times to run (default: 1)',
      '  - `post_at`: First post time (YYYYMMDD HH:MM)',
      '  - `message`: Template using `{{ result }}` placeholder',
    ].join('\n'),
  },
};

export const helpCommand: BotCommand = {
  data: new SlashCommandBuilder().setName('help').setDescription('Show help information'),

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    const section = helpSections['general'];
    const embed = new EmbedBuilder()
      .setTitle(section.title)
      .setDescription(section.content)
      .setColor(0x5865f2);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('help!schedule')
        .setLabel('Schedule')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('help!attendance')
        .setLabel('Attendance')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('help!settings')
        .setLabel('Settings')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('help!randomiser')
        .setLabel('Randomiser')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
};

// Export for use by the button handler in index.ts
export { helpSections };
