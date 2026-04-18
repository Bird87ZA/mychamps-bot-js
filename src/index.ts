import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { BotCommand, ServiceInterval } from './types';
import { prisma } from './database';

// Commands
import { scheduleCommand } from './commands/schedule';
import { attendanceCommand } from './commands/attendance';
import { settingsCommand } from './commands/settings';
import { randomiserCommand } from './commands/randomiser';
import { helpCommand } from './commands/help';
import { incidentCommand } from './commands/incident';

// Events
import { handleAttendanceInteraction } from './events/attendanceInteraction';
import { handleIncidentButtonInteraction } from './events/incidentButtonInteraction';
import { handleDefenceMessage, handleDefenceDoneInteraction } from './events/defenceInteraction';

// Services
import { scheduleCheckerService } from './services/scheduleChecker';
import { botCloserService } from './services/botCloser';
import { remindAttendeesService } from './services/remindAttendees';
import { randomiserService } from './services/randomiser';
import { incidentReminderService } from './services/incidentReminder';

// Dashboard
import { startDashboard } from './dashboard/server';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Register commands
const commands = new Collection<string, BotCommand>();
const commandList: BotCommand[] = [
  scheduleCommand,
  attendanceCommand,
  settingsCommand,
  randomiserCommand,
  helpCommand,
  incidentCommand,
];
for (const command of commandList) {
  commands.set(command.data.name, command);
}

// Handle slash commands and interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      const content = 'An error occurred.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('incident_report!')) {
      await handleIncidentButtonInteraction(interaction, client);
    } else if (
      interaction.customId.startsWith('defence_done_yes!') ||
      interaction.customId.startsWith('defence_done_no!')
    ) {
      await handleDefenceDoneInteraction(interaction, client);
    } else {
      await handleAttendanceInteraction(interaction, client);
    }
  }
});

// Handle messages for defence flow
client.on(Events.MessageCreate, async (message) => {
  await handleDefenceMessage(message, client).catch((err) => {
    console.error('[DefenceMessage] Error:', err);
  });
});

// Start background services
function startServices() {
  const services: ServiceInterval[] = [
    scheduleCheckerService,
    botCloserService,
    remindAttendeesService,
    randomiserService,
    incidentReminderService,
  ];

  for (const service of services) {
    console.log(`Starting service: ${service.name} (every ${service.interval}s)`);
    setInterval(() => {
      service.execute(client).catch((err) => {
        console.error(`[${service.name}] Error:`, err);
      });
    }, service.interval * 1000);
  }
}

// Start dashboard immediately — it only needs the database, not Discord
startDashboard(parseInt(process.env.DASHBOARD_PORT ?? '2000'));

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  startServices();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('Discord login failed:', err.message);
  console.log('Dashboard is still running — bot features are unavailable.');
});
