import { Router } from 'express';
import {
  buildInviteUrl,
  buildLoginUrl,
  createOAuthState,
  exchangeCodeForToken,
  fetchDiscordGuilds,
  fetchDiscordUser,
} from './discordApi';

export function createAuthRouter(basePath: string): Router {
  const router = Router();

  router.get('/auth/discord', (req, res, next) => {
    try {
      const state = createOAuthState();
      req.session.dashboard = { ...(req.session.dashboard ?? {}), state };
      res.redirect(buildLoginUrl(req, basePath, state));
    } catch (error) {
      next(error);
    }
  });

  router.get('/auth/callback', async (req, res, next) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        res.redirect(`${basePath}/?auth_error=${encodeURIComponent(String(error))}`);
        return;
      }

      if (!code || typeof code !== 'string' || state !== req.session.dashboard?.state) {
        res.status(400).send('Invalid Discord OAuth callback.');
        return;
      }

      const token = await exchangeCodeForToken(req, basePath, code);
      const [user, guilds] = await Promise.all([
        fetchDiscordUser(token.access_token),
        fetchDiscordGuilds(token.access_token),
      ]);

      req.session.dashboard = {
        accessToken: token.access_token,
        tokenExpiresAt: Date.now() + token.expires_in * 1000,
        user,
        guilds,
      };

      res.redirect(`${basePath}/`);
    } catch (error) {
      next(error);
    }
  });

  router.get('/invite', (req, res, next) => {
    try {
      const guildId = typeof req.query.guild_id === 'string' ? req.query.guild_id : undefined;
      res.redirect(buildInviteUrl(req, basePath, guildId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/invite/callback', (_req, res) => {
    res.redirect(`${basePath}/?invited=1`);
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((error) => {
      if (error) {
        next(error);
        return;
      }

      res.clearCookie('mychamps_bot_dashboard');
      res.json({ success: true });
    });
  });

  return router;
}
