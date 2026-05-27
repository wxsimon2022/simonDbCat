const configDb = require('./database.cjs');

function getAll() {
  return configDb.prepare('SELECT * FROM connections ORDER BY updated_at DESC').all();
}

function getById(id) {
  return configDb.prepare('SELECT * FROM connections WHERE id = ?').get(id);
}

function create(data) {
  const stmt = configDb.prepare(`
    INSERT INTO connections (name, type, host, port, username, password, database)
    VALUES (@name, @type, @host, @port, @username, @password, @database)
  `);
  const result = stmt.run(data);
  return getById(result.lastInsertRowid);
}

function update(id, data) {
  const stmt = configDb.prepare(`
    UPDATE connections SET
      name = @name, type = @type, host = @host, port = @port,
      username = @username, password = @password, database = @database,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  stmt.run({ ...data, id });
  return getById(id);
}

function remove(id) {
  configDb.prepare('DELETE FROM connections WHERE id = ?').run(id);
}

function test(data) {
  const mysql = require('mysql2/promise');
  const conn = mysql.createConnection({
    host: data.host,
    port: data.port,
    user: data.username,
    password: data.password,
    database: data.database || undefined,
    connectTimeout: 5000,
  });
  return conn.then(c => { c.end(); return true; }).catch(e => { throw e; });
}

module.exports = { getAll, getById, create, update, remove, test };
