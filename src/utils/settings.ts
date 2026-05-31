import { prisma } from '../database';

export async function getSetting(guildId: string, key: string): Promise<string | null> {
  const setting = await prisma.setting.findFirst({
    where: { guildId, key },
  });
  return setting?.value ?? null;
}

export async function setSetting(guildId: string, key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: {
      id: (await prisma.setting.findFirst({ where: { guildId, key } }))?.id ?? 0,
    },
    create: { guildId, key, value },
    update: { value },
  });
}

export async function hasTimezone(guildId: string): Promise<boolean> {
  const exists = await prisma.setting.findFirst({
    where: { guildId, key: 'timezone' },
  });
  if (!exists) {
    throw new Error('Timezone is not set for this server.');
  }
  return true;
}

export async function guildsWithRemindersEnabled(): Promise<string[]> {
  const settings = await prisma.setting.findMany({
    where: { key: 'remind-attendees' },
  });
  return settings.map((s) => s.guildId);
}
