import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import db from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import exerciseRoutes from './routes/exerciseRoutes.js';
import planRoutes from './routes/planRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors({
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : true,
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || 500;
  const message =
    error.code === 'ER_NO_REFERENCED_ROW_2'
      ? 'Um dos registos associados não existe.'
      : error.code === 'ER_BAD_DB_ERROR'
        ? 'A base de dados ainda não foi criada.'
        : error.message || 'Ocorreu um erro inesperado.';
  res.status(status).json({ message: status === 500 ? 'Erro interno do servidor.' : message });
});

app.listen(port, () => {
  console.log(`PlanFit API disponível em http://localhost:${port}`);
});
