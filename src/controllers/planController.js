import db from '../config/db.js';

const isStaff = (user) => ['admin', 'coach'].includes(user.role);

const getPlanOwner = async (planId, connection = db) => {
  const [rows] = await connection.query(
    'SELECT id, user_id, coach_id FROM weekly_plans WHERE id = ?',
    [planId],
  );
  return rows[0];
};

const canReadPlan = (user, plan) =>
  isStaff(user) || Number(user.id) === Number(plan?.user_id);

const canManagePlan = (user, plan) =>
  user.role === 'admin' ||
  (user.role === 'coach' && (!plan || Number(user.id) === Number(plan.coach_id)));

const fetchCompletePlan = async (id) => {
  const [plans] = await db.query(
    `SELECT p.*, u.name AS client_name, u.email AS client_email,
            u.phone AS client_phone, u.objective AS client_objective,
            c.name AS coach_name
     FROM weekly_plans p
     JOIN users u ON u.id = p.user_id
     JOIN users c ON c.id = p.coach_id
     WHERE p.id = ?`,
    [id],
  );
  if (!plans[0]) return null;

  const [days] = await db.query(
    'SELECT * FROM plan_days WHERE plan_id = ? ORDER BY id',
    [id],
  );
  if (days.length) {
    const placeholders = days.map(() => '?').join(',');
    const [items] = await db.query(
      `SELECT pde.*, e.name AS exercise_name, e.category, e.muscle_group,
              e.description AS exercise_description, e.video_url
       FROM plan_day_exercises pde
       JOIN exercises e ON e.id = pde.exercise_id
       WHERE pde.plan_day_id IN (${placeholders})
       ORDER BY pde.plan_day_id, pde.order_number, pde.id`,
      days.map((day) => day.id),
    );
    days.forEach((day) => {
      day.exercises = items.filter((item) => item.plan_day_id === day.id);
    });
  }
  plans[0].days = days;
  return plans[0];
};

export const listPlans = async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role === 'client') {
      where = 'WHERE p.user_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'coach') {
      where = 'WHERE p.coach_id = ?';
      params.push(req.user.id);
    }
    const [rows] = await db.query(
      `SELECT p.*, u.name AS client_name, c.name AS coach_name,
              (SELECT COUNT(*) FROM plan_days d WHERE d.plan_id = p.id) AS days_count
       FROM weekly_plans p
       JOIN users u ON u.id = p.user_id
       JOIN users c ON c.id = p.coach_id
       ${where}
       ORDER BY p.start_date DESC, p.created_at DESC`,
      params,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const listUserPlans = async (req, res, next) => {
  try {
    if (req.user.role === 'client' && Number(req.user.id) !== Number(req.params.userId)) {
      return res.status(403).json({ message: 'Só pode consultar os seus próprios planos.' });
    }
    const params = [req.params.userId];
    let coachFilter = '';
    if (req.user.role === 'coach') {
      coachFilter = 'AND p.coach_id = ?';
      params.push(req.user.id);
    }
    const [rows] = await db.query(
      `SELECT p.*, u.name AS client_name, c.name AS coach_name,
              (SELECT COUNT(*) FROM plan_days d WHERE d.plan_id = p.id) AS days_count
       FROM weekly_plans p
       JOIN users u ON u.id = p.user_id
       JOIN users c ON c.id = p.coach_id
       WHERE p.user_id = ? ${coachFilter}
       ORDER BY p.start_date DESC`,
      params,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const getPlan = async (req, res, next) => {
  try {
    const owner = await getPlanOwner(req.params.id);
    if (!owner) return res.status(404).json({ message: 'Plano não encontrado.' });
    if (!canReadPlan(req.user, owner)) return res.status(403).json({ message: 'Acesso negado.' });
    res.json(await fetchCompletePlan(req.params.id));
  } catch (error) {
    next(error);
  }
};

export const createPlan = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { user_id, title, objective, start_date, end_date, notes, status = 'active', days = [] } = req.body;
    if (!user_id || !title?.trim() || !start_date || !end_date) {
      return res.status(400).json({ message: 'Cliente, título e datas são obrigatórios.' });
    }
    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ message: 'A data final deve ser posterior à data inicial.' });
    }
    const [clients] = await connection.query("SELECT id FROM users WHERE id = ? AND role = 'client'", [user_id]);
    if (!clients[0]) return res.status(400).json({ message: 'O cliente selecionado não é válido.' });
    const coachId = req.user.role === 'coach' ? req.user.id : (req.body.coach_id || req.user.id);
    const [coaches] = await connection.query("SELECT id FROM users WHERE id = ? AND role IN ('admin', 'coach')", [coachId]);
    if (!coaches[0]) return res.status(400).json({ message: 'O coach selecionado não é válido.' });

    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO weekly_plans
       (user_id, coach_id, title, objective, start_date, end_date, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, coachId, title.trim(), objective || null, start_date, end_date, notes || null, status],
    );

    for (const day of days) {
      if (!day.day_name?.trim()) throw Object.assign(new Error('Todos os dias precisam de um nome.'), { status: 400 });
      const [dayResult] = await connection.query(
        'INSERT INTO plan_days (plan_id, day_name, focus, notes) VALUES (?, ?, ?, ?)',
        [result.insertId, day.day_name.trim(), day.focus || null, day.notes || null],
      );
      for (const [index, item] of (day.exercises || []).entries()) {
        if (!item.exercise_id) throw Object.assign(new Error('Selecione um exercício para cada item.'), { status: 400 });
        await connection.query(
          `INSERT INTO plan_day_exercises
           (plan_day_id, exercise_id, sets, reps, rest_time, duration, order_number, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dayResult.insertId,
            item.exercise_id,
            item.sets || null,
            item.reps || null,
            item.rest_time || null,
            item.duration || null,
            item.order_number || index + 1,
            item.notes || null,
          ],
        );
      }
    }
    await connection.commit();
    res.status(201).json(await fetchCompletePlan(result.insertId));
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

export const updatePlan = async (req, res, next) => {
  try {
    const plan = await getPlanOwner(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plano não encontrado.' });
    if (!canManagePlan(req.user, plan)) return res.status(403).json({ message: 'Acesso negado.' });
    if (req.body.status && !['active', 'completed', 'cancelled'].includes(req.body.status)) {
      return res.status(400).json({ message: 'Estado do plano inválido.' });
    }
    if (req.body.user_id) {
      const [clients] = await db.query("SELECT id FROM users WHERE id = ? AND role = 'client'", [req.body.user_id]);
      if (!clients[0]) return res.status(400).json({ message: 'O cliente selecionado não é válido.' });
    }
    if (req.body.start_date && req.body.end_date && new Date(req.body.end_date) < new Date(req.body.start_date)) {
      return res.status(400).json({ message: 'A data final deve ser posterior à data inicial.' });
    }
    const allowed = ['user_id', 'title', 'objective', 'start_date', 'end_date', 'notes', 'status'];
    if (req.user.role === 'admin') allowed.push('coach_id');
    const entries = Object.entries(req.body).filter(([key, value]) => allowed.includes(key) && value !== undefined);
    if (!entries.length) return res.status(400).json({ message: 'Nenhum campo válido para atualizar.' });
    const values = entries.map(([, value]) => value || null);
    values.push(req.params.id);
    await db.query(
      `UPDATE weekly_plans SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
      values,
    );
    res.json(await fetchCompletePlan(req.params.id));
  } catch (error) {
    next(error);
  }
};

