const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const connStore = require('./connections.cjs');
const path = require('path');
const fs = require('fs');

function createApp(distPath) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  const frontendPath = distPath || path.join(__dirname, '..', 'dist');
  if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
    app.use(express.static(frontendPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  // ─── MySQL Helper ──────────────────────────────────
  async function getClient(connId, database) {
    const conf = connStore.getById(Number(connId));
    if (!conf) throw new Error('Connection not found');
    const c = await mysql.createConnection({
      host: String(conf.host || '127.0.0.1'),
      port: Number(conf.port) || 3306,
      user: String(conf.username || 'root'),
      password: String(conf.password || ''),
      connectTimeout: 10000,
    });
    const db = database || conf.database;
    if (db) {
      try { await c.query('USE ' + mysql.escapeId(db)); } catch (useErr) { c.end(); throw new Error('Cannot switch to database "' + db + '": ' + useErr.message); }
    }
    return c;
  }

  function handleError(res, e) {
    console.error('[API Error]', e.message);
    res.status(400).json({ error: e.message });
  }

  // ─── Connection Config CRUD ──────────────────────────
  app.get('/api/connections', (req, res) => res.json(connStore.getAll()));

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
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/connections/:id', (req, res) => {
    try {
      const updated = connStore.update(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: 'Connection not found' });
      const { password, ...safe } = updated;
      res.json(safe);
    } catch (e) { handleError(res, e); }
  });

  app.delete('/api/connections/:id', (req, res) => {
    connStore.remove(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/connections/test', async (req, res) => {
    try {
      await connStore.test(req.body);
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ─── Database & Schema ──────────────────────────────
  app.get('/api/databases/:connId/schemas', async (req, res) => {
    try {
      const c = await getClient(req.params.connId);
      const [rows] = await c.query('SHOW DATABASES');
      await c.end();
      res.json(rows.map(r => ({ name: r.Database })));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/databases/:connId/tables', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const [rows] = await c.query('SHOW TABLES');
      await c.end();
      if (!rows || rows.length === 0) { res.json([]); return; }
      const keys = Object.keys(rows[0]);
      const key = keys[0] || ('Tables_in_' + (req.query.database || ''));
      res.json(rows.map(r => ({ name: String(r[key] || '') })));
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P0: Table Data with Pagination + Edit + Export
  // ══════════════════════════════════════════════════════

  app.get('/api/databases/:connId/tables/:table', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const safeTable = mysql.escapeId(req.params.table);
      const limit = Math.min(parseInt(req.query.limit) || 100, 5000);
      const offset = parseInt(req.query.offset) || 0;
      const sortCol = req.query.sort ? mysql.escapeId(req.query.sort) : null;
      const sortDir = req.query.order === 'desc' ? 'DESC' : 'ASC';

      const [cols] = await c.query('DESCRIBE ' + safeTable);
      const [[countRow]] = await c.query('SELECT COUNT(*) as total FROM ' + safeTable);
      const total = countRow.total;

      let sql = 'SELECT * FROM ' + safeTable;
      if (sortCol) sql += ' ORDER BY ' + sortCol + ' ' + sortDir;
      sql += ' LIMIT ' + limit + ' OFFSET ' + offset;

      const [rows] = await c.query(sql);
      await c.end();
      res.json({ columns: cols, rows, total, limit, offset });
    } catch (e) { handleError(res, e); }
  });

  // Insert row
  app.post('/api/databases/:connId/tables/:table/data', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const safeTable = mysql.escapeId(req.params.table);
      const data = req.body.data || req.body;
      if (!data || Object.keys(data).length === 0) throw new Error('No data provided');
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map(() => '?').join(', ');
      const cols = keys.map(k => mysql.escapeId(k)).join(', ');
      const [result] = await c.query('INSERT INTO ' + safeTable + ' (' + cols + ') VALUES (' + placeholders + ')', values);
      await c.end();
      res.json({ ok: true, insertId: result.insertId, affectedRows: result.affectedRows });
    } catch (e) { handleError(res, e); }
  });

  // Update row
  app.put('/api/databases/:connId/tables/:table/data', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const safeTable = mysql.escapeId(req.params.table);
      const { where, data } = req.body;
      if (!data || Object.keys(data).length === 0) throw new Error('No data to update');
      if (!where || Object.keys(where).length === 0) throw new Error('No WHERE clause');
      const setClause = Object.keys(data).map(k => mysql.escapeId(k) + ' = ?').join(', ');
      const whereClause = Object.keys(where).map(k => mysql.escapeId(k) + ' = ?').join(' AND ');
      const params = [...Object.values(data), ...Object.values(where)];
      const [result] = await c.query('UPDATE ' + safeTable + ' SET ' + setClause + ' WHERE ' + whereClause, params);
      await c.end();
      res.json({ ok: true, affectedRows: result.affectedRows });
    } catch (e) { handleError(res, e); }
  });

  // Delete row(s)
  app.delete('/api/databases/:connId/tables/:table/data', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const safeTable = mysql.escapeId(req.params.table);
      const where = req.body.where || req.query;
      if (!where || Object.keys(where).length === 0) throw new Error('No WHERE clause');
      const whereClause = Object.keys(where).map(k => mysql.escapeId(k) + ' = ?').join(' AND ');
      const [result] = await c.query('DELETE FROM ' + safeTable + ' WHERE ' + whereClause, Object.values(where));
      await c.end();
      res.json({ ok: true, affectedRows: result.affectedRows });
    } catch (e) { handleError(res, e); }
  });

  // Export table data
  app.post('/api/databases/:connId/tables/:table/export', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const safeTable = mysql.escapeId(req.params.table);
      const format = req.body.format || 'csv';
      const [rows] = await c.query('SELECT * FROM ' + safeTable + ' LIMIT ' + (parseInt(req.body.limit) || 10000));
      await c.end();
      if (!rows.length) return res.json({ data: '', format });

      const cols = Object.keys(rows[0]);
      let data = '';
      if (format === 'csv') {
        data = cols.join(',') + '\n' + rows.map(r => cols.map(c => {
          const v = r[c]; if (v === null || v === undefined) return 'NULL';
          const s = String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',')).join('\n');
      } else if (format === 'json') {
        data = JSON.stringify(rows, null, 2);
      } else if (format === 'sql') {
        data = rows.map(r => {
          const vals = cols.map(c => {
            const v = r[c];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return v;
            return "'" + String(v).replace(/'/g, "\\'") + "'";
          });
          return 'INSERT INTO ' + safeTable + ' (' + cols.map(c => '`' + c + '`').join(', ') + ') VALUES (' + vals.join(', ') + ');';
        }).join('\n');
      }
      res.json({ data, format, total: rows.length, columns: cols });
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P0: Query with Export
  // ══════════════════════════════════════════════════════

  app.post('/api/databases/:connId/query', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.body.database);
      const [rows, fields] = await c.query(req.body.sql);
      await c.end();
      const cols = fields ? fields.map(f => ({ Field: f.name, Type: f.type })) : [];
      res.json({ columns: cols, rows, affectedRows: rows?.affectedRows || 0 });
    } catch (e) { handleError(res, e); }
  });

  // Export query results
  app.post('/api/databases/:connId/query/export', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.body.database);
      const format = req.body.format || 'csv';
      const [rows, fields] = await c.query(req.body.sql);
      await c.end();
      const cols = fields ? fields.map(f => f.name) : (rows.length ? Object.keys(rows[0]) : []);
      let data = '';
      if (!rows.length) return res.json({ data: '', format, columns: cols, total: 0 });

      if (format === 'csv') {
        data = cols.join(',') + '\n' + rows.map(r => cols.map(c => {
          const v = r[c]; if (v === null || v === undefined) return 'NULL';
          const s = String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',')).join('\n');
      } else if (format === 'json') {
        data = JSON.stringify(rows, null, 2);
      } else if (format === 'sql') {
        const tableName = req.body.tableName || 'exported_table';
        data = rows.map(r => {
          const vals = cols.map(c => {
            const v = r[c];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return v;
            return "'" + String(v).replace(/'/g, "\\'") + "'";
          });
          return 'INSERT INTO `' + tableName + '` (' + cols.map(c => '`' + c + '`').join(', ') + ') VALUES (' + vals.join(', ') + ');';
        }).join('\n');
      }
      res.json({ data, format, columns: cols, total: rows.length });
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P1: Index Management
  // ══════════════════════════════════════════════════════

  app.get('/api/databases/:connId/tables/:table/indexes', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const [rows] = await c.query('SHOW INDEX FROM ' + mysql.escapeId(req.params.table));
      await c.end();
      // Group by Key_name
      const indexMap = {};
      for (const r of rows) {
        if (!indexMap[r.Key_name]) indexMap[r.Key_name] = { keyName: r.Key_name, unique: !r.Non_unique, columns: [], indexType: r.Index_type };
        indexMap[r.Key_name].columns.push({ seq: r.Seq_in_index, column: r.Column_name });
      }
      res.json(Object.values(indexMap));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/databases/:connId/tables/:table/indexes', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const { indexName, columns, unique, indexType } = req.body;
      if (!indexName || !columns || !columns.length) throw new Error('indexName and columns required');
      const uniqueStr = unique ? 'UNIQUE' : '';
      const cols = columns.map((col) => mysql.escapeId(col)).join(', ');
      await c.query('CREATE ' + uniqueStr + ' INDEX ' + mysql.escapeId(indexName) + ' ON ' + mysql.escapeId(req.params.table) + ' (' + cols + ') USING ' + (indexType || 'BTREE'));
      await c.end();
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.delete('/api/databases/:connId/tables/:table/indexes/:name', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      await c.query('DROP INDEX ' + mysql.escapeId(req.params.name) + ' ON ' + mysql.escapeId(req.params.table));
      await c.end();
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P1: Foreign Key Management
  // ══════════════════════════════════════════════════════

  app.get('/api/databases/:connId/tables/:table/foreign-keys', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const db = req.query.database;
      const [rows] = await c.query(
        'SELECT COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME ' +
        'FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE ' +
        'WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL',
        [db, req.params.table]
      );
      // Also get UPDATE_RULE and DELETE_RULE
      const [refRows] = await c.query(
        'SELECT CONSTRAINT_NAME, UPDATE_RULE, DELETE_RULE ' +
        'FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS ' +
        'WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ?',
        [db, req.params.table]
      );
      await c.end();
      const ruleMap = {};
      for (const r of refRows) ruleMap[r.CONSTRAINT_NAME] = r;
      res.json(rows.map(r => ({
        columnName: r.COLUMN_NAME,
        constraintName: r.CONSTRAINT_NAME,
        refTable: r.REFERENCED_TABLE_NAME,
        refColumn: r.REFERENCED_COLUMN_NAME,
        onUpdate: ruleMap[r.CONSTRAINT_NAME]?.UPDATE_RULE || 'NO ACTION',
        onDelete: ruleMap[r.CONSTRAINT_NAME]?.DELETE_RULE || 'NO ACTION',
      })));
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P1: Views
  // ══════════════════════════════════════════════════════

  app.get('/api/databases/:connId/views', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const [rows] = await c.query('SHOW FULL TABLES WHERE Table_type = "VIEW"');
      await c.end();
      if (!rows.length) return res.json([]);
      const key = Object.keys(rows[0])[0];
      res.json(rows.map(r => ({ name: String(r[key] || '') })));
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/databases/:connId/views/:view', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const [rows] = await c.query('SHOW CREATE VIEW ' + mysql.escapeId(req.params.view));
      await c.end();
      res.json({ name: req.params.view, createView: rows[0]?.['Create View'] || '' });
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P1: Stored Procedures & Functions
  // ══════════════════════════════════════════════════════

  app.get('/api/databases/:connId/routines', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const db = req.query.database;
      const [rows] = await c.query(
        'SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION, CREATED, LAST_ALTERED ' +
        'FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ?', [db]);
      await c.end();
      res.json(rows.map(r => ({
        name: r.ROUTINE_NAME, type: r.ROUTINE_TYPE, definition: r.ROUTINE_DEFINITION,
        created: r.CREATED, altered: r.LAST_ALTERED,
      })));
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P1: Triggers
  // ══════════════════════════════════════════════════════

  app.get('/api/databases/:connId/triggers', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const [rows] = await c.query('SHOW TRIGGERS');
      await c.end();
      res.json(rows.map(r => ({
        name: r.Trigger, event: r.Event, table: r.Table, timing: r.Timing, statement: r.Statement, created: r.Created,
      })));
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P1: Events
  // ══════════════════════════════════════════════════════

  app.get('/api/databases/:connId/events', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const [rows] = await c.query('SHOW EVENTS');
      await c.end();
      res.json(rows.map(r => ({
        name: r.Name, definer: r.Definer, type: r.Interval_Value + ' ' + r.Interval_Field || 'ONE TIME',
        status: r.Status, starts: r.Starts, ends: r.Ends,
      })));
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P1: Column Management (Table Designer)
  // ══════════════════════════════════════════════════════

  app.post('/api/databases/:connId/tables/:table/columns', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const { name, type, nullable, default: defVal, comment, after } = req.body;
      if (!name || !type) throw new Error('Column name and type required');
      let sql = 'ALTER TABLE ' + mysql.escapeId(req.params.table) + ' ADD COLUMN ' + mysql.escapeId(name) + ' ' + type;
      if (!nullable) sql += ' NOT NULL';
      if (defVal !== undefined && defVal !== null) sql += " DEFAULT '" + String(defVal).replace(/'/g, "\\'") + "'";
      if (comment) sql += " COMMENT '" + String(comment).replace(/'/g, "\\'") + "'";
      if (after) sql += ' AFTER ' + mysql.escapeId(after);
      await c.query(sql);
      await c.end();
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/databases/:connId/tables/:table/columns/:column', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      const { name, type, nullable, default: defVal, comment } = req.body;
      const newName = name || req.params.column;
      let sql = 'ALTER TABLE ' + mysql.escapeId(req.params.table) + ' CHANGE COLUMN ' + mysql.escapeId(req.params.column) + ' ' + mysql.escapeId(newName) + ' ' + (type || ' VARCHAR(255)');
      if (!nullable) sql += ' NOT NULL';
      if (defVal !== undefined) sql += " DEFAULT '" + String(defVal).replace(/'/g, "\\'") + "'";
      else sql += ' DEFAULT NULL';
      if (comment) sql += " COMMENT '" + String(comment).replace(/'/g, "\\'") + "'";
      await c.query(sql);
      await c.end();
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  app.delete('/api/databases/:connId/tables/:table/columns/:column', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.query.database);
      await c.query('ALTER TABLE ' + mysql.escapeId(req.params.table) + ' DROP COLUMN ' + mysql.escapeId(req.params.column));
      await c.end();
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P2: EXPLAIN
  // ══════════════════════════════════════════════════════

  app.post('/api/databases/:connId/explain', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.body.database);
      const [rows] = await c.query('EXPLAIN ' + req.body.sql);
      await c.end();
      res.json({ plan: rows });
    } catch (e) { handleError(res, e); }
  });

  // ══════════════════════════════════════════════════════
  // P2: Multi-query (split by ;)
  // ══════════════════════════════════════════════════════

  app.post('/api/databases/:connId/query-multi', async (req, res) => {
    try {
      const c = await getClient(req.params.connId, req.body.database);
      const statements = req.body.sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      const results = [];
      for (const sql of statements) {
        try {
          const [rows, fields] = await c.query(sql);
          const cols = fields ? fields.map(f => ({ Field: f.name, Type: f.type })) : [];
          results.push({ sql, columns: cols, rows, affectedRows: rows?.affectedRows || 0, success: true });
        } catch (e) {
          results.push({ sql, error: e.message, success: false });
        }
      }
      await c.end();
      res.json({ results });
    } catch (e) { handleError(res, e); }
  });

  return app;
}

function startServer(port = 3100, distPath) {
  return new Promise((resolve, reject) => {
    const app = createApp(distPath);
    const server = app.listen(port, () => {
      console.log(`✅ simonDbCat server running at http://localhost:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

if (require.main === module) startServer(3100);
module.exports = { createApp, startServer };
