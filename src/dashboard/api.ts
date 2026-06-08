import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Client,
  type TextChannel,
} from 'discord.js';
import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { rebuildReminders } from '../utils/reminders';
import { isValidTimezone, parseDate, convertToUtc } from '../utils/timezone';
import { getTicketAccessRoleIds } from '../utils/incidentSettings';
import { MyChampsApiClient } from '../services/myChampsApiClient';
import { STATS_SETTING_KEY, parseStatsLeagueIds } from '../commands/stats';
import {
  getGuild,
  requireDashboardSession,
  requireGuildEdit,
  requireGuildManage,
  resolveGuildContext,
  userHasAccessRole,
  userCanManageGuild,
} from './permissions';
import {
  createDiscordNameResolver,
  redactSetting,
  serializeBigInts,
  serializeGuildMetadata,
  serializeServerList,
  serializeUser,
} from './serializers';
import type { DashboardContext } from './types';

const KNOWN_SETTING_KEYS = [
  'timezone',
  'post-time',
  'remind-attendees',
  'incident-reminder-interval',
  'mychamps-api-token',
  'incidents-category',
  'ticket-access-roles',
  STATS_SETTING_KEY,
] as const;

const BUTTON_COLORS: Record<string, { style: ButtonStyle; color: number }> = {
  Blue: { style: ButtonStyle.Primary, color: 0x3498db },
  Grey: { style: ButtonStyle.Secondary, color: 0x95a5a6 },
  Green: { style: ButtonStyle.Success, color: 0x2ecc71 },
  Red: { style: ButtonStyle.Danger, color: 0xe74c3c },
  Purple: { style: ButtonStyle.Primary, color: 0x9b59b6 },
  Orange: { style: ButtonStyle.Danger, color: 0xe67e22 },
  Yellow: { style: ButtonStyle.Success, color: 0xf1c40f },
  Teal: { style: ButtonStyle.Primary, color: 0x1abc9c },
  Pink: { style: ButtonStyle.Danger, color: 0xe91e63 },
};

const DEFAULT_BUTTON_MESSAGE =
  'Click the button below to report an incident. You will be asked to provide details.';

