import db from '../config/db.js';

export const getStats = async (_req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'client') AS total_clients,
        (SELECT COUNT(*) FROM users WHERE role = 'coach') AS total_coaches,
        (SELECT COUNT(*) FROM exercises) AS total_exercises,
        (SELECT COUNT(*) FROM weekly_plans WHERE status = 'active') AS active_plans,
        (SELECT COUNT(*) FROM plan_downloads) AS total_downloads
    `);
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};
