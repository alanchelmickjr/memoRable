/**
 * Dashboard Express Router.
 * Mount with: app.use(createDashboardRouter(db, startTime));
 *
 * Routes:
 *   /                         — Landing page
 *   /dashboard                — Intelligence dashboard (MongoDB)
 *   /dashboard/json           — JSON API for programmatic access
 *   /dashboard/calendar       — Calendar JSON data
 *   /dashboard/calendar/view  — Calendar HTML view
 *   /dashboard/mission-control — CRT-style mission control
 */

import { Router } from 'express';
import type { Db } from 'mongodb';

import { getDashboardSummary, getCalendarData, getDashboardJSON, getMissionControlData } from './queries.js';
import { renderHome } from './templates/home.js';
import { renderIntelligence } from './templates/intelligence.js';
import { renderMissionControl } from './templates/mission-control.js';
import { renderCalendar } from './templates/calendar.js';

export function createDashboardRouter(db: Db, startTime: number): Router {
  const router = Router();

  // Landing page — static, no DB needed
  router.get('/', (_req, res) => {
    res.set('Content-Type', 'text/html');
    res.send(renderHome());
  });

  // Intelligence dashboard — data from MongoDB Atlas
  router.get('/dashboard', async (_req, res) => {
    try {
      const data = await getDashboardSummary(db);
      res.set('Content-Type', 'text/html');
      res.send(renderIntelligence(data));
    } catch (err) {
      console.error('[Dashboard] Intelligence error:', err);
      res.status(500).send('Dashboard error — check MongoDB connection');
    }
  });

  // JSON endpoint for programmatic access
  router.get('/dashboard/json', async (_req, res) => {
    try {
      const data = await getDashboardJSON(db);
      res.json(data);
    } catch (err) {
      console.error('[Dashboard] JSON error:', err);
      res.status(500).json({ error: 'Dashboard query failed' });
    }
  });

  // Calendar JSON data
  router.get('/dashboard/calendar', async (_req, res) => {
    try {
      const data = await getCalendarData(db);
      res.json(data);
    } catch (err) {
      console.error('[Dashboard] Calendar error:', err);
      res.status(500).json({ error: 'Calendar query failed' });
    }
  });

  // Calendar HTML view
  router.get('/dashboard/calendar/view', (_req, res) => {
    res.set('Content-Type', 'text/html');
    res.send(renderCalendar());
  });

  // Mission Control — the star
  router.get('/dashboard/mission-control', async (_req, res) => {
    try {
      const data = await getMissionControlData(db, startTime);
      res.set('Content-Type', 'text/html');
      res.send(renderMissionControl(data));
    } catch (err) {
      console.error('[Dashboard] Mission Control error:', err);
      res.status(500).send('Mission Control error — check MongoDB connection');
    }
  });

  return router;
}
