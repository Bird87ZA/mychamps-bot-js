import express from 'express';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import type { Client } from 'discord.js';
import { createApiRouter } from './api';
import { createAuthRouter } from './auth';
import { getDashboardSessionSecret } from './config';

export function startDashboard(
  port: number = 3000,
  basePath: string = process.env.DASHBOARD_BASE_PATH ?? '/',
  client?: Client,
) {
  const app = express();
  const normalizedBasePath = normalizeBasePath(basePath);
  const dashboardPublicDir = path.join(__dirname, '../../public/dashboard');
  const legacyPublicDir = path.join(__dirname, '../../public');
  const publicDir = fs.existsSync(path.join(dashboardPublicDir, 'index.html'))
    ? dashboardPublicDir
    : legacyPublicDir;
  const indexFile = path.join(publicDir, 'index.html');

  app.set('trust proxy', true);
  app.use(express.json());
  app.use(
    normalizedBasePath,
    session({
      name: 'mychamps_bot_dashboard',
      secret: getDashboardSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(normalizedBasePath, createAuthRouter(normalizedBasePath));
  app.use(
    joinBasePath(normalizedBasePath, '/api'),
    createApiRouter({
      basePath: normalizedBasePath,
      client,
    }),
  );

  if (normalizedBasePath !== '/') {
    app.use((req, res, next) => {
      if (req.path === normalizedBasePath) {
        res.redirect(308, `${normalizedBasePath}/`);
        return;
      }

      next();
    });
    app.get('/', (_req, res) => {
      res.redirect(302, `${normalizedBasePath}/`);
    });
  }

  app.use(normalizedBasePath, express.static(publicDir));
  app.get(joinBasePath(normalizedBasePath, '/'), (_req, res) => {
    res.sendFile(indexFile);
  });
  app.get(spaRoutePattern(normalizedBasePath), (req, res, next) => {
    if (req.path.startsWith(joinBasePath(normalizedBasePath, '/api'))) {
      next();
      return;
    }

    res.sendFile(indexFile);
  });

  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('[Dashboard] Error:', error);
      res.status(500).send('Dashboard server error.');
    },
  );

  app.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}${normalizedBasePath}`);
  });
}

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function joinBasePath(basePath: string, route: string): string {
  if (basePath === '/') {
    return route;
  }

  return route === '/' ? `${basePath}/` : `${basePath}${route}`;
}

function spaRoutePattern(basePath: string): RegExp {
  if (basePath === '/') {
    return /^\/(?!api(?:\/|$)).*/;
  }

  return new RegExp(`^${escapeRegex(basePath)}(?:/.*)?$`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
