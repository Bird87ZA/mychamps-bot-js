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
  });

  it('exports helpSections with all expected sections', () => {
    expect(helpSections).toHaveProperty('general');
    expect(helpSections).toHaveProperty('schedule');
    expect(helpSections).toHaveProperty('attendance');
    expect(helpSections).toHaveProperty('settings');
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
});
