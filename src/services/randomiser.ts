import { Client, TextChannel } from 'discord.js';
import { prisma } from '../database';
import { ServiceInterval } from '../types';
import { addDays } from 'date-fns';

export const randomiserService: ServiceInterval = {
  name: 'Randomiser',
  interval: 60,

  async execute(client: Client): Promise<void> {
    const due = await prisma.randomiser.findMany({
      where: {
        postAt: { lte: new Date() },
        repeat: { gt: 0 },
      },
    });

    for (const randomiser of due) {
      try {
        // options is stored as a JSON string value (e.g. "A||B||C")
        const optionsStr = String(randomiser.options);
        const options = optionsStr.split('||').map((o) => o.trim());
        if (options.length === 0) continue;

        // Pick random option
        const selectedIndex = Math.floor(Math.random() * options.length);
        const selectedOption = options[selectedIndex];

        // Remove option if repick is disabled
        let updatedOptions: string = optionsStr;
        if (!randomiser.repick) {
          options.splice(selectedIndex, 1);
          updatedOptions = options.join('||');
        }

        // Decrement repeat
        const newRepeat = randomiser.repeat - 1;

        // Calculate next post time
        const newPostAt =
          newRepeat > 0 ? addDays(randomiser.postAt, randomiser.frequency) : randomiser.postAt;

        // Update database
        await prisma.randomiser.update({
          where: { id: randomiser.id },
          data: {
            options: updatedOptions,
            repeat: newRepeat,
            postAt: newPostAt,
          },
        });

        // Send message
        const message = randomiser.message.replace('{{ result }}', selectedOption);
        const channel = await client.channels.fetch(randomiser.channelId.toString());
        if (channel && 'send' in channel) {
          await (channel as TextChannel).send(message);
        }
      } catch (error) {
        console.error(`[Randomiser] Error for randomiser ${randomiser.id}:`, error);
      }
    }
  },
};