export function createApiRouter(context: Partial<DashboardContext> = {}): Router {
  const router = Router();
  const client = context.client;

  router.get('/me', (req, res) => {
    const user = req.session.dashboard?.user;

    res.json({
      authenticated: Boolean(user),
      user: user ? serializeUser(user) : null,
    });
  });

  router.use(requireDashboardSession);

  router.get('/servers', async (req, res, next) => {
    try {
      const userId = req.session.dashboard?.user?.id;
      const guilds = req.session.dashboard?.guilds ?? [];
      const accessGuildIds = new Set<string>();

      if (userId) {
        for (const guild of guilds) {
          if (!userCanManageGuild(guild) && (await userHasAccessRole(client, guild.id, userId))) {
            accessGuildIds.add(guild.id);
          }
        }
      }

      res.json({ servers: serializeServerList(guilds, client, accessGuildIds) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/servers/:guildId/bootstrap', async (req, res, next) => {
    try {
      const guildId = guildIdParam(req);
      const guildContext = await resolveGuildContext(req, client, guildId);

      if (!guildContext.canEdit) {
        res.status(403).json({ error: 'You do not have access to manage this server.' });
        return;
      }

      const guild = await getGuild(client, guildId);
      const metadata = await serializeGuildMetadata(guild);
      const resolver = createDiscordNameResolver(metadata);
      const [
        settings,
        schedules,
        reminders,
        attendance,
        randomisers,
        incidentButtons,
        incidents,
        accessRoles,
      ] = await Promise.all([
        prisma.setting.findMany({
          where: { guildId },
          orderBy: { key: 'asc' },
        }),
        prisma.schedule.findMany({
          where: { guildId: BigInt(guildId) },
          orderBy: { dateUtc: 'asc' },
        }),
        prisma.reminder.findMany({
          orderBy: { remindAt: 'asc' },
        }),
        prisma.attendance.findMany({
          where: { guildId: BigInt(guildId) },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.randomiser.findMany({
          where: { guildId: BigInt(guildId) },
          orderBy: { postAt: 'asc' },
        }),
        prisma.incidentButton.findMany({
          where: { guildId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.incident.findMany({
          where: { guildId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.dashboardAccessRole.findMany({
          where: { guildId },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      const scheduleMap = new Map(schedules.map((schedule) => [schedule.id.toString(), schedule]));
      const guildReminders = reminders.filter((reminder) => scheduleMap.has(reminder.scheduleId));
      let myChampsLeagues: unknown[] = [];
      const userId = req.session.dashboard?.user?.id;

      if (userId) {
        try {
          myChampsLeagues = await (
            await MyChampsApiClient.fromGuild(guildId)
          ).getManagedStatsLeagues(userId);
        } catch {
          myChampsLeagues = [];
        }
      }

      res.json(
        serializeBigInts({
          guild: {
            id: guildId,
            name:
              guild?.name ??
              req.session.dashboard?.guilds?.find((g) => g.id === guildId)?.name ??
              guildId,
            iconUrl: guild?.iconURL() ?? null,
            canManage: guildContext.canManage,
            canEdit: guildContext.canEdit,
          },
          metadata,
          settings: settings.map((setting) => ({
            ...redactSetting(setting),
            parsedValue:
              setting.key === STATS_SETTING_KEY ? parseStatsLeagueIds(setting.value) : undefined,
          })),
          schedules: schedules.map((schedule) => ({
            ...schedule,
            channelName: resolver.channelName(schedule.channelId),
            postTimeDaysBefore: schedule.timeBefore.replace(/^-/, ''),
            reminderCount: guildReminders.filter(
              (reminder) => reminder.scheduleId === schedule.id.toString(),
            ).length,
          })),
          reminders: guildReminders.map((reminder) => ({
            ...reminder,
            scheduleName: scheduleMap.get(reminder.scheduleId)?.name ?? reminder.scheduleId,
          })),
          attendance: attendance.map((record) => ({
            ...record,
            channelName: resolver.channelName(record.channelId),
            fullTimeRoleName: resolver.roleName(record.fullTime),
            reserveRoleName: resolver.roleName(record.reserve),
            commentatorRoleName: resolver.roleName(record.commentator),
            attendeeGroupNames: Object.keys(parseRecord(record.attendees)).filter(
              (group) => !['Reserves', 'Commentators', 'Not Participating'].includes(group),
            ),
          })),
          randomisers: randomisers.map((randomiser) => ({
            ...randomiser,
            channelName: resolver.channelName(randomiser.channelId),
          })),
          incidentButtons: incidentButtons.map((button) => ({
            ...button,
            channelName: resolver.channelName(button.channelId),
            incidentCategoryName: resolver.channelName(button.incidentCategoryId),
            stewardRoleNames: parseJsonArray(button.stewardRoleIds).map((id) =>
              resolver.roleName(id),
            ),
            channelRoleNames: parseJsonArray(button.channelRoleIds).map((id) =>
              resolver.roleName(id),
            ),
          })),
          incidents: incidents.map((incident) => ({
            ...incident,
            channelName: resolver.channelName(incident.channelId),
            stewardRoleNames: parseJsonArray(incident.stewardRoleIds).map((id) =>
              resolver.roleName(id),
            ),
          })),
          accessRoles: accessRoles.map((role) => ({
            ...role,
            roleName: resolver.roleName(role.roleId),
          })),
          myChampsLeagues,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.put('/servers/:guildId/settings', requireGuildEdit(client), async (req, res, next) => {
    try {
      await saveSettings(guildIdParam(req), req.body.settings ?? {});
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete(
    '/servers/:guildId/settings/:key',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const guildId = guildIdParam(req);
        const key = routeParam(req, 'key');

        if (!KNOWN_SETTING_KEYS.includes(key as (typeof KNOWN_SETTING_KEYS)[number])) {
          res.status(400).json({ error: 'Unknown setting key.' });
          return;
        }

        await prisma.setting.deleteMany({
          where: { guildId, key },
        });

        if (key === 'remind-attendees') {
          await rebuildReminders(guildId);
        }

        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/servers/:guildId/attendance', requireGuildEdit(client), async (req, res, next) => {
    try {
      const guildId = guildIdParam(req);
      const data = attendanceData(guildId, req.body);
      const created = await prisma.attendance.create({ data });
      await rebuildReminders(guildId);
      res.json(serializeBigInts(created));
    } catch (error) {
      next(error);
    }
  });

  router.put(
    '/servers/:guildId/attendance/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const guildId = guildIdParam(req);
        const updated = await prisma.attendance.update({
          where: { id: paramId(req) },
          data: attendanceData(guildId, req.body),
        });
        await rebuildReminders(guildId);
        res.json(serializeBigInts(updated));
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/servers/:guildId/attendance/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        await prisma.attendance.delete({ where: { id: paramId(req) } });
        await rebuildReminders(guildIdParam(req));
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/servers/:guildId/schedules', requireGuildEdit(client), async (req, res, next) => {
    try {
      const guildId = guildIdParam(req);
      const guild = await getGuild(client, guildId);
      const created = await prisma.schedule.create({
        data: await scheduleData(
          guildId,
          guild?.name ?? req.body.guildName ?? 'Discord Server',
          req.body,
        ),
      });
      await rebuildReminders(guildId);
      res.json(serializeBigInts(created));
    } catch (error) {
      next(error);
    }
  });

  router.put(
    '/servers/:guildId/schedules/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const guildId = guildIdParam(req);
        const guild = await getGuild(client, guildId);
        const updated = await prisma.schedule.update({
          where: { id: paramId(req) },
          data: await scheduleData(
            guildId,
            guild?.name ?? req.body.guildName ?? 'Discord Server',
            req.body,
          ),
        });
        await rebuildReminders(guildId);
        res.json(serializeBigInts(updated));
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/servers/:guildId/schedules/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const id = paramId(req);
        await prisma.reminder.deleteMany({ where: { scheduleId: id.toString() } });
        await prisma.schedule.delete({ where: { id } });
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/servers/:guildId/reminders', requireGuildEdit(client), async (req, res, next) => {
    try {
      const created = await prisma.reminder.create({ data: reminderData(req.body) });
      res.json(serializeBigInts(created));
    } catch (error) {
      next(error);
    }
  });

  router.put(
    '/servers/:guildId/reminders/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const updated = await prisma.reminder.update({
          where: { id: paramId(req) },
          data: reminderData(req.body),
        });
        res.json(serializeBigInts(updated));
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/servers/:guildId/reminders/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        await prisma.reminder.delete({ where: { id: paramId(req) } });
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post('/servers/:guildId/randomisers', requireGuildEdit(client), async (req, res, next) => {
    try {
      const created = await prisma.randomiser.create({
        data: randomiserData(guildIdParam(req), req.body),
      });
      res.json(serializeBigInts(created));
    } catch (error) {
      next(error);
    }
  });

  router.put(
    '/servers/:guildId/randomisers/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const updated = await prisma.randomiser.update({
          where: { id: paramId(req) },
          data: randomiserData(guildIdParam(req), req.body),
        });
        res.json(serializeBigInts(updated));
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/servers/:guildId/randomisers/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        await prisma.randomiser.delete({ where: { id: paramId(req) } });
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/servers/:guildId/incident-buttons',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const guildId = guildIdParam(req);
        const guild = await getGuild(client, guildId);
        const channel = await fetchTextChannel(client, req.body.channelId);

        if (!guild || !channel) {
          res.status(422).json({ error: 'The bot could not access the selected channel.' });
          return;
        }

        const buttonData = incidentButtonData(guildId, req.body);
        const posted = await postIncidentButton(channel, buttonData);
        const created = await prisma.incidentButton.create({
          data: {
            ...buttonData,
            messageId: posted.id,
          },
        });
        res.json(serializeBigInts(created));
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    '/servers/:guildId/incident-buttons/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const guildId = guildIdParam(req);
        const existing = await prisma.incidentButton.findFirst({
          where: { id: paramId(req), guildId },
        });

        if (!existing) {
          res.status(404).json({ error: 'Incident button not found.' });
          return;
        }

        const data = incidentButtonData(guildId, {
          ...existing,
          ...req.body,
          channelId: req.body.channelId ?? existing.channelId,
        });
        const updated = await prisma.incidentButton.update({ where: { id: existing.id }, data });
        await editIncidentButtonMessage(client, updated).catch((error) => {
          console.error('[Dashboard] Could not edit incident button message:', error);
        });
        res.json(serializeBigInts(updated));
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/servers/:guildId/incident-buttons/:id',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const guildId = guildIdParam(req);
        const existing = await prisma.incidentButton.findFirst({
          where: { id: paramId(req), guildId },
        });

        if (existing) {
          await deleteIncidentButtonMessage(client, existing).catch((error) => {
            console.error('[Dashboard] Could not delete incident button message:', error);
          });
          await prisma.incidentButton.delete({ where: { id: existing.id } });
        }

        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/servers/:guildId/incidents/:id/close',
    requireGuildEdit(client),
    async (req, res, next) => {
      try {
        const guildId = guildIdParam(req);
        const incident = await prisma.incident.findFirst({
          where: { id: paramId(req), guildId, status: { not: 'closed' } },
        });

        if (!incident) {
          res.status(404).json({ error: 'Active incident not found.' });
          return;
        }

        const verdict = cleanString(req.body.verdict) || 'NFA';
        const verdictDescription = cleanString(req.body.verdictDescription);
        const penaltyValue = cleanString(req.body.penaltyValue);

        if (!verdictDescription) {
          res.status(422).json({ error: 'A verdict description is required.' });
          return;
        }

        const warning = await closeIncident(client, guildId, incident, {
          verdict,
          verdictDescription,
          penaltyValue: verdict === 'Penalty' ? penaltyValue : undefined,
        });

        res.json({ success: true, warning });
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    '/servers/:guildId/access-roles',
    requireGuildManage(client),
    async (req, res, next) => {
      try {
        const guildId = guildIdParam(req);
        const roleIds = parseStringArray(req.body.roleIds);
        await prisma.dashboardAccessRole.deleteMany({ where: { guildId } });

        if (roleIds.length > 0) {
          await prisma.dashboardAccessRole.createMany({
            data: roleIds.map((roleId) => ({ guildId, roleId })),
            skipDuplicates: true,
          });
        }

        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.use((error: unknown, _req: Request, res: Response, _next: unknown) => {
    sendDashboardError(res, error);
  });

  return router;
}

function paramId(req: Request): number {
  const id = Number(routeParam(req, 'id'));

  if (!Number.isInteger(id) || id <= 0) {
    throw new DashboardHttpError(400, 'Invalid ID');
  }

  return id;
}

function guildIdParam(req: Request): string {
  return routeParam(req, 'guildId');
}

function routeParam(req: Request, key: string): string {
  const value = req.params[key];

  if (!value || Array.isArray(value)) {
    throw new DashboardHttpError(400, `Missing ${key}.`);
  }

  return value;
}

async function saveSettings(guildId: string, values: Record<string, unknown>): Promise<void> {
  const writes: Array<Promise<unknown>> = [];
  let shouldRebuildReminders = false;

  for (const key of KNOWN_SETTING_KEYS) {
    if (!(key in values)) {
      continue;
    }

    const rawValue = values[key];
    const value =
      key === 'ticket-access-roles'
        ? JSON.stringify(parseStringArray(rawValue))
        : key === STATS_SETTING_KEY
          ? JSON.stringify(parseNumberArray(rawValue))
          : cleanString(rawValue);

    if (key === 'mychamps-api-token' && value === '[redacted]') {
      continue;
    }

    if (value === '') {
      writes.push(prisma.setting.deleteMany({ where: { guildId, key } }));
      if (key === 'remind-attendees') {
        shouldRebuildReminders = true;
      }
      continue;
    }

    validateSetting(key, value);

    writes.push(upsertSetting(guildId, key, value));

    if (key === 'remind-attendees') {
      shouldRebuildReminders = true;
    }
  }

  await Promise.all(writes);

  if (shouldRebuildReminders) {
    await rebuildReminders(guildId);
  }
}

async function upsertSetting(guildId: string, key: string, value: string): Promise<void> {
  const existing = await prisma.setting.findFirst({ where: { guildId, key } });

  await prisma.setting.upsert({
    where: { id: existing?.id ?? 0 },
    create: { guildId, key, value },
    update: { value },
  });
}

function validateSetting(key: string, value: string): void {
  if (key === 'timezone' && value && !isValidTimezone(value)) {
    throw new DashboardHttpError(422, `Invalid timezone: ${value}`);
  }

  if (['post-time', 'remind-attendees', 'incident-reminder-interval'].includes(key)) {
    parseWholeNumber(value, key);
  }
}

function attendanceData(guildId: string, body: Record<string, unknown>) {
  const groups = parseStringArray(body.groups);
  const attendees = groups.reduce<Record<string, Record<string, string>>>((acc, group) => {
    acc[group] = {};
    return acc;
  }, {});

  if (body.includeReserveGroup !== false) {
    attendees.Reserves ??= {};
  }
  if (body.includeCommentatorGroup !== false) {
    attendees.Commentators ??= {};
  }
  attendees['Not Participating'] ??= {};

  return {
    guildId: BigInt(guildId),
    channelId: parseSnowflake(body.channelId, 'Channel'),
    fullTime: parseSnowflake(body.fullTimeRoleId, 'Full-time role'),
    reserve: optionalSnowflake(body.reserveRoleId),
    commentator: optionalSnowflake(body.commentatorRoleId),
    attendees: attendees as Prisma.InputJsonValue,
  };
}

async function scheduleData(guildId: string, guildName: string, body: Record<string, unknown>) {
  const name = cleanString(body.name);
  const dateLocal = cleanString(body.dateLocal);

  if (!name || !dateLocal) {
    throw new DashboardHttpError(422, 'Schedule name and date are required.');
  }

  const timezone = (await prisma.setting.findFirst({ where: { guildId, key: 'timezone' } }))?.value;

  if (!timezone) {
    throw new DashboardHttpError(422, 'Set a server timezone before creating schedules.');
  }

  const date = parseDashboardLocalDate(dateLocal);
  const closingDate = cleanString(body.closingDateLocal)
    ? parseDashboardLocalDate(cleanString(body.closingDateLocal))
    : null;
  const postTime = cleanString(body.postTimeDaysBefore) || '6';

  return {
    guildId: BigInt(guildId),
    guildName,
    channelId: parseSnowflake(body.channelId, 'Channel'),
    name,
    date,
    dateUtc: convertToUtc(date, timezone),
    closingDate,
    closingDateUtc: closingDate ? convertToUtc(closingDate, timezone) : null,
    image: cleanString(body.image) || null,
    timeBefore: `-${parseWholeNumber(postTime, 'Post time')}`,
    botPosted: Boolean(body.botPosted),
    closed: Boolean(body.closed),
    attendees: parseRecord(body.attendees) as Prisma.InputJsonValue,
  };
}

function reminderData(body: Record<string, unknown>) {
  return {
    scheduleId: cleanString(body.scheduleId) || required('Schedule'),
    remindAt: parseIsoDate(body.remindAt, 'Reminder time'),
    reminded: Boolean(body.reminded),
  };
}

function randomiserData(guildId: string, body: Record<string, unknown>) {
  return {
    guildId: BigInt(guildId),
    channelId: parseSnowflake(body.channelId, 'Channel'),
    options: cleanString(body.options) || required('Options'),
    repick: Boolean(body.repick),
    frequency: Number(parseWholeNumber(cleanString(body.frequency) || '1', 'Frequency')),
    repeat: Number(parseWholeNumber(cleanString(body.repeat) || '1', 'Repeat')),
    postAt: parseIsoDate(body.postAt, 'Post time'),
    message: cleanString(body.message) || '{{ result }}',
  };
}

function incidentButtonData(guildId: string, body: Record<string, unknown>) {
  const buttonColor = cleanString(body.buttonColor) || 'Red';

  return {
    guildId,
    channelId: parseSnowflakeString(body.channelId, 'Channel'),
    championshipSlug: cleanString(body.championshipSlug) || required('Championship slug'),
    incidentCategoryId: cleanString(body.incidentCategoryId) || null,
    stewardRoleIds: parseStringArray(body.stewardRoleIds),
    channelRoleIds: parseStringArray(body.channelRoleIds),
    addReporterToChannel: Boolean(body.addReporterToChannel),
    buttonMessage: cleanString(body.buttonMessage) || DEFAULT_BUTTON_MESSAGE,
    buttonLabel: cleanString(body.buttonLabel) || 'Report Incident',
    buttonColor: BUTTON_COLORS[buttonColor] ? buttonColor : 'Red',
  };
}

async function postIncidentButton(
  channel: TextChannel,
  data: ReturnType<typeof incidentButtonData>,
) {
  const buttonColor = BUTTON_COLORS[data.buttonColor] ?? BUTTON_COLORS.Red;
  const button = new ButtonBuilder()
    .setCustomId(`incident_report!${data.championshipSlug}`)
    .setLabel(data.buttonLabel)
    .setStyle(buttonColor.style);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  const embed = new EmbedBuilder()
    .setTitle(`${data.championshipSlug} - Incident Reporting`)
    .setDescription(data.buttonMessage)
    .setColor(buttonColor.color);

  return channel.send({
    embeds: [embed],
    components: [row],
  });
}

async function editIncidentButtonMessage(
  client: Client | undefined,
  button: {
    channelId: string;
    messageId: string;
    championshipSlug: string;
    buttonLabel: string;
    buttonColor: string;
    buttonMessage: string;
  },
) {
  const channel = await fetchTextChannel(client, button.channelId);

  if (!channel) {
    return;
  }

  const message = await channel.messages.fetch(button.messageId);
  const buttonColor = BUTTON_COLORS[button.buttonColor] ?? BUTTON_COLORS.Red;
  const component = new ButtonBuilder()
    .setCustomId(`incident_report!${button.championshipSlug}`)
    .setLabel(button.buttonLabel)
    .setStyle(buttonColor.style);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(component);
  const embed = new EmbedBuilder()
    .setTitle(`${button.championshipSlug} - Incident Reporting`)
    .setDescription(button.buttonMessage)
    .setColor(buttonColor.color);

  await message.edit({
    embeds: [embed],
    components: [row],
  });
}

async function deleteIncidentButtonMessage(
  client: Client | undefined,
  button: { channelId: string; messageId: string },
) {
  const channel = await fetchTextChannel(client, button.channelId);
  const message = await channel?.messages.fetch(button.messageId).catch(() => null);
  await message?.delete();
}

async function fetchTextChannel(
  client: Client | undefined,
  channelId: unknown,
): Promise<TextChannel | null> {
  const id = cleanString(channelId);
  const channel =
    id && client?.isReady() ? await client.channels.fetch(id).catch(() => null) : null;

  if (!channel || channel.type !== ChannelType.GuildText) {
    return null;
  }

  return channel as TextChannel;
}

async function closeIncident(
  client: Client | undefined,
  guildId: string,
  incident: { id: number; channelId: string | null; mychampsIncidentId: number | null },
  payload: { verdict: string; verdictDescription: string; penaltyValue?: string },
): Promise<string | null> {
  let warning: string | null = null;

  if (incident.mychampsIncidentId) {
    try {
      await (
        await MyChampsApiClient.fromGuild(guildId)
      ).submitVerdict(incident.mychampsIncidentId, {
        verdict: payload.verdict,
        penalty_value: payload.penaltyValue,
        verdict_description: payload.verdictDescription,
      });
    } catch (error) {
      warning = error instanceof Error ? error.message : 'Could not sync verdict to MyChamps.';
    }
  }

  const channel = incident.channelId ? await fetchTextChannel(client, incident.channelId) : null;

  if (channel) {
    const embed = new EmbedBuilder()
      .setTitle('Incident Closed')
      .addFields(
        { name: 'Verdict', value: payload.verdict, inline: true },
        ...(payload.penaltyValue
          ? [{ name: 'Penalty', value: payload.penaltyValue, inline: true }]
          : []),
        { name: 'Description', value: payload.verdictDescription },
      )
      .setColor(payload.verdict === 'NFA' ? 0x2ecc71 : 0xe74c3c)
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch((error) => {
      warning = error instanceof Error ? error.message : 'Could not post verdict to Discord.';
    });

    const ticketAccessRoleIds = await getTicketAccessRoleIds(guildId);
    const targets = new Set([
      channel.guild.roles.everyone.id,
      ...Array.from(channel.permissionOverwrites.cache.keys()),
      ...ticketAccessRoleIds,
    ]);

    for (const targetId of targets) {
      await channel.permissionOverwrites
        .edit(targetId, {
          ViewChannel: true,
          SendMessages: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          AddReactions: false,
        })
        .catch((error) => {
          warning = error instanceof Error ? error.message : 'Could not lock incident channel.';
        });
    }
  }

  await prisma.incident.update({
    where: { id: incident.id },
    data: { status: 'closed' },
  });

  return warning;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(cleanString).filter(Boolean);
  }

  const cleaned = cleanString(value);
  if (!cleaned) {
    return [];
  }

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    return parseStringArray(parsed);
  } catch {
    return cleaned
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function parseNumberArray(value: unknown): number[] {
  return parseStringArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function parseJsonArray(value: unknown): string[] {
  return parseStringArray(value);
}

function parseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseSnowflake(value: unknown, label: string): bigint {
  return BigInt(parseSnowflakeString(value, label));
}

function optionalSnowflake(value: unknown): bigint | null {
  const cleaned = cleanString(value);
  return cleaned ? BigInt(cleaned) : null;
}

function parseSnowflakeString(value: unknown, label: string): string {
  const cleaned = cleanString(value);

  if (!/^\d+$/.test(cleaned)) {
    throw new DashboardHttpError(422, `${label} must be selected.`);
  }

  return cleaned;
}

function parseDashboardLocalDate(value: string): Date {
  const parsed = parseDate(
    value.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}).*$/, '$1$2$3 $4:$5'),
  );

  if (!parsed) {
    throw new DashboardHttpError(422, 'Invalid date format.');
  }

  return parsed;
}

function parseIsoDate(value: unknown, label: string): Date {
  const cleaned = cleanString(value);
  const date = new Date(cleaned);

  if (!cleaned || Number.isNaN(date.getTime())) {
    throw new DashboardHttpError(422, `${label} is invalid.`);
  }

  return date;
}

function parseWholeNumber(value: string, label: string): string {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new DashboardHttpError(
      422,
      `${label} must be a whole number greater than or equal to 0.`,
    );
  }

  return parsed.toString();
}

function required(label: string): never {
  throw new DashboardHttpError(422, `${label} is required.`);
}

class DashboardHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendDashboardError(res: Response, error: unknown): void {
  if (error instanceof DashboardHttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  if (isRecordNotFoundError(error)) {
    res.status(404).json({
      error: 'Record not found',
      message: 'The dashboard record no longer exists. Refresh and try again.',
    });
    return;
  }

  console.error('[DashboardAPI] Error:', error);
  res.status(500).json({
    error: 'Dashboard server error',
    message: 'The dashboard could not complete the request.',
  });
}

function isRecordNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const possibleError = error as { code?: unknown; message?: unknown };

  return possibleError.code === 'P2025' || /not found/i.test(String(possibleError.message ?? ''));
}

export const apiRouter = createApiRouter();
