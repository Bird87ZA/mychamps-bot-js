import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attendanceCommand } from '../../src/commands/attendance';
import { createMockInteraction, createMockClient } from '../mocks/discord';

vi.mock('../../src/handlers/attendance/create', () => ({
  handleCreate: vi.fn(),
}));
vi.mock('../../src/handlers/attendance/remove', () => ({
  handleRemove: vi.fn(),
}));

import { handleCreate } from '../../src/handlers/attendance/create';
import { handleRemove } from '../../src/handlers/attendance/remove';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('attendanceCommand', () => {
  it('has correct command name', () => {
    expect(attendanceCommand.data.name).toBe('attendance');
  });

  it('dispatches to handleCreate for create subcommand', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('create');
    const client = createMockClient();

    await attendanceCommand.execute(interaction as never, client as never);

    expect(handleCreate).toHaveBeenCalledWith(interaction);
  });

  it('dispatches to handleRemove for remove subcommand', async () => {
    const interaction = createMockInteraction();
    interaction.options.getSubcommand.mockReturnValue('remove');
    const client = createMockClient();

    await attendanceCommand.execute(interaction as never, client as never);

    expect(handleRemove).toHaveBeenCalledWith(interaction);
  });
});
