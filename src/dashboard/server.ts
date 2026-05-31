import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { apiRouter } from './api';
import type { NextFunction, Request, Response } from 'express';

interface DashboardAuthConfig {
  username?: string;
  password?: string;
  requireAuth?: boolean;
}

export function startDashboard(
  port: number = 3000,
  basePath: string = process.env.DASHBOARD_BASE_PATH ?? '/',
  authConfig: DashboardAuthConfig = getDashboardAuthConfig(),
) {
  const app = express();
  const normalizedBasePath = normalizeBasePath(basePath);
  const publicDir = path.join(__dirname, '../../public');
  const indexFile = path.join(publicDir, 'index.html');

  app.use(express.json());

  const authMiddleware = createDashboardAuthMiddleware(authConfig);
  if (authMiddleware) {
    app.use(normalizedBasePath, authMiddleware);
  }

  // API routes
  app.use(joinBasePath(normalizedBasePath, '/api'), apiRouter);

  // Serve static frontend
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

  app.get(joinBasePath(normalizedBasePath, '/'), (_req, res) => {
    res.sendFile(indexFile);
  });

  app.use(normalizedBasePath, express.static(publicDir));

  app.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}${normalizedBasePath}`);
  });
}

function getDashboardAuthConfig(): DashboardAuthConfig {
  return {
    username: process.env.DASHBOARD_AUTH_USERNAME,
    password: process.env.DASHBOARD_AUTH_PASSWORD,
    requireAuth: process.env.DASHBOARD_REQUIRE_AUTH === 'true',
  };
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

function createDashboardAuthMiddleware(config: DashboardAuthConfig) {
  const username = config.username?.trim();
  const password = config.password ?? '';

  if (!username || !password) {
    if (!config.requireAuth) {
      return null;
    }

    return (_req: Request, res: Response, _next: NextFunction) => {
      res.status(503).send('Dashboard authentication is not configured.');
    };
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const credentials = parseBasicAuth(req.headers.authorization);

    if (
      credentials &&
      timingSafeEqual(credentials.username, username) &&
      timingSafeEqual(credentials.password, password)
    ) {
      next();
      return;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="MyChamps Bot Dashboard"');
    res.status(401).send('Authentication required.');
  };
}

function parseBasicAuth(header: string | undefined): { username: string; password: string } | null {
  if (!header?.startsWith('Basic ')) {
    return null;
  }

  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');

  if (separator === -1) {
    return null;
  }

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

function timingSafeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
