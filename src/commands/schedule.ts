import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../types';
import { handleAdd } from '../handlers/schedule/add';
import { handleRemove } from '../handlers/schedule/remove';
import { handleList } from '../handlers/schedule/list';

export const scheduleCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule an event linked to this channel')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Schedule an event linked to this channel')
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Name of the event').setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('date')
            .setDescription('Date of the event (YYYYMMDD HH:MM)')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('closing-date')
            .setDescription('Date the attendance bot should close (YYYYMMDD HH:MM)'),
        )
        .addStringOption((opt) => opt.setName('image').setDescription('Image for event')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a scheduled event from this channel')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID of the event to remove').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List scheduled events for this channel'),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'add':
        await handleAdd(interaction);
        break;
      case 'remove':
        await handleRemove(interaction);
        break;
      case 'list':
        await handleList(interaction);
        break;
    }
  },
};
