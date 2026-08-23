import Fastify from 'fastify';
import { pool } from './db/pool.js';

const app = Fastify({
  logger: true
});

app.get('/api/health', async () => {
  const result = await pool.query('SELECT 1');

  return {
    status: 'ok',
    database: result.rowCount === 1 ? 'connected' : 'unknown'
  };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;

    await app.listen({
      port,
      host: '0.0.0.0'
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
