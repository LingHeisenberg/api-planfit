import db from '../config/db.js';

const writable = ['name', 'category', 'muscle_group', 'description', 'video_url'];

export const listExercises = async (req, res, next) => {
  try {
    const search = req.query.search?.trim();
    const [rows] = search
      ? await db.query(
          `SELECT * FROM exercises
           WHERE name LIKE ? OR category LIKE ? OR muscle_group LIKE ?
           ORDER BY name`,
          [`%${search}%`, `%${search}%`, `%${search}%`],
        )
      : await db.query('SELECT * FROM exercises ORDER BY name');
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const getExercise = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM exercises WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Exercício não encontrado.' });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const createExercise = async (req, res, next) => {
  try {
    const { name, category, muscle_group, description, video_url } = req.body;
    if (!name?.trim() || !category?.trim() || !muscle_group?.trim()) {
      return res.status(400).json({ message: 'Nome, categoria e grupo muscular são obrigatórios.' });
    }
    const [result] = await db.query(
      'INSERT INTO exercises (name, category, muscle_group, description, video_url) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), category.trim(), muscle_group.trim(), description || null, video_url || null],
    );
    const [rows] = await db.query('SELECT * FROM exercises WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateExercise = async (req, res, next) => {
  try {
    const entries = Object.entries(req.body).filter(([key, value]) => writable.includes(key) && value !== undefined);
    if (!entries.length) return res.status(400).json({ message: 'Nenhum campo válido para atualizar.' });
    const values = entries.map(([, value]) => value || null);
    values.push(req.params.id);
    const [result] = await db.query(
      `UPDATE exercises SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
      values,
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Exercício não encontrado.' });
    const [rows] = await db.query('SELECT * FROM exercises WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const deleteExercise = async (req, res, next) => {
  try {
    const [result] = await db.query('DELETE FROM exercises WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Exercício não encontrado.' });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'O exercício está incluído num plano e não pode ser removido.' });
    }
    next(error);
  }
};
