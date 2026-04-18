import { prisma } from '../database';
import { getSetting } from './settings';
import { addHours, isAfter, isBefore } from 'date-fns';

/**
 * Rebuild all reminders for a guild.
 * Deletes existing reminders and creates new ones based on current settings.
 */
export async function rebuildReminders(guildId: string): Promise<void> {
  const reminderFrequencyStr = await getSetting(guildId, 'remind-attendees');
  if (!reminderFrequencyStr) return;

  const reminderFrequency = parseInt(reminderFrequencyStr, 10);
  if (isNaN(reminderFrequency) || reminderFrequency <= 0) return;

  // Check if any attendance bots exist with schedules
  const attendanceBots = await prisma.attendance.findMany({
    where: { guildId: BigInt(guildId) },
  });

  if (attendanceBots.length === 0) return;

  const hasSchedule = await prisma.schedule.findFirst({
    where: {
      guildId: BigInt(guildId),
      channelId: { in: attendanceBots.map((a) => a.channelId) },
    },
  });

  if (!hasSchedule) return;

  // Get all schedules for this guild
  const schedules = await prisma.schedule.findMany({
    where: { guildId: BigInt(guildId) },
  });

  // Delete existing reminders for these schedules
  const scheduleIds = schedules.map((s) => s.id.toString());
  if (scheduleIds.length > 0) {
    await prisma.reminder.deleteMany({
      where: { scheduleId: { in: scheduleIds } },
    });
  }

  // Create new reminders for each schedule
  const now = new Date();
  const remindersToCreate: { scheduleId: string; remindAt: Date }[] = [];

  for (const schedule of schedules) {
    const timeBefore = parseInt(schedule.timeBefore, 10);
    const startDate = new Date(schedule.dateUtc);
    startDate.setDate(startDate.getDate() + timeBefore); // timeBefore is negative, so this subtracts

    const endDate = schedule.closingDateUtc ?? schedule.dateUtc;

    // Start from now or startDate, whichever is later
    let current = isAfter(now, startDate) ? new Date(now) : new Date(startDate);
    current = addHours(current, reminderFrequency);

    while (isBefore(current, endDate)) {
      remindersToCreate.push({
        scheduleId: schedule.id.toString(),
        remindAt: new Date(current),
      });
      current = addHours(current, reminderFrequency);
    }
  }

  if (remindersToCreate.length > 0) {
    await prisma.reminder.createMany({ data: remindersToCreate });
  }
}
