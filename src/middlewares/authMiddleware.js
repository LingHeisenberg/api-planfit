import jwt from 'jsonwebtoken';
import db from '../config/db.js';

export const protect = async (req, res, next) => {
  try {
    const [type, token] = (req.headers.authorization || '').split(' ');
    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Autenticação necessária.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'planfit_secret_key');
    const [rows] = await db.query(
      'SELECT id, name, email, role, phone, gender, age, objective, created_at, updated_at FROM users WHERE id = ?',
      [decoded.id],
    );
    if (!rows[0]) return res.status(401).json({ message: 'Utilizador inválido.' });
    req.user = rows[0];
    next();
  } catch (error) {
    return res.status(401).json({
      message: error.name === 'TokenExpiredError' ? 'A sessão expirou.' : 'Token inválido.',
    });
  }
};
