import bcrypt from 'bcryptjs';
import db from '../config/db.js';
import { generateToken } from '../utils/generateToken.js';

const publicUserFields =
  'id, name, email, role, phone, gender, age, objective, created_at, updated_at';

export const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, gender, age, objective } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      return res.status(400).json({ message: 'Nome, email e senha (mínimo 6 caracteres) são obrigatórios.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length) return res.status(409).json({ message: 'Este email já está registado.' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO users (name, email, password, role, phone, gender, age, objective)
       VALUES (?, ?, ?, 'client', ?, ?, ?, ?)`,
      [name.trim(), normalizedEmail, hash, phone || null, gender || null, age || null, objective || null],
    );
    const [rows] = await db.query(`SELECT ${publicUserFields} FROM users WHERE id = ?`, [result.insertId]);
    res.status(201).json({ user: rows[0], token: generateToken(rows[0]) });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Informe email e senha.' });
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Email ou senha incorretos.' });
    }
    delete user.password;
    res.json({ user, token: generateToken(user) });
  } catch (error) {
    next(error);
  }
};

export const me = (req, res) => res.json(req.user);
