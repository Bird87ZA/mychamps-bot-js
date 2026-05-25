import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { prisma } from '../database';
import {
  formatRoleMentions,
  getTicketAccessRoleIds,
  parseSettingIds,
} from '../utils/incidentSettings';

interface DefenceFile {
  name: string;
  url: string;
}

const DEFENCE_MODAL_PREFIX = 'incident_defence_modal';
const DEFENCE_FIELD_IDS = {
  answer: 'defence_answer',
  url: 'defence_url',
  additionalUrlOne: 'defence_additional_url_1',
  additionalUrlTwo: 'defence_additional_url_2',
  file: 'defence_file',
} as const;

/**
 * Called when a new message is created in a guild channel.
 * Checks if the channel is an active incident channel and if the author
 * is a defendant, then shows "Are you done?" Yes/No buttons.
 */
export async function handleDefenceMessage(message: Message, _client: Client): Promise<void> {
  if (message.author.bot) return;

  const guildId = message.guildId;
  const channelId = message.channelId;

  if (!guildId) return;

  const incident = await prisma.incident.findFirst({
    where: {
      guildId,
      channelId,
      status: 'open',
    },
  });

  if (!incident) return;

  const defendants = (incident.defendants as string[]) ?? [];
  const defenceSubmitted = (incident.defenceSubmitted as string[]) ?? [];
  const authorId = message.author.id;

  // Only show prompt to defendants who haven't yet submitted
  if (!defendants.includes(authorId)) return;
  if (defenceSubmitted.includes(authorId)) return;

  const yesButton = new ButtonBuilder()
    .setCustomId(`defence_done_yes!${incident.id}`)
    .setLabel('Yes, I am done')
    .setStyle(ButtonStyle.Success);

  const noButton = new ButtonBuilder()
    .setCustomId(`defence_done_no!${incident.id}`)
    .setLabel('No, continue')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(yesButton, noButton);

  await message.reply({
    content: 'Have you finished submitting your defence?',
    components: [row],
  });
}

function buildDefenceModal(incidentId: number): ModalBuilder {
  const answerInput = new TextInputBuilder()
    .setCustomId(DEFENCE_FIELD_IDS.answer)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);

  const urlInput = new TextInputBuilder()
    .setCustomId(DEFENCE_FIELD_IDS.url)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder('https://...');

  const additionalUrlOneInput = new TextInputBuilder()
    .setCustomId(DEFENCE_FIELD_IDS.additionalUrlOne)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder('https://...');

  const additionalUrlTwoInput = new TextInputBuilder()
    .setCustomId(DEFENCE_FIELD_IDS.additionalUrlTwo)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500)
    .setPlaceholder('https://...');

  const fileInput = new FileUploadBuilder()
    .setCustomId(DEFENCE_FIELD_IDS.file)
    .setRequired(false)
    .setMinValues(0)
    .setMaxValues(1);

  return new ModalBuilder()
    .setCustomId(`${DEFENCE_MODAL_PREFIX}!${incidentId}`)
    .setTitle('Submit Defence')
    .addLabelComponents(
      new LabelBuilder().setLabel('Answer').setTextInputComponent(answerInput),
      new LabelBuilder().setLabel('Link').setTextInputComponent(urlInput),
      new LabelBuilder().setLabel('Additional View').setTextInputComponent(additionalUrlOneInput),
      new LabelBuilder().setLabel('Additional View').setTextInputComponent(additionalUrlTwoInput),
      new LabelBuilder()
        .setLabel('File')
        .setDescription('Optional screenshot, clip, or supporting file')
        .setFileUploadComponent(fileInput),
    );
}

function getOptionalTextInput(modalSubmit: ModalSubmitInteraction, customId: string): string {
  try {
    return modalSubmit.fields.getTextInputValue(customId).trim();
  } catch {
    return '';
  }
}

function getDefenceFiles(modalSubmit: ModalSubmitInteraction): DefenceFile[] {
  try {
    return Array.from(modalSubmit.fields.getUploadedFiles(DEFENCE_FIELD_IDS.file)?.values() ?? [])
      .map((file) => ({ name: file.name, url: file.url }))
      .filter((file) => file.name && file.url);
  } catch {
    return [];
  }
}

function formatDefenceFiles(files: DefenceFile[]): string | null {
  if (files.length === 0) {
    return null;
  }

  const value = files.map((file) => `[${file.name}](${file.url})`).join('\n');

  return value.length > 1024 ? value.slice(0, 1021) + '...' : value;
}

function parseStoredRoleIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((roleId): roleId is string => typeof roleId === 'string')
      .map((roleId) => roleId.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return parseSettingIds(value);
  }

  return [];
}

/**
 * Handle the Yes/No defence done buttons.
 */
export async function handleDefenceDoneInteraction(
  interaction: ButtonInteraction,
  _client: Client,
): Promise<void> {
  const { customId } = interaction;

  const isYes = customId.startsWith('defence_done_yes!');
  const isNo = customId.startsWith('defence_done_no!');

  if (!isYes && !isNo) return;

  if (isNo) {
    await interaction.reply({
      content: 'Understood. You can continue posting your defence in this channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const parts = customId.split('!');
  const incidentId = parseInt(parts[1], 10);

  if (isNaN(incidentId)) return;

  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;

  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, guildId, channelId, status: { not: 'closed' } },
  });

  if (!incident) {
    await interaction.reply({
      content: 'Could not find an active incident for this channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const defendants = (incident.defendants as string[]) ?? [];
  const defenceSubmitted = (incident.defenceSubmitted as string[]) ?? [];
  const userId = interaction.user.id;

  if (!defendants.includes(userId)) {
    await interaction.reply({
      content: 'Only selected drivers can submit a defence for this incident.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (defenceSubmitted.includes(userId)) {
    await interaction.reply({
      content: 'You have already submitted your defence.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.showModal(buildDefenceModal(incident.id));

  let modalSubmit: ModalSubmitInteraction;
  try {
    modalSubmit = await interaction.awaitModalSubmit({
      filter: (i) =>
        i.customId === `${DEFENCE_MODAL_PREFIX}!${incident.id}` &&
        i.user.id === interaction.user.id,
      time: 300_000,
    });
  } catch {
    return;
  }

  await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.channel as TextChannel | null;
  if (!channel || !('send' in channel)) {
    await modalSubmit.editReply({
      content: 'Could not post your defence because this channel is unavailable.',
    });
    return;
  }

  const answer =
    modalSubmit.fields.getTextInputValue(DEFENCE_FIELD_IDS.answer).trim() || 'No answer provided.';
  const url = getOptionalTextInput(modalSubmit, DEFENCE_FIELD_IDS.url);
  const additionalUrlOne = getOptionalTextInput(modalSubmit, DEFENCE_FIELD_IDS.additionalUrlOne);
  const additionalUrlTwo = getOptionalTextInput(modalSubmit, DEFENCE_FIELD_IDS.additionalUrlTwo);
  const files = getDefenceFiles(modalSubmit);
  const fileValue = formatDefenceFiles(files);

  const embed = new EmbedBuilder()
    .setTitle('Driver Defence')
    .addFields(
      { name: 'Submitted By', value: `<@${userId}>`, inline: true },
      { name: 'Answer', value: answer },
      ...(url ? [{ name: 'Link', value: url }] : []),
      ...(additionalUrlOne ? [{ name: 'Additional View', value: additionalUrlOne }] : []),
      ...(additionalUrlTwo ? [{ name: 'Additional View', value: additionalUrlTwo }] : []),
      ...(fileValue ? [{ name: 'File', value: fileValue }] : []),
    )
    .setColor(0x95a5a6)
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  const updatedDefence = [...defenceSubmitted, userId];
  const allDone = defendants.length > 0 && updatedDefence.length >= defendants.length;

  if (channel && 'permissionOverwrites' in channel) {
    try {
      await channel.permissionOverwrites.edit(userId, {
        ViewChannel: false,
        SendMessages: false,
      });
    } catch (err) {
      console.error('[Defence] Failed to remove defendant permissions:', err);
    }
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: {
      defenceSubmitted: updatedDefence,
      status: allDone ? 'awaiting_review' : 'open',
    },
  });

  const savedStewardRoleIds = parseStoredRoleIds(incident.stewardRoleIds);
  const stewardRoleIds =
    savedStewardRoleIds.length > 0 ? savedStewardRoleIds : await getTicketAccessRoleIds(guildId);
  const mention = formatRoleMentions(stewardRoleIds, 'Stewards');
  const reviewMessage = allDone
    ? `${mention} All defendants have submitted their defence. This incident is now awaiting your review.`
    : `${mention} A defence has been submitted. The driver has been removed from this channel.`;

  await channel.send(reviewMessage);

  await modalSubmit.editReply({
    content: 'Your defence has been submitted. You have been removed from the incident channel.',
  });
}
