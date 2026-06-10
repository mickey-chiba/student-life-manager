const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "store.json");
const defaultPeriods = [
  { number: 1, startTime: "09:00", endTime: "10:30" },
  { number: 2, startTime: "10:40", endTime: "12:10" },
  { number: 3, startTime: "13:00", endTime: "14:30" },
  { number: 4, startTime: "14:40", endTime: "16:10" },
  { number: 5, startTime: "16:20", endTime: "17:50" },
  { number: 6, startTime: "18:00", endTime: "19:30" }
];
const defaultQuickTimes = [
  { title: "午前の学習", category: "学習", startTime: "09:00", endTime: "12:00" },
  { title: "午後の学習", category: "学習", startTime: "13:00", endTime: "17:00" },
  { title: "アルバイト", category: "アルバイト", startTime: "17:00", endTime: "21:00" },
  { title: "夜の予定", category: "その他", startTime: "18:00", endTime: "22:00" }
];

function localDate(offsetDays = 0, hour = 9, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

// 新しいユーザーが登録したとき、最初に入っているサンプルデータ。
function seedUserData() {
  return {
    settings: { periods: defaultPeriods, scheduleStep: 15, quickTimes: defaultQuickTimes },
    classes: [
      { id: crypto.randomUUID(), subject: "Webアプリケーション開発", weekday: "月", period: "2", room: "情報演習室A", teacher: "山田先生", memo: "Node.js / Express" },
      { id: crypto.randomUUID(), subject: "データベース基礎", weekday: "火", period: "3", room: "講義室204", teacher: "佐藤先生", memo: "" },
      { id: crypto.randomUUID(), subject: "英語コミュニケーション", weekday: "木", period: "1", room: "講義室101", teacher: "Smith先生", memo: "教科書を持参" }
    ],
    assignments: [
      { id: crypto.randomUUID(), title: "Express課題レポート", subject: "Webアプリケーション開発", deadline: localDate(2, 23, 59), progress: 65, status: "作業中", memo: "画面キャプチャも提出" },
      { id: crypto.randomUUID(), title: "正規化演習", subject: "データベース基礎", deadline: localDate(5, 17, 0), progress: 0, status: "未着手", memo: "" }
    ],
    tests: [
      { id: crypto.randomUUID(), subject: "データベース基礎", examAt: localDate(9, 13, 0), scope: "第1章〜第5章", memo: "教科書持ち込み可" }
    ],
    events: [
      { id: crypto.randomUUID(), title: "カフェのシフト", startAt: localDate(0, 17, 0), endAt: localDate(0, 21, 30), category: "アルバイト", memo: "" },
      { id: crypto.randomUUID(), title: "図書館で課題", startAt: localDate(1, 15, 0), endAt: localDate(1, 17, 0), category: "学習", memo: "Express課題" },
      { id: crypto.randomUUID(), title: "サークル定例会", startAt: localDate(3, 18, 0), endAt: localDate(3, 20, 0), category: "サークル", memo: "" },
      { id: crypto.randomUUID(), title: "友人と映画", startAt: localDate(6, 13, 0), endAt: localDate(6, 16, 0), category: "遊び", memo: "" }
    ]
  };
}

function emptyDB() {
  return { users: [], data: {}, secret: crypto.randomBytes(32).toString("hex") };
}

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(emptyDB(), null, 2));
  }
}

function readDB() {
  ensureStore();
  const db = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  db.users ||= [];
  db.data ||= {};
  db.secret ||= crypto.randomBytes(32).toString("hex");
  return db;
}

function writeDB(db) {
  fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));
}

// --- アカウント管理 ---

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function findUserByName(name) {
  const target = String(name).trim().toLowerCase();
  return readDB().users.find((u) => u.name.toLowerCase() === target) || null;
}

function publicUser(user) {
  return user ? { id: user.id, name: user.name } : null;
}

function createUser(name, password) {
  const db = readDB();
  const trimmed = String(name).trim();
  if (db.users.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) {
    const error = new Error("USER_EXISTS");
    error.code = "USER_EXISTS";
    throw error;
  }
  const { salt, hash } = hashPassword(password);
  const user = { id: crypto.randomUUID(), name: trimmed, salt, hash, createdAt: new Date().toISOString() };
  db.users.push(user);
  db.data[user.id] = seedUserData();
  writeDB(db);
  return publicUser(user);
}

function verifyUser(name, password) {
  const user = findUserByName(name);
  if (!user) return null;
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(user.hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return publicUser(user);
}

function getUser(id) {
  return publicUser(readDB().users.find((u) => u.id === id));
}

function userCount() {
  return readDB().users.length;
}

// --- ユーザー専用データへのアクセス ---

function normalize(userData) {
  userData.settings ||= { periods: defaultPeriods };
  userData.settings.periods ||= defaultPeriods;
  userData.settings.scheduleStep ||= 15;
  userData.settings.quickTimes ||= defaultQuickTimes;
  userData.settings.quickTimes = userData.settings.quickTimes.map((item) => ({
    title: item.title || item.label,
    category: item.category || "その他",
    startTime: item.startTime,
    endTime: item.endTime
  }));
  userData.classes ||= [];
  userData.assignments ||= [];
  userData.tests ||= [];
  userData.events ||= [];
  return userData;
}

function forUser(userId) {
  function read() {
    const db = readDB();
    db.data[userId] ||= seedUserData();
    return normalize(db.data[userId]);
  }

  function persist(userData) {
    const db = readDB();
    db.data[userId] = userData;
    writeDB(db);
  }

  const api = {
    read,
    list(collection) {
      return read()[collection] || [];
    },
    find(collection, id) {
      return api.list(collection).find((item) => item.id === id);
    },
    save(collection, item) {
      const data = read();
      const record = { ...item, id: item.id || crypto.randomUUID() };
      const index = data[collection].findIndex((entry) => entry.id === record.id);
      if (index >= 0) data[collection][index] = record;
      else data[collection].push(record);
      persist(data);
      return record;
    },
    remove(collection, id) {
      const data = read();
      data[collection] = data[collection].filter((item) => item.id !== id);
      persist(data);
    },
    saveSettings(settings) {
      const data = read();
      data.settings = { ...data.settings, ...settings };
      persist(data);
    }
  };
  return api;
}

function getSecret() {
  return process.env.SESSION_SECRET || readDB().secret;
}

module.exports = { forUser, createUser, verifyUser, findUserByName, getUser, userCount, getSecret };
