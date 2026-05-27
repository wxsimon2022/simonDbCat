const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const connStore = require('./connections.cjs');
const configDb = require('./database.cjs');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // --- Connection Config CRUD ---
  app.get('/api/connections', (req, res) => {
    res.json(connStore.getAll());
  });

  app.get('/api/connections/:id', (req, res) => {
    const conn = connStore.getById(Number(req.params.id));
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    const { password, ...safe } = conn;
    res.json(safe);
  });

  app.post('/api/connections', (req, res) => {
    try {
      const created = connStore.create(req.body);
      const { password, ...safe } = created;
      res.json(safe);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/connections/:id', (req, res) => {
    try {
      const updated = connStore.update(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: 'Connection not found' });
      const { password, ...safe } = updated;
      res.json(safe);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/connections/:id', (req, res) => {
    connStore.remove(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/connections/test', async (req, res) => {
    try {
      await connStore.test(req.body);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // --- Database Operations ---
  async function getClient(connId, database) {
    const conf = connStore.getById(Number(connId));
    if (!conf) throw new Error('Connection not found');
    return mysql.createConnection({
      host: conf.host,
      port: conf.port,
      user: conf.username,
      password: conf.password,
      database: database || conf.database || undefined,
      connectTimeout: 10000,
    });
  }

  app.get('/api/databases/:connId/tables', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const [rows] = await c.query('SHOW TABLES');
      await c.end();
      const key = Object.keys(rows[0] || {})[0] || `Tables_in_${rows[0]?.['Tables_in_'] || 'db'}`;
      res.json(rows.map(r => ({ name: r[key] })));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/databases/:connId/tables/:table', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const [cols] = await c.query(`DESCRIBE \`${req.params.table}\``);
      const [rows] = await c.query(`SELECT * FROM \`${req.params.table}\` LIMIT 200`);
      await c.end();
      res.json({ columns: cols, rows, total: rows.length });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/databases/:connId/query', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.body.database);
      const sql = req.body.sql;
      const [rows, fields] = await c.query(sql);
      await c.end();
      const cols = fields ? fields.map(f => ({ Field: f.name, Type: f.type })) : [];
      res.json({ columns: cols, rows, affectedRows: rows?.affectedRows || 0 });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/databases/:connId/schemas', async (req, res) => {
    try {
      const c = await getClient(req.params.connId);
      const [rows] = await c.query('SHOW DATABASES');
      await c.end();
      const key = 'Database';
      res.json(rows.map(r => ({ name: r[key] })));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return app;
}

function startServer(port = 3100) {
  return new Promise((resolve, reject) => {
    const app = createApp();
    const server = app.listen(port, () => {
      console.log(`✅ simonDbCat server running at http://localhost:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// Standalone mode
if (require.main === module) {
  startServer(3100);
}

module.exports = { createApp, startServer };
