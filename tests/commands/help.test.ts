import { describe, it, expect, vi } from 'vitest';
import { helpCommand, helpSections } from '../../src/commands/help';
import { createMockInteraction, createMockClient } from '../mocks/discord';

describe('helpCommand', () => {
  it('has correct command name', () => {
    expect(helpCommand.data.name).toBe('help');
  });

  it('replies with general help embed and buttons', async () => {
    const interaction = createMockInteraction();
    const client = createMockClient();

    await helpCommand.execute(interaction as never, client as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'MyChamps Bot Help',
            }),
          }),
        ]),
        components: expect.any(Array),
      }),
    );

    const reply = vi.mocked(interaction.reply).mock.calls[0][0];
    expect(reply.components).toHaveLength(2);
  });

  it('exports helpSections with all expected sections', () => {
    expect(helpSections).toHaveProperty('general');
    expect(helpSections).toHaveProperty('schedule');
    expect(helpSections).toHaveProperty('attendance');
    expect(helpSections).toHaveProperty('settings');
    expect(helpSections).toHaveProperty('link');
    expect(helpSections).toHaveProperty('stats');
    expect(helpSections).toHaveProperty('incidents');
    expect(helpSections).toHaveProperty('randomiser');
  });

  it('each section has title and content', () => {
    for (const section of Object.values(helpSections)) {
      expect(section).toHaveProperty('title');
      expect(section).toHaveProperty('content');
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.content.length).toBeGreaterThan(0);
    }
  });

  it('documents MyChamps and Discord account linking steps', () => {
    expect(helpSections.link.content).toContain('**On MyChamps:**');
    expect(helpSections.link.content).toContain('**Gamer Profiles**');
    expect(helpSections.link.content).toContain('Click **Discord**');
    expect(helpSections.link.content).toContain('/link email email:you@example.com');
    expect(helpSections.link.content).toContain('/link verify code:123456');
    expect(helpSections.link.content).toContain('/link status');
  });

  it('documents stats setup and output', () => {
    expect(helpSections.stats.content).toContain('/settings stats');
    expect(helpSections.stats.content).toContain('Gamer Profiles');
    expect(helpSections.stats.content).toContain('entries, wins, podiums, poles, DNFs');
    expect(helpSections.stats.content).toContain('/link status');
  });

  it('documents incident setup and review flow', () => {
    expect(helpSections.incidents.content).toContain('/incident setup');
    expect(helpSections.incidents.content).toContain('/settings incident-category');
    expect(helpSections.incidents.content).toContain('/settings steward-role');
    expect(helpSections.incidents.content).toContain('/incident close');
    expect(helpSections.incidents.content).toContain('Penalty, Warning, or No Further Action');
  });
});
