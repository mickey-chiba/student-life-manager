const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const dataFile = process.env.DATA_FILE || path.join(__dirname, "..", "data", "store.json");
const dataDir = path.dirname(dataFile);
const defaultPeriods = [
  { number: 1, startTime: "09:00", endTime: "10:30" },
  { number: 2, startTime: "10:40", endTime: "12:10" },
  { number: 3, startTime: "13:00", endTime: "14:30" },
  { number: 4, startTime: "14:40", endTime: "16:10" },
  { number: 5, startTime: "16:20", endTime: "17:50" },
  { number: 6, startTime: "18:00", endTime: "19:30" }
];

const clone = (value) => JSON.parse(JSON.stringify(value));

function seedUserData() {
  return { settings: { periods: clone(defaultPeriods), scheduleStep: 15, quickTimes: [], hourlyWage: 1100, nightBonusRate: 25, transportPerShift: 0 }, classes: [], assignments: [], tests: [], events: [] };
}

function normalize(userData = {}) {
  userData.settings ||= { periods: clone(defaultPeriods) };
  userData.settings.periods ||= clone(defaultPeriods);
  userData.settings.scheduleStep ||= 15;
  userData.settings.quickTimes ||= [];
  userData.settings.hourlyWage = Number.isFinite(Number(userData.settings.hourlyWage)) ? Number(userData.settings.hourlyWage) : 1100;
  userData.settings.nightBonusRate = Number.isFinite(Number(userData.settings.nightBonusRate)) ? Number(userData.settings.nightBonusRate) : 25;
  userData.settings.transportPerShift = Number.isFinite(Number(userData.settings.transportPerShift)) ? Number(userData.settings.transportPerShift) : 0;
  userData.settings.quickTimes = userData.settings.quickTimes.map((item) => ({ title: item.title || item.label, category: item.category || "その他", startTime: item.startTime, endTime: item.endTime }));
  userData.classes ||= [];
  userData.assignments ||= [];
  userData.tests ||= [];
  userData.events ||= [];
  userData.events = userData.events.map((item) => ({ ...item, breaks: Array.isArray(item.breaks) ? item.breaks : [] }));
  return userData;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

const publicUser = (user) => user ? { id: user.id, name: user.name } : null;

function createJsonBackend() {
  const emptyDB = () => ({ users: [], data: {} });
  const ensureStore = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(emptyDB(), null, 2));
  };
  const readDB = () => {
    ensureStore();
    const db = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    db.users = Array.isArray(db.users) ? db.users : [];
    db.data = db.data && typeof db.data === "object" ? db.data : {};
    return db;
  };
  const writeDB = (db) => fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));
  return {
    async findUserByName(name) { const target = String(name).trim().toLowerCase(); return readDB().users.find((user) => user.name.toLowerCase() === target) || null; },
    async createUser(name, password) {
      const db = readDB(); const trimmed = String(name).trim();
      if (db.users.some((user) => user.name.toLowerCase() === trimmed.toLowerCase())) throw Object.assign(new Error("USER_EXISTS"), { code: "USER_EXISTS" });
      const { salt, hash } = hashPassword(password); const user = { id: crypto.randomUUID(), name: trimmed, salt, hash, createdAt: new Date().toISOString() };
      db.users.push(user); db.data[user.id] = seedUserData(); writeDB(db); return publicUser(user);
    },
    async getUser(id) { return publicUser(readDB().users.find((user) => user.id === id)); },
    async userCount() { return readDB().users.length; },
    async readUserData(userId) { const db = readDB(); db.data[userId] ||= seedUserData(); writeDB(db); return normalize(db.data[userId]); },
    async writeUserData(userId, data) { const db = readDB(); db.data[userId] = data; writeDB(db); }
  };
}

function createPostgresBackend() {
  const { Pool } = require("pg");
  const ssl = process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : process.env.PGSSLMODE === "disable" ? false : undefined;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
  const initialized = pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY, name TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_data (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const ready = async () => initialized;
  return {
    async findUserByName(name) { await ready(); const { rows } = await pool.query("SELECT * FROM users WHERE name_key = $1", [String(name).trim().toLowerCase()]); return rows[0] || null; },
    async createUser(name, password) {
      await ready(); const trimmed = String(name).trim(); const { salt, hash } = hashPassword(password); const id = crypto.randomUUID(); const client = await pool.connect();
      try { await client.query("BEGIN"); await client.query("INSERT INTO users(id,name,name_key,salt,password_hash) VALUES($1,$2,$3,$4,$5)", [id, trimmed, trimmed.toLowerCase(), salt, hash]); await client.query("INSERT INTO user_data(user_id,payload) VALUES($1,$2::jsonb)", [id, JSON.stringify(seedUserData())]); await client.query("COMMIT"); return { id, name: trimmed }; }
      catch (error) { await client.query("ROLLBACK"); if (error.code === "23505") throw Object.assign(new Error("USER_EXISTS"), { code: "USER_EXISTS" }); throw error; }
      finally { client.release(); }
    },
    async getUser(id) { await ready(); const { rows } = await pool.query("SELECT id,name FROM users WHERE id=$1", [id]); return publicUser(rows[0]); },
    async userCount() { await ready(); const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM users"); return rows[0].count; },
    async readUserData(userId) { await ready(); const { rows } = await pool.query("SELECT payload FROM user_data WHERE user_id=$1", [userId]); if (rows[0]) return normalize(rows[0].payload); const data = seedUserData(); await pool.query("INSERT INTO user_data(user_id,payload) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO NOTHING", [userId, JSON.stringify(data)]); return data; },
    async writeUserData(userId, data) { await ready(); await pool.query("INSERT INTO user_data(user_id,payload,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(user_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()", [userId, JSON.stringify(data)]); }
  };
}

const backend = process.env.DATABASE_URL ? createPostgresBackend() : createJsonBackend();

async function verifyUser(name, password) {
  const user = await backend.findUserByName(name); if (!user) return null;
  const { hash } = hashPassword(password, user.salt); const a = Buffer.from(hash, "hex"); const b = Buffer.from(user.hash || user.password_hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; return publicUser(user);
}

function forUser(userId) {
  return {
    async read() { return backend.readUserData(userId); },
    async list(collection) { return (await backend.readUserData(userId))[collection] || []; },
    async find(collection, id) { return (await this.list(collection)).find((item) => item.id === id); },
    async save(collection, item) { const data = await backend.readUserData(userId); const record = { ...item, id: item.id || crypto.randomUUID() }; const index = data[collection].findIndex((entry) => entry.id === record.id); if (index >= 0) data[collection][index] = record; else data[collection].push(record); await backend.writeUserData(userId, data); return record; },
    async remove(collection, id) { const data = await backend.readUserData(userId); data[collection] = data[collection].filter((item) => item.id !== id); await backend.writeUserData(userId, data); },
    async saveSettings(settings) { const data = await backend.readUserData(userId); data.settings = { ...data.settings, ...settings }; await backend.writeUserData(userId, data); }
  };
}

module.exports = { forUser, createUser: backend.createUser, verifyUser, findUserByName: backend.findUserByName, getUser: backend.getUser, userCount: backend.userCount, usingPostgres: Boolean(process.env.DATABASE_URL) };
