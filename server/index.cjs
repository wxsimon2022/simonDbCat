const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const connStore = require('./connections.cjs');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ─── Debug ──────────────────────────────────────────
  app.get('/api/debug/echo', (req, res) => {
    res.json({ query: req.query, url: req.url });
  });

  // ─── Connection Config CRUD ──────────────────────────
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

  // ─── MySQL Helper ──────────────────────────────────
  async function getClient(connId, database) {
    const conf = connStore.getById(Number(connId));
    if (!conf) throw new Error('Connection not found');
    const c = await mysql.createConnection({
      host: conf.host,
      port: conf.port,
      user: conf.username,
      password: conf.password,
      connectTimeout: 10000,
    });
    const db = database || conf.database;
    if (db) {
      try { await c.query('USE ' + mysql.escapeId(db)); } catch (useErr) { c.end(); throw new Error('Cannot switch to database "' + db + '": ' + useErr.message); }
    }
    return c;
  }

  // ─── Database API ──────────────────────────────────
  app.get('/api/databases/:connId/schemas', async (req, res) => {
    try {
      const c = await getClient(req.params.connId);
      const [rows] = await c.query('SHOW DATABASES');
      await c.end();
      res.json(rows.map(r => ({ name: r.Database })));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/databases/:connId/tables', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database || req.query.db);
      const [rows] = await c.query('SHOW TABLES');
      await c.end();
      const key = Object.keys(rows[0] || {})[0] || 'Tables_in_' + (req.query.database || '');
      res.json(rows.map(r => ({ name: r[key] })));
    } catch (e) {
      res.status(400).json({ error: e.message, database: req.query.database, connId: req.params.connId });
    }
  });

  app.get('/api/databases/:connId/tables/:table', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database || req.query.db);
      const safeTable = mysql.escapeId(req.params.table);
      const [cols] = await c.query('DESCRIBE ' + safeTable);
      const [rows] = await c.query('SELECT * FROM ' + safeTable + ' LIMIT 200');
      await c.end();
      res.json({ columns: cols, rows, total: rows.length });
    } catch (e) {
      res.status(400).json({ error: e.message, database: req.body.database, connId: req.params.connId });
    }
  });

  app.post('/api/databases/:connId/query', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.body.database);
      const [rows, fields] = await c.query(req.body.sql);
      await c.end();
      const cols = fields ? fields.map(f => ({ Field: f.name, Type: f.type })) : [];
      res.json({ columns: cols, rows, affectedRows: rows?.affectedRows || 0 });
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

if (require.main === module) {
  startServer(3100);
}

module.exports = { createApp, startServer };
