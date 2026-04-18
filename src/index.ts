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
import { linkCommand } from './commands/link';

// Events
import { handleAttendanceInteraction } from './events/attendanceInteraction';

// Services
import { scheduleCheckerService } from './services/scheduleChecker';
import { botCloserService } from './services/botCloser';
import { remindAttendeesService } from './services/remindAttendees';
import { randomiserService } from './services/randomiser';

// Dashboard
import { startDashboard } from './dashboard/server';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
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
  linkCommand,
];
for (const command of commandList) {
  commands.set(command.data.name, command);
}

// Handle slash commands
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

  // Handle button interactions (attendance)
  if (interaction.isButton()) {
    await handleAttendanceInteraction(interaction, client);
  }
});

// Start background services
function startServices() {
  const services: ServiceInterval[] = [
    scheduleCheckerService,
    botCloserService,
    remindAttendeesService,
    randomiserService,
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
