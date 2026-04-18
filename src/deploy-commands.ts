import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { scheduleCommand } from './commands/schedule';
import { attendanceCommand } from './commands/attendance';
import { settingsCommand } from './commands/settings';
import { randomiserCommand } from './commands/randomiser';
import { helpCommand } from './commands/help';
import { linkCommand } from './commands/link';

const commands = [
  scheduleCommand.data.toJSON(),
  attendanceCommand.data.toJSON(),
  settingsCommand.data.toJSON(),
  randomiserCommand.data.toJSON(),
  helpCommand.data.toJSON(),
  linkCommand.data.toJSON(),
];

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash commands...`);

    await rest.put(Routes.applicationCommands(clientId), { body: commands });

    console.log('Commands registered successfully.');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
})();
