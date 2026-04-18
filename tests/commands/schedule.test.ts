import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scheduleCommand } from '../../src/commands/schedule';
import { createMockInteraction, createMockClient } from '../mocks/discord';

vi.mock('../../src/handlers/schedule/add', () => ({
  handleAdd: vi.fn(),
}));
vi.mock('../../src/handlers/schedule/remove', () => ({
  handleRemove: vi.fn(),
}));
vi.mock('../../src/handlers/schedule/list', () => ({
  handleList: vi.fn(),
}));

import { handleAdd } from '../../src/handlers/schedule/add';
import { handleRemove } from '../../src/handlers/schedule/remove';
import { handleList } from '../../src/handlers/schedule/list';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scheduleCommand', () => {
  it('has correct command name', () => {
    expect(scheduleCommand.data.name).toBe('schedule');
  });

  it('dispatches to handleAdd for add subcommand', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('add');
    const client = createMockClient();

    await scheduleCommand.execute(interaction as never, client as never);

    expect(handleAdd).toHaveBeenCalledWith(interaction);
  });

  it('dispatches to handleRemove for remove subcommand', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('remove');
    const client = createMockClient();

    await scheduleCommand.execute(interaction as never, client as never);

    expect(handleRemove).toHaveBeenCalledWith(interaction);
  });

  it('dispatches to handleList for list subcommand', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('list');
    const client = createMockClient();

    await scheduleCommand.execute(interaction as never, client as never);

    expect(handleList).toHaveBeenCalledWith(interaction);
  });
});
