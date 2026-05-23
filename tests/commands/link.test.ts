import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linkCommand } from '../../src/commands/link';
import { createMockInteraction, createMockClient } from '../mocks/discord';

vi.mock('../../src/services/myChampsApiClient', () => ({
  MyChampsApiClient: {
    fromGuild: vi.fn(),
  },
}));

import { MyChampsApiClient } from '../../src/services/myChampsApiClient';

const mockApiClient = {
  requestLink: vi.fn(),
  confirmLink: vi.fn(),
  getChampionships: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(MyChampsApiClient.fromGuild).mockResolvedValue(mockApiClient as never);
});

function createLinkInteraction(overrides: Record<string, unknown> = {}) {
  return createMockInteraction({
    user: { id: 'discord-user-42', username: 'testuser' },
    ...overrides,
  });
}

describe('linkCommand', () => {
  it('has correct command name', () => {
    expect(linkCommand.data.name).toBe('link');
  });

  // ── email subcommand ────────────────────────────────────────────────────────

  describe('/link email', () => {
    it('calls requestLink and replies with confirmation', async () => {
      mockApiClient.requestLink.mockResolvedValue({ message: 'ok' });

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('email');
      interaction.options.getString.mockImplementation((name: string) => {
        if (name === 'email') return 'racer@example.com';
        return null;
      });
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(MyChampsApiClient.fromGuild).toHaveBeenCalledWith('123456789');
      expect(mockApiClient.requestLink).toHaveBeenCalledWith(
        'racer@example.com',
        'discord-user-42',
      );
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content:
            'Verification code sent to racer@example.com. Use `/link verify <code>` to complete.',
        }),
      );
    });

    it('replies with error message when requestLink fails', async () => {
      mockApiClient.requestLink.mockRejectedValue(new Error('Email not found'));

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('email');
      interaction.options.getString.mockImplementation((name: string) => {
        if (name === 'email') return 'unknown@example.com';
        return null;
      });
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Email not found' }),
      );
    });

    it('replies with error when fromGuild fails for email subcommand', async () => {
      vi.mocked(MyChampsApiClient.fromGuild).mockRejectedValue(
        new Error('mychamps-api-token is not configured for this guild.'),
      );

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('email');
      interaction.options.getString.mockReturnValue('test@example.com');
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'mychamps-api-token is not configured for this guild.',
        }),
      );
    });
  });

  // ── verify subcommand ───────────────────────────────────────────────────────

  describe('/link verify', () => {
    it('calls confirmLink and replies with success', async () => {
      mockApiClient.confirmLink.mockResolvedValue({ message: 'linked' });

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('verify');
      interaction.options.getString.mockImplementation((name: string) => {
        if (name === 'code') return '123456';
        return null;
      });
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(MyChampsApiClient.fromGuild).toHaveBeenCalledWith('123456789');
      expect(mockApiClient.confirmLink).toHaveBeenCalledWith('discord-user-42', '123456');
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Your Discord account has been linked to MyChamps!',
        }),
      );
    });

    it('replies with error message when confirmLink fails', async () => {
      mockApiClient.confirmLink.mockRejectedValue(new Error('Invalid or expired code'));

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('verify');
      interaction.options.getString.mockImplementation((name: string) => {
        if (name === 'code') return '000000';
        return null;
      });
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Invalid or expired code' }),
      );
    });

    it('replies with error when fromGuild fails for verify subcommand', async () => {
      vi.mocked(MyChampsApiClient.fromGuild).mockRejectedValue(
        new Error('mychamps-api-token is not configured for this guild.'),
      );

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('verify');
      interaction.options.getString.mockReturnValue('654321');
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'mychamps-api-token is not configured for this guild.',
        }),
      );
    });
  });

  // ── status subcommand ───────────────────────────────────────────────────────

  describe('/link status', () => {
    it('lists championships when account is linked and has championships', async () => {
      mockApiClient.getChampionships.mockResolvedValue([
        { name: 'Formula Open 2024', slug: 'fo-2024', id: 1 },
        { name: 'GT3 Challenge', slug: 'gt3', id: 2 },
      ]);

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('status');
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(MyChampsApiClient.fromGuild).toHaveBeenCalledWith('123456789');
      expect(mockApiClient.getChampionships).toHaveBeenCalledWith('discord-user-42');
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Formula Open 2024'),
        }),
      );
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('GT3 Challenge'),
        }),
      );
    });

    it('replies with empty-championships message when linked but no championships', async () => {
      mockApiClient.getChampionships.mockResolvedValue([]);

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('status');
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('no championships'),
        }),
      );
    });

    it('replies with unlinked message on 404 error', async () => {
      mockApiClient.getChampionships.mockRejectedValue(
        new Error('MyChamps API error 404 Not Found: '),
      );

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('status');
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Your account is not linked. Use `/link email` to start.',
        }),
      );
    });

    it('replies with generic error on non-404 API failure', async () => {
      mockApiClient.getChampionships.mockRejectedValue(new Error('Network timeout'));

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('status');
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Network timeout' }),
      );
    });

    it('replies with error when fromGuild fails for status subcommand', async () => {
      vi.mocked(MyChampsApiClient.fromGuild).mockRejectedValue(
        new Error('mychamps-api-token is not configured for this guild.'),
      );

      const interaction = createLinkInteraction();
      interaction.options.getSubcommand.mockReturnValue('status');
      const client = createMockClient();

      await linkCommand.execute(interaction as never, client as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'mychamps-api-token is not configured for this guild.',
        }),
      );
    });
  });
});
