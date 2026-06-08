import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListen = vi.fn((_port: number, cb: () => void) => cb());
const mockUse = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockApp = { use: mockUse, get: mockGet, set: mockSet, listen: mockListen };
const mockStatic = vi.fn(() => 'static-middleware');
const mockJson = vi.fn(() => 'json-middleware');
const mockSession = vi.fn(() => 'session-middleware');
const mockCreateApiRouter = vi.fn(() => 'mock-api-router');
const mockCreateAuthRouter = vi.fn(() => 'mock-auth-router');

vi.mock('express', () => {
  const express = vi.fn(() => mockApp);
  (express as unknown as Record<string, unknown>).json = mockJson;
  (express as unknown as Record<string, unknown>).static = mockStatic;
  return { default: express };
});

vi.mock('express-session', () => ({
  default: mockSession,
}));

vi.mock('../../src/dashboard/api', () => ({
  createApiRouter: mockCreateApiRouter,
}));

vi.mock('../../src/dashboard/auth', () => ({
  createAuthRouter: mockCreateAuthRouter,
}));

vi.mock('../../src/dashboard/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/dashboard/config')>();
  return {
    ...actual,
    getDashboardSessionSecret: vi.fn(() => 'test-session-secret'),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startDashboard', () => {
  it('starts express server on the given port', async () => {
    const { startDashboard } = await import('../../src/dashboard/server');
    startDashboard(4000);

    expect(mockListen).toHaveBeenCalledWith(4000, expect.any(Function));
  });

  it('mounts session, auth, and API routers at the root by default', async () => {
    const { startDashboard } = await import('../../src/dashboard/server');
    startDashboard();

    expect(mockSet).toHaveBeenCalledWith('trust proxy', true);
    expect(mockUse).toHaveBeenCalledWith('/', 'session-middleware');
    expect(mockUse).toHaveBeenCalledWith('/', 'mock-auth-router');
    expect(mockUse).toHaveBeenCalledWith('/api', 'mock-api-router');
    expect(mockCreateAuthRouter).toHaveBeenCalledWith('/');
    expect(mockCreateApiRouter).toHaveBeenCalledWith({ basePath: '/', client: undefined });
  });

  it('mounts the dashboard under a configured base path', async () => {
    const client = { isReady: vi.fn(() => true) };
    const { startDashboard } = await import('../../src/dashboard/server');
    startDashboard(4000, '/bot', client as never);

    expect(mockUse).toHaveBeenCalledWith('/bot', 'session-middleware');
    expect(mockUse).toHaveBeenCalledWith('/bot', 'mock-auth-router');
    expect(mockUse).toHaveBeenCalledWith('/bot/api', 'mock-api-router');
    expect(mockGet).toHaveBeenCalledWith('/', expect.any(Function));
    expect(mockCreateAuthRouter).toHaveBeenCalledWith('/bot');
    expect(mockCreateApiRouter).toHaveBeenCalledWith({ basePath: '/bot', client });
  });

  it('configures the dashboard session cookie', async () => {
    const { startDashboard } = await import('../../src/dashboard/server');
    startDashboard(4000, '/bot');

    expect(mockSession).toHaveBeenCalledWith({
      name: 'mychamps_bot_dashboard',
      secret: 'test-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    });
  });
});
