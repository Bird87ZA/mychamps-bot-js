import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../types';
import { MyChampsApiClient } from '../services/myChampsApiClient';
import { ephemeralReply } from '../utils/reply';

export const linkCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to MyChamps')
    .addSubcommand((sub) =>
      sub
        .setName('email')
        .setDescription('Initiate account linking by email')
        .addStringOption((opt) =>
          opt
            .setName('email')
            .setDescription('Your MyChamps account email address')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('verify')
        .setDescription('Complete linking with the verification code')
        .addStringOption((opt) =>
          opt
            .setName('code')
            .setDescription('6-digit verification code sent to your email')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Check your MyChamps account link status'),
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client) {
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'email': {
        const email = interaction.options.getString('email', true);
        try {
          const apiClient = await MyChampsApiClient.fromGuild(guildId);
          await apiClient.requestLink(email, interaction.user.id);
          await ephemeralReply(
            interaction,
            `Verification code sent to ${email}. Use \`/link verify <code>\` to complete.`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : 'An error occurred';
          await ephemeralReply(interaction, message);
        }
        break;
      }

      case 'verify': {
        const code = interaction.options.getString('code', true);
        try {
          const apiClient = await MyChampsApiClient.fromGuild(guildId);
          await apiClient.confirmLink(interaction.user.id, code);
          await ephemeralReply(interaction, 'Your Discord account has been linked to MyChamps!');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'An error occurred';
          await ephemeralReply(interaction, message);
        }
        break;
      }

      case 'status': {
        try {
          const apiClient = await MyChampsApiClient.fromGuild(guildId);
          const championships = await apiClient.getChampionships(interaction.user.id);
          if (championships.length === 0) {
            await ephemeralReply(
              interaction,
              'You are linked but have no championships. Visit MyChamps to join one.',
            );
          } else {
            const list = championships
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((c: any, i: number) => `${i + 1}. ${c.name ?? c.slug ?? c.id}`)
              .join('\n');
            await ephemeralReply(interaction, `Your championships:\n${list}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'An error occurred';
          if (message.includes('404')) {
            await ephemeralReply(
              interaction,
              'Your account is not linked. Use `/link email` to start.',
            );
          } else {
            await ephemeralReply(interaction, message);
          }
        }
        break;
      }
    }
  },
};