export const deletePlan = async (req, res, next) => {
  try {
    const plan = await getPlanOwner(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plano não encontrado.' });
    if (!canManagePlan(req.user, plan)) return res.status(403).json({ message: 'Acesso negado.' });
    await db.query('DELETE FROM weekly_plans WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const addDay = async (req, res, next) => {
  try {
    const plan = await getPlanOwner(req.params.planId);
    if (!plan) return res.status(404).json({ message: 'Plano não encontrado.' });
    if (!canManagePlan(req.user, plan)) return res.status(403).json({ message: 'Acesso negado.' });
    const { day_name, focus, notes } = req.body;
    if (!day_name?.trim()) return res.status(400).json({ message: 'O nome do dia é obrigatório.' });
    const [result] = await db.query(
      'INSERT INTO plan_days (plan_id, day_name, focus, notes) VALUES (?, ?, ?, ?)',
      [req.params.planId, day_name.trim(), focus || null, notes || null],
    );
    const [rows] = await db.query('SELECT * FROM plan_days WHERE id = ?', [result.insertId]);
    res.status(201).json({ ...rows[0], exercises: [] });
  } catch (error) {
    next(error);
  }
};

export const addDayExercise = async (req, res, next) => {
  try {
    const [days] = await db.query(
      `SELECT d.id, p.user_id, p.coach_id FROM plan_days d
       JOIN weekly_plans p ON p.id = d.plan_id WHERE d.id = ?`,
      [req.params.dayId],
    );
    if (!days[0]) return res.status(404).json({ message: 'Dia não encontrado.' });
    if (!canManagePlan(req.user, days[0])) return res.status(403).json({ message: 'Acesso negado.' });
    const { exercise_id, sets, reps, rest_time, duration, order_number, notes } = req.body;
    if (!exercise_id) return res.status(400).json({ message: 'Selecione um exercício.' });
    const [result] = await db.query(
      `INSERT INTO plan_day_exercises
       (plan_day_id, exercise_id, sets, reps, rest_time, duration, order_number, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.dayId, exercise_id, sets || null, reps || null, rest_time || null, duration || null, order_number || 1, notes || null],
    );
    const [rows] = await db.query(
      `SELECT pde.*, e.name AS exercise_name, e.category, e.muscle_group, e.video_url
       FROM plan_day_exercises pde JOIN exercises e ON e.id = pde.exercise_id
       WHERE pde.id = ?`,
      [result.insertId],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const removeDayExercise = async (req, res, next) => {
  try {
    const [items] = await db.query(
      `SELECT pde.id, p.user_id, p.coach_id
       FROM plan_day_exercises pde
       JOIN plan_days d ON d.id = pde.plan_day_id
       JOIN weekly_plans p ON p.id = d.plan_id
       WHERE pde.id = ?`,
      [req.params.id],
    );
    if (!items[0]) return res.status(404).json({ message: 'Item não encontrado.' });
    if (!canManagePlan(req.user, items[0])) return res.status(403).json({ message: 'Acesso negado.' });
    await db.query('DELETE FROM plan_day_exercises WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const registerDownload = async (req, res, next) => {
  try {
    const plan = await getPlanOwner(req.params.planId);
    if (!plan) return res.status(404).json({ message: 'Plano não encontrado.' });
    if (!canReadPlan(req.user, plan)) return res.status(403).json({ message: 'Acesso negado.' });
    await db.query('INSERT INTO plan_downloads (user_id, plan_id) VALUES (?, ?)', [
      req.user.role === 'client' ? req.user.id : plan.user_id,
      plan.id,
    ]);
    res.status(201).json({ message: 'Download registado.' });
  } catch (error) {
    next(error);
  }
};
