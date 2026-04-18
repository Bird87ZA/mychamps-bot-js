import { describe, it, expect, vi } from 'vitest';
import { ephemeralReply } from '../../src/utils/reply';
import { MessageFlags } from 'discord.js';

describe('ephemeralReply', () => {
  it('replies with ephemeral content', async () => {
    const interaction = {
      reply: vi.fn(),
    };

    await ephemeralReply(interaction as never, 'Hello!');

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Hello!',
      flags: MessageFlags.Ephemeral,
    });
  });
});
