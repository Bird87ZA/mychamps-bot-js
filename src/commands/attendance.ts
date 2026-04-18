import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../types';
import { handleCreate } from '../handlers/attendance/create';
import { handleRemove } from '../handlers/attendance/remove';

function buildAttendanceCommand(): SlashCommandBuilder {
  const builder = new SlashCommandBuilder()
    .setName('attendance')
    .setDescription('Manage attendance configuration for this channel');

  const createSub = builder.addSubcommand((sub) => {
    sub
      .setName('create')
      .setDescription('Create attendance configuration')
      .addRoleOption((opt) =>
        opt.setName('full-time').setDescription('Full-time participant role').setRequired(true),
      )
      .addRoleOption((opt) => opt.setName('reserve').setDescription('Reserve role'))
      .addRoleOption((opt) => opt.setName('commentator').setDescription('Commentator role'));

    // Add team-1 through team-20
    for (let i = 1; i <= 20; i++) {
      sub.addRoleOption((opt) => opt.setName(`team-${i}`).setDescription(`Team ${i} role`));
    }

    return sub;
  });

  createSub.addSubcommand((sub) =>
    sub.setName('remove').setDescription('Remove attendance configuration from this channel'),
  );

  return builder;
}

export const attendanceCommand: BotCommand = {
  data: buildAttendanceCommand(),

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create':
        await handleCreate(interaction);
        break;
      case 'remove':
        await handleRemove(interaction);
        break;
    }
  },
};
