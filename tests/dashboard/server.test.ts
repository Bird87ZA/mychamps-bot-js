import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListen = vi.fn((_port: number, cb: () => void) => cb());
const mockUse = vi.fn();
const mockGet = vi.fn();
const mockApp = { use: mockUse, get: mockGet, listen: mockListen };

vi.mock('express', () => {
  const express = vi.fn(() => mockApp);
  (express as unknown as Record<string, unknown>).json = vi.fn(() => 'json-middleware');
  (express as unknown as Record<string, unknown>).static = vi.fn(() => 'static-middleware');
  return { default: express };
});

vi.mock('../../src/dashboard/api', () => ({
  apiRouter: 'mock-router',
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startDashboard', () => {
  it('starts express server on given port', async () => {
    const { startDashboard } = await import('../../src/dashboard/server');
    startDashboard(4000);

    expect(mockListen).toHaveBeenCalledWith(4000, expect.any(Function));
  });

  it('mounts API router under /api', async () => {
    const { startDashboard } = await import('../../src/dashboard/server');
    startDashboard();

    expect(mockUse).toHaveBeenCalledWith('/api', 'mock-router');
  });

  it('mounts dashboard under a configured base path', async () => {
    const { startDashboard } = await import('../../src/dashboard/server');
    startDashboard(4000, '/bot');

    expect(mockUse).toHaveBeenCalledWith(expect.any(Function));
    expect(mockUse).toHaveBeenCalledWith('/bot/api', 'mock-router');
    expect(mockGet).toHaveBeenCalledWith('/bot/', expect.any(Function));
  });

  it('adds auth middleware when dashboard credentials are configured', async () => {
    const { startDashboard } = await import('../../src/dashboard/server');
    startDashboard(4000, '/bot', { username: 'admin', password: 'secret' });

    expect(mockUse).toHaveBeenCalledWith('/bot', expect.any(Function));
  });
});
