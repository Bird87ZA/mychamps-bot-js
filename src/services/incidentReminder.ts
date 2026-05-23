import { Client, TextChannel } from 'discord.js';
import { prisma } from '../database';
import { ServiceInterval } from '../types';
import { getSetting } from '../utils/settings';
import { formatRoleMentions, getTicketAccessRoleIds } from '../utils/incidentSettings';

const DEFAULT_REMINDER_INTERVAL_HOURS = 24;

export const incidentReminderService: ServiceInterval = {
  name: 'IncidentReminder',
  interval: 60,

  async execute(client: Client): Promise<void> {
    // Find all incidents awaiting review
    const incidents = await prisma.incident.findMany({
      where: { status: 'awaiting_review' },
    });

    if (incidents.length === 0) return;

    for (const incident of incidents) {
      try {
        // Get the configured reminder interval for this guild (in hours)
        const intervalSetting = await getSetting(incident.guildId, 'incident-reminder-interval');
        const intervalHours = intervalSetting
          ? parseInt(intervalSetting, 10)
          : DEFAULT_REMINDER_INTERVAL_HOURS;

        if (isNaN(intervalHours) || intervalHours <= 0) continue;

        const now = new Date();
        const lastReminder = incident.lastReminderAt;
        const intervalMs = intervalHours * 60 * 60 * 1000;

        // Skip if we reminded recently
        if (lastReminder && now.getTime() - lastReminder.getTime() < intervalMs) {
          continue;
        }

        // Skip if there is no channel
        if (!incident.channelId) continue;

        // Try to fetch the channel
        let channel: TextChannel | null = null;
        try {
          const fetched = await client.channels.fetch(incident.channelId);
          if (fetched && 'send' in fetched) {
            channel = fetched as TextChannel;
          }
        } catch {
          // Channel was deleted — clean up gracefully
          console.warn(
            `[IncidentReminder] Channel ${incident.channelId} not found for incident ${incident.id}. Skipping.`,
          );
          continue;
        }

        if (!channel) continue;

        const ticketAccessRoleIds = await getTicketAccessRoleIds(incident.guildId);
        const mention = formatRoleMentions(ticketAccessRoleIds);

        await channel.send(
          `${mention} Reminder: This incident is still awaiting your review. Please close it using \`/incident close\`.`,
        );

        // Update lastReminderAt
        await prisma.incident.update({
          where: { id: incident.id },
          data: { lastReminderAt: now },
        });
      } catch (err) {
        console.error(`[IncidentReminder] Error processing incident ${incident.id}:`, err);
      }
    }
  },
};
