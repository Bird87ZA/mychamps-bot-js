import { ButtonInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

/**
 * Reply to an interaction with an ephemeral message.
 */
export async function ephemeralReply(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  content: string,
): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
