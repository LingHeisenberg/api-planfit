import bcrypt from 'bcryptjs';
import db from '../config/db.js';

const fields = 'id, name, email, role, phone, gender, age, objective, created_at, updated_at';

const canAccess = (actor, id) =>
  ['admin', 'coach'].includes(actor.role) || Number(actor.id) === Number(id);

export const listUsers = async (req, res, next) => {
  try {
    const { role, search } = req.query;
    const params = [];
    const clauses = [];
    if (role && ['admin', 'coach', 'client'].includes(role)) {
      clauses.push('role = ?');
      params.push(role);
    }
    if (search) {
      clauses.push('(name LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await db.query(`SELECT ${fields} FROM users ${where} ORDER BY created_at DESC`, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const listClients = async (_req, res, next) => {
  try {
    const [rows] = await db.query(`SELECT ${fields} FROM users WHERE role = 'client' ORDER BY name`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    if (!canAccess(req.user, req.params.id)) return res.status(403).json({ message: 'Acesso negado.' });
    const [rows] = await db.query(`SELECT ${fields} FROM users WHERE id = ?`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Utilizador não encontrado.' });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role = 'client', phone, gender, age, objective } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      return res.status(400).json({ message: 'Nome, email e senha (mínimo 6 caracteres) são obrigatórios.' });
    }
    const allowedRole = req.user.role === 'admin' && ['admin', 'coach', 'client'].includes(role) ? role : 'client';
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO users (name, email, password, role, phone, gender, age, objective)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), hash, allowedRole, phone || null, gender || null, age || null, objective || null],
    );
    const [rows] = await db.query(`SELECT ${fields} FROM users WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Este email já está registado.' });
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    if (!canAccess(req.user, req.params.id)) return res.status(403).json({ message: 'Acesso negado.' });
    const [targets] = await db.query('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
    if (!targets[0]) return res.status(404).json({ message: 'Utilizador não encontrado.' });
    if (
      req.user.role === 'coach' &&
      targets[0].role !== 'client' &&
      Number(req.user.id) !== Number(req.params.id)
    ) {
      return res.status(403).json({ message: 'Coaches só podem atualizar clientes ou o próprio perfil.' });
    }
    const allowed = ['name', 'email', 'phone', 'gender', 'age', 'objective'];
    if (req.user.role === 'admin') allowed.push('role');
    const entries = Object.entries(req.body).filter(([key, value]) => allowed.includes(key) && value !== undefined);
    if (req.body.password) {
      if (req.body.password.length < 6) return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });
      entries.push(['password', await bcrypt.hash(req.body.password, 10)]);
    }
    if (!entries.length) return res.status(400).json({ message: 'Nenhum campo válido para atualizar.' });
    const values = entries.map(([, value]) => value || null);
    values.push(req.params.id);
    const [result] = await db.query(
      `UPDATE users SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
      values,
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Utilizador não encontrado.' });
    const [rows] = await db.query(`SELECT ${fields} FROM users WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Este email já está registado.' });
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    if (Number(req.user.id) === Number(req.params.id)) {
      return res.status(400).json({ message: 'Não pode remover a própria conta.' });
    }
    const [target] = await db.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
    if (!target[0]) return res.status(404).json({ message: 'Utilizador não encontrado.' });
    if (req.user.role === 'coach' && target[0].role !== 'client') {
      return res.status(403).json({ message: 'Coaches só podem remover clientes.' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'Este utilizador tem dados associados e não pode ser removido.' });
    }
    next(error);
  }
};
