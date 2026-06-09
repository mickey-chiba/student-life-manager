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

function seedData() {
  return {
    settings: { periods: defaultPeriods },
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

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(seedData(), null, 2));
  }
}

function read() {
  ensureStore();
  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  data.settings ||= { periods: defaultPeriods };
  data.settings.periods ||= defaultPeriods;
  data.settings.scheduleStep ||= 15;
  data.settings.quickTimes ||= defaultQuickTimes;
  data.settings.quickTimes = data.settings.quickTimes.map((item) => ({
    title: item.title || item.label,
    category: item.category || "その他",
    startTime: item.startTime,
    endTime: item.endTime
  }));
  return data;
}

function write(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function list(collection) {
  return read()[collection] || [];
}

function find(collection, id) {
  return list(collection).find((item) => item.id === id);
}

function save(collection, item) {
  const data = read();
  const record = { ...item, id: item.id || crypto.randomUUID() };
  const index = data[collection].findIndex((entry) => entry.id === record.id);
  if (index >= 0) data[collection][index] = record;
  else data[collection].push(record);
  write(data);
  return record;
}

function remove(collection, id) {
  const data = read();
  data[collection] = data[collection].filter((item) => item.id !== id);
  write(data);
}

function saveSettings(settings) {
  const data = read();
  data.settings = { ...data.settings, ...settings };
  write(data);
}

module.exports = { read, list, find, save, remove, saveSettings };
