import { ChatInputCommandInteraction, Client, SharedSlashCommand } from 'discord.js';

export interface BotCommand {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: SharedSlashCommand & { toJSON(): any };
  execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void>;
}

export interface Attendees {
  [role: string]: {
    [memberId: string]: string;
  };
}

export interface ServiceInterval {
  name: string;
  interval: number;
  execute(client: Client): Promise<void>;
}
