import express from 'express';
import path from 'path';
import { apiRouter } from './api';

export function startDashboard(port: number = 3000) {
  const app = express();

  app.use(express.json());

  // API routes
  app.use('/api', apiRouter);

  // Serve static frontend
  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  });

  app.use(express.static(path.join(__dirname, '../../public')));

  app.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
  });
}
