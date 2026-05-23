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
      '`/link` - Link your Discord account to MyChamps',
      '`/stats` - Show your MyChamps stats for configured leagues',
      '`/incident` - Set up and manage incident reports',
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
      '`/settings` - Open the server settings modal',
      '`timezone` - Set the IANA timezone (e.g. Africa/Johannesburg)',
      '`post-time` - Set days before event to post attendance bot',
      '`remind-attendees` - Set reminder frequency in hours (0 to disable)',
      '`incidents-category` - Select the category for incident channels',
      '`ticket-access-roles` - Select roles that can access incident tickets',
      '`incident-reminder-interval` - Set incident reminder frequency',
      '`mychamps-api-token` - Set the MyChamps API token',
      '`/settings section: stats` - Choose the leagues returned by `/stats`',
    ].join('\n'),
  },
  link: {
    title: 'Link MyChamps Account',
    content: [
      '**On MyChamps:**',
      '1. Log in at https://mychamps.gg with the account that owns or races in your championships.',
      '2. Open your profile page and find the **Gamer Profiles** section.',
      '3. Click **Discord** and approve the Discord connection.',
      '4. Back on MyChamps, check that Discord appears under **Connected Accounts** as **Verified**.',
      '5. If MyChamps shows matching drivers, click **Link** next to your driver so your stats can be matched.',
      '',
      '**In Discord:**',
      '1. Run `/link email email:you@example.com` using the same email as your MyChamps account.',
      '2. Check that inbox for the verification code from MyChamps.',
      '3. Run `/link verify code:123456` with the code from the email.',
      '4. Run `/link status` to confirm the bot can see your championships.',
      '',
      'After this, `/stats` and `/incident setup` can use your linked MyChamps account.',
    ].join('\n'),
  },
  stats: {
    title: 'Stats Command',
    content: [
      '`/stats` shows your MyChamps driver stats for the leagues configured on this Discord server.',
      '',
      '**Before users run `/stats`:**',
      '1. An admin must set `mychamps-api-token` with `/settings`.',
      '2. An admin must run `/settings section: stats` and choose the MyChamps leagues to include.',
      '3. Each user must link Discord on MyChamps and link their matching driver in **Gamer Profiles**.',
      '',
      '**What users see:**',
      '- Stats are grouped by configured league, with a combined total at the bottom.',
      '- The bot shows entries, wins, podiums, poles, DNFs, and fastest laps.',
      '- If no stats appear, check `/link status` and confirm the MyChamps profile is linked to a driver.',
    ].join('\n'),
  },
  incidents: {
    title: 'Incidents',
    content: [
      'Incidents let drivers submit reports from Discord and give stewards a private review channel.',
      '',
      '**Setup:**',
      '1. Set `mychamps-api-token` with `/settings`.',
      '2. Optional: set `incidents-category`, `ticket-access-roles`, and `incident-reminder-interval` in `/settings`.',
      '3. A server admin or Manage Guild user runs `/incident setup`.',
      '4. Select the MyChamps championship, then choose the report button label and color.',
      '',
      '**Reporting and review:**',
      '- Drivers click the posted report button and choose involved Discord users, a description, and optional evidence URL or files.',
      '- The bot creates a private incident channel for the reporter, bot, selected drivers, and ticket access roles if configured.',
      '- Ticket access roles review the channel and run `/incident close` in that incident channel.',
      '- Closing supports Penalty, Warning, or No Further Action, with a verdict description and optional penalty value.',
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
        .setCustomId('help!link')
        .setLabel('Link MyChamps')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('help!randomiser')
        .setLabel('Randomiser')
        .setStyle(ButtonStyle.Primary),
    );

    const moreRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('help!stats').setLabel('Stats').setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('help!incidents')
        .setLabel('Incidents')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({
      embeds: [embed],
      components: [row, moreRow],
      flags: MessageFlags.Ephemeral,
    });
  },
};

// Export for use by the button handler in index.ts
export { helpSections };
