const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const store = require("./lib/store");
const auth = require("./lib/auth");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("本番環境では32文字以上のSESSION_SECRETが必要です。");
}
if (isProduction && !process.env.DATABASE_URL) {
  throw new Error("本番環境ではPostgreSQLのDATABASE_URLが必要です。");
}
const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
const categories = ["学習", "アルバイト", "サークル", "遊び", "就職活動", "その他"];
const categoryColors = {
  学習: "#5267df", アルバイト: "#e38a46", サークル: "#28a892",
  遊び: "#e3658c", 就職活動: "#8c61c8", その他: "#7c8798"
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
if (isProduction) app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use((req, res, next) => {
  if (isProduction && req.get("x-forwarded-proto") !== "https") return res.redirect(301, `https://${req.get("host")}${req.originalUrl}`);
  next();
});
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (req, res) => res.json({ ok: true, database: store.usingPostgres ? "postgresql" : "json" }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "ログイン試行回数が多すぎます。15分ほど待ってから再度お試しください。"
});

// 1. ログイン中のユーザーをCookieから判定して各リクエストに付与する。
app.use(async (req, res, next) => {
  const user = await auth.currentUser(req);
  req.user = user;
  res.locals.currentUser = user;
  next();
});

// 2. ログイン不要のページ（ログイン・新規登録・ログアウト）。
app.get("/login", async (req, res) => {
  if (req.user) return res.redirect("/");
  res.render("login", { title: "ログイン", mode: "login", error: null, name: "" });
});
app.post("/login", loginLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 50);
  const user = await store.verifyUser(name, req.body.password || "");
  if (!user) {
    return res.status(401).render("login", { title: "ログイン", mode: "login", error: "名前またはパスワードが正しくありません。", name });
  }
  auth.login(res, user.id);
  res.redirect("/");
});
app.get("/register", async (req, res) => {
  if (req.user) return res.redirect("/");
  res.render("login", { title: "新規登録", mode: "register", error: null, name: "" });
});
app.post("/register", loginLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 50);
  const password = req.body.password || "";
  if (name.length < 1 || password.length < 8 || password.length > 200) {
    return res.status(400).render("login", { title: "新規登録", mode: "register", error: "名前を入力し、パスワードは8文字以上にしてください。", name });
  }
  let user;
  try {
    user = await store.createUser(name, password);
  } catch (error) {
    if (error.code === "USER_EXISTS") {
      return res.status(409).render("login", { title: "新規登録", mode: "register", error: "その名前はすでに使われています。別の名前にしてください。", name });
    }
    throw error;
  }
  auth.login(res, user.id);
  res.redirect("/");
});
app.post("/logout", async (req, res) => {
  auth.logout(res);
  res.redirect("/login");
});

// 3. ここから先はログイン必須。以降のルートは req.store（本人専用データ）を使う。
app.use(async (req, res, next) => {
  if (!req.user) return res.redirect("/login");
  req.store = store.forUser(req.user.id);
  next();
});

// 4. テンプレート共通の値（ログイン後のみ実行される）。
app.use(async (req, res, next) => {
  const settings = (await req.store.read()).settings;
  const schoolPeriods = settings.periods;
  res.locals.path = req.path;
  res.locals.weekdays = weekdays;
  res.locals.categories = categories;
  res.locals.schoolPeriods = schoolPeriods;
  res.locals.scheduleStep = settings.scheduleStep;
  res.locals.quickTimes = settings.quickTimes;
  res.locals.timeOptions = createTimeOptions(settings.scheduleStep);
  res.locals.categoryColors = categoryColors;
  res.locals.formatDate = formatDate;
  res.locals.formatTime = formatTime;
  res.locals.formatDateTime = formatDateTime;
  res.locals.localInputParts = localInputParts;
  res.locals.snapTime = snapTime;
  next();
});

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

class InputError extends Error {}
function assertInput(condition, message) {
  if (!condition) throw new InputError(message);
}
function cleanText(value, max, required = false) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  assertInput(!required || text.length > 0, "必須項目を入力してください。");
  assertInput(text.length <= max, `入力内容は${max}文字以内にしてください。`);
  return text;
}
const validId = (value) => !value || /^[0-9a-f-]{36}$/i.test(value);
const validDateTime = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "") && !Number.isNaN(new Date(value).getTime());
const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || "");

function formatDate(value) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short" }).format(date) : "";
}

function formatTime(value) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date) : "";
}

function formatDateTime(value) {
  return value ? `${formatDate(value)} ${formatTime(value)}` : "";
}

function createTimeOptions(step) {
  const options = [];
  for (let minutes = 0; minutes <= 1440; minutes += step) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    options.push({ value: minutes === 1440 ? "24:00" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, minutes });
  }
  return options;
}

function localInputParts(value) {
  if (!value) return { date: dateKey(new Date()), time: "09:00" };
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

function snapTime(time, step, direction = "round") {
  if (time === "24:00") return time;
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const snapped = Math[direction](minutes / step) * step;
  if (snapped >= 1440) return "24:00";
  return `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`;
}

function combineDateAndTime(date, time) {
  if (time !== "24:00") return `${date}T${time}`;
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return `${dateKey(next)}T00:00`;
}

function nextDateKey(date) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return dateKey(next);
}

function dateKey(value) {
  const date = parseDate(value);
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthKey(value) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date = new Date()) {
  const result = startOfDay(date);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function durationHours(event) {
  return Math.max(0, (new Date(event.endAt) - new Date(event.startAt)) / 3600000);
}

function analysis(events, start, end) {
  const totals = Object.fromEntries(categories.map((category) => [category, 0]));
  events.forEach((event) => {
    const eventDate = new Date(event.startAt);
    if (eventDate >= start && eventDate < end) totals[event.category] += durationHours(event);
  });
  return totals;
}

function calendarItems(data) {
  return [
    ...data.events.map((item) => ({ ...item, date: item.startAt, type: item.category, title: item.title, color: categoryColors[item.category] })),
    ...data.assignments.map((item) => ({ ...item, date: item.deadline, type: "課題", title: item.title, color: "#d85858" })),
    ...data.tests.map((item) => ({ ...item, date: item.examAt, type: "テスト", title: item.subject, color: "#7756bd" }))
  ];
}

app.get("/", async (req, res) => {
  const data = await req.store.read();
  const today = dateKey(new Date());
  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 7);
  const weekStart = startOfWeek();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const todayWeekday = weekdays[(now.getDay() + 6) % 7];
  res.render("dashboard", {
    title: "ダッシュボード",
    todayClasses: data.classes.filter((item) => item.weekday === todayWeekday).sort((a, b) => a.period - b.period),
    todayEvents: data.events.filter((item) => dateKey(item.startAt) === today).sort((a, b) => new Date(a.startAt) - new Date(b.startAt)),
    upcomingAssignments: data.assignments.filter((item) => item.status !== "完了" && new Date(item.deadline) >= now && new Date(item.deadline) <= soon).sort((a, b) => new Date(a.deadline) - new Date(b.deadline)),
    upcomingTests: data.tests.filter((item) => new Date(item.examAt) >= now).sort((a, b) => new Date(a.examAt) - new Date(b.examAt)).slice(0, 3),
    totals: analysis(data.events, weekStart, weekEnd)
  });
});

app.get("/timetable", async (req, res) => {
  const classes = await req.store.list("classes");
  res.render("timetable", { title: "時間割", classes, editItem: null, formMode: false });
});
app.get("/timetable/new", async (req, res) => {
  res.render("timetable", { title: "授業を登録", classes: [], editItem: null, formMode: true });
});
app.get("/timetable/:id/edit", async (req, res) => {
  assertInput(validId(req.params.id), "授業IDが正しくありません。");
  const editItem = await req.store.find("classes", req.params.id);
  if (!editItem) return res.sendStatus(404);
  res.render("timetable", { title: "授業を編集", classes: [], editItem, formMode: true });
});
app.post("/timetable", async (req, res) => {
  assertInput(validId(req.body.id), "授業IDが正しくありません。");
  const subject = cleanText(req.body.subject, 100, true);
  const weekday = cleanText(req.body.weekday, 1, true);
  const room = cleanText(req.body.room, 100);
  const teacher = cleanText(req.body.teacher, 100);
  const memo = cleanText(req.body.memo, 1000);
  const startPeriod = Number(req.body.startPeriod);
  const endPeriod = Number(req.body.endPeriod);
  const periodLimit = (await req.store.read()).settings.periods.length;
  assertInput(weekdays.includes(weekday), "曜日が正しくありません。");
  assertInput(Number.isInteger(startPeriod) && Number.isInteger(endPeriod) && startPeriod >= 1 && endPeriod <= periodLimit, "時限が正しくありません。");
  assertInput(endPeriod >= startPeriod, "終了時限は開始時限以降にしてください。");
  await req.store.save("classes", { id: req.body.id, subject, weekday, period: String(startPeriod), startPeriod, endPeriod, room, teacher, memo });
  res.redirect("/timetable");
});
app.post("/timetable/:id/move", async (req, res) => {
  assertInput(validId(req.params.id), "授業IDが正しくありません。");
  const lesson = await req.store.find("classes", req.params.id);
  if (!lesson) return res.status(404).json({ message: "授業が見つかりません。" });

  const weekday = req.body.weekday;
  const startPeriod = Number(req.body.startPeriod);
  const periodCount = Number(lesson.endPeriod || lesson.period) - Number(lesson.startPeriod || lesson.period) + 1;
  const endPeriod = startPeriod + periodCount - 1;
  const periodLimit = (await req.store.read()).settings.periods.length;
  if (!weekdays.slice(0, 6).includes(weekday) || startPeriod < 1 || endPeriod > periodLimit) {
    return res.status(400).json({ message: "複数コマ分を含めると、時限の範囲を超えてしまいます。" });
  }

  const overlaps = (await req.store.list("classes")).some((item) => {
    if (item.id === lesson.id || item.weekday !== weekday) return false;
    const itemStart = Number(item.startPeriod || item.period);
    const itemEnd = Number(item.endPeriod || item.period);
    return startPeriod <= itemEnd && endPeriod >= itemStart;
  });
  if (overlaps) return res.status(409).json({ message: "移動先の時間には、すでに別の授業があります。" });

  await req.store.save("classes", { ...lesson, weekday, period: String(startPeriod), startPeriod, endPeriod });
  res.json({ ok: true });
});

function listRoute(pathname, collection, title, dateField, singularTitle) {
  app.get(pathname, async (req, res) => {
    const items = (await req.store.list(collection)).sort((a, b) => new Date(a[dateField]) - new Date(b[dateField]));
    res.render(collection, { title, items, editItem: null, formMode: false, classes: [] });
  });
  app.get(`${pathname}/new`, async (req, res) => {
    res.render(collection, { title: `${singularTitle}を登録`, items: [], editItem: null, formMode: true, classes: collection === "tests" ? await req.store.list("classes") : [] });
  });
  app.get(`${pathname}/:id/edit`, async (req, res) => {
    assertInput(validId(req.params.id), `${singularTitle}IDが正しくありません。`);
    const editItem = await req.store.find(collection, req.params.id);
    if (!editItem) return res.sendStatus(404);
    res.render(collection, { title: `${singularTitle}を編集`, items: [], editItem, formMode: true, classes: collection === "tests" ? await req.store.list("classes") : [] });
  });
}
listRoute("/assignments", "assignments", "課題管理", "deadline", "課題");
listRoute("/tests", "tests", "テスト管理", "examAt", "テスト");
listRoute("/events", "events", "予定管理", "startAt", "予定");

app.post("/assignments", async (req, res) => {
  const progress = Number(req.body.progress || 0);
  assertInput(validId(req.body.id), "課題IDが正しくありません。");
  assertInput(validDateTime(req.body.deadline), "締切日時が正しくありません。");
  assertInput(Number.isInteger(progress) && progress >= 0 && progress <= 100, "進捗率は0から100の整数で入力してください。");
  assertInput(["未着手", "作業中", "完了"].includes(req.body.status), "課題の状態が正しくありません。");
  await req.store.save("assignments", {
    id: req.body.id,
    title: cleanText(req.body.title, 120, true),
    subject: cleanText(req.body.subject, 100, true),
    deadline: req.body.deadline,
    progress,
    status: req.body.status,
    memo: cleanText(req.body.memo, 1000)
  });
  res.redirect("/assignments");
});
app.post("/tests", async (req, res) => {
  assertInput(validId(req.body.id), "テストIDが正しくありません。");
  assertInput(validDateTime(req.body.examAt), "試験日時が正しくありません。");
  await req.store.save("tests", {
    id: req.body.id,
    subject: cleanText(req.body.subject, 100, true),
    examAt: req.body.examAt,
    scope: cleanText(req.body.scope, 1000),
    memo: cleanText(req.body.memo, 1000)
  });
  res.redirect("/tests");
});
app.post("/events", async (req, res) => {
  assertInput(validId(req.body.id), "予定IDが正しくありません。");
  assertInput(categories.includes(req.body.category), "カテゴリが正しくありません。");
  assertInput(validTime(req.body.startTime) || req.body.startTime === "24:00", "開始時刻が正しくありません。");
  assertInput(validTime(req.body.endTime) || req.body.endTime === "24:00", "終了時刻が正しくありません。");
  const scheduleStep = (await req.store.read()).settings.scheduleStep;
  const toMinutes = (time) => time === "24:00" ? 1440 : Number(time?.slice(0, 2)) * 60 + Number(time?.slice(3, 5));
  const startMinutes = toMinutes(req.body.startTime);
  const endMinutes = toMinutes(req.body.endTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.eventDate || "") || !Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes % scheduleStep || endMinutes % scheduleStep) {
    return res.status(400).send(`${scheduleStep}分単位で時刻を指定してください。`);
  }
  const startAt = combineDateAndTime(req.body.eventDate, req.body.startTime);
  const endDate = req.body.nextDay === "1" ? nextDateKey(req.body.eventDate) : req.body.eventDate;
  const endAt = combineDateAndTime(endDate, req.body.endTime);
  if (new Date(endAt) <= new Date(startAt)) return res.status(400).send("終了時刻は開始時刻より後にしてください。");
  await req.store.save("events", {
    id: req.body.id,
    title: cleanText(req.body.title, 120, true),
    startAt,
    endAt,
    category: req.body.category,
    memo: cleanText(req.body.memo, 1000)
  });
  res.redirect("/events");
});

app.post("/:collection/:id/delete", async (req, res) => {
  const routes = { classes: "timetable", assignments: "assignments", tests: "tests", events: "events" };
  if (!routes[req.params.collection] || !validId(req.params.id)) return res.sendStatus(404);
  await req.store.remove(req.params.collection, req.params.id);
  res.redirect(`/${routes[req.params.collection]}`);
});

app.get("/calendar", async (req, res) => {
  const data = await req.store.read();
  const base = req.query.month && /^\d{4}-\d{2}$/.test(req.query.month) ? new Date(`${req.query.month}-01T00:00:00`) : new Date();
  const requestedDate = req.query.date || "";
  const selectedKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && !Number.isNaN(new Date(`${requestedDate}T00:00:00`).getTime()) ? requestedDate : null;
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + index);
    return { date, key: dateKey(date), currentMonth: date.getMonth() === base.getMonth() };
  });
  const items = calendarItems(data).reduce((grouped, item) => {
    (grouped[dateKey(item.date)] ||= []).push(item);
    return grouped;
  }, {});
  const prev = monthKey(new Date(base.getFullYear(), base.getMonth() - 1, 1));
  const next = monthKey(new Date(base.getFullYear(), base.getMonth() + 1, 1));
  let selectedDate = null;
  let daySchedule = [];
  if (selectedKey) {
    selectedDate = new Date(`${selectedKey}T00:00:00`);
    const dayEnd = new Date(selectedDate);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const selectedWeekday = weekdays[(selectedDate.getDay() + 6) % 7];
    const periods = data.settings.periods;
    const periodTime = (number, edge) => periods.find((period) => period.number === Number(number))?.[edge] || "";
    daySchedule = [
      ...data.classes.filter((item) => item.weekday === selectedWeekday).map((item) => ({
        kind: "授業",
        title: item.subject,
        detail: [item.room, item.teacher].filter(Boolean).join(" · "),
        startTime: periodTime(item.startPeriod || item.period, "startTime"),
        endTime: periodTime(item.endPeriod || item.period, "endTime"),
        color: categoryColors.学習,
        editUrl: `/timetable/${item.id}/edit`
      })),
      ...data.events.filter((item) => new Date(item.startAt) < dayEnd && new Date(item.endAt) > selectedDate).map((item) => ({
        kind: item.category,
        title: item.title,
        detail: item.memo,
        startTime: new Date(item.startAt) < selectedDate ? "00:00" : item.startAt.slice(11, 16),
        endTime: new Date(item.endAt) > dayEnd ? "24:00" : item.endAt.slice(11, 16),
        color: categoryColors[item.category],
        editUrl: `/events/${item.id}/edit`
      })),
      ...data.tests.filter((item) => dateKey(item.examAt) === selectedKey).map((item) => ({
        kind: "テスト",
        title: item.subject,
        detail: item.scope,
        startTime: item.examAt.slice(11, 16),
        endTime: "",
        color: "#7756bd",
        editUrl: `/tests/${item.id}/edit`
      })),
      ...data.assignments.filter((item) => dateKey(item.deadline) === selectedKey).map((item) => ({
        kind: "課題締切",
        title: item.title,
        detail: item.subject,
        startTime: item.deadline.slice(11, 16),
        endTime: "",
        color: "#d85858",
        editUrl: `/assignments/${item.id}/edit`
      }))
    ].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  res.render("calendar", { title: "カレンダー", days, items, base, prev, next, today: dateKey(new Date()), selectedKey, selectedDate, daySchedule });
});

app.get("/analytics", async (req, res) => {
  const events = await req.store.list("events");
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  res.render("analytics", { title: "時間分析", daily: analysis(events, dayStart, dayEnd), weekly: analysis(events, weekStart, weekEnd), monthly: analysis(events, monthStart, monthEnd) });
});

app.get("/settings", async (req, res) => res.render("settings", { title: "設定", periods: (await req.store.read()).settings.periods }));
app.post("/settings/periods", async (req, res) => {
  const starts = Array.isArray(req.body.startTime) ? req.body.startTime : [req.body.startTime];
  const ends = Array.isArray(req.body.endTime) ? req.body.endTime : [req.body.endTime];
  const periods = starts.map((startTime, index) => ({ number: index + 1, startTime, endTime: ends[index] })).filter((item) => item.startTime && item.endTime);
  if (!periods.length || periods.length > 15 || periods.some((item) => !validTime(item.startTime) || !validTime(item.endTime) || item.endTime <= item.startTime)) {
    return res.status(400).send("時限は15個以内で、各終了時刻を開始時刻より後にしてください。");
  }
  const latestUsedPeriod = Math.max(0, ...(await req.store.list("classes")).map((item) => Number(item.endPeriod || item.period)));
  if (periods.length < latestUsedPeriod) return res.status(400).send(`${latestUsedPeriod}限を使用している授業があります。先にその授業を変更してから時限数を減らしてください。`);
  await req.store.saveSettings({ periods });
  res.redirect("/settings");
});
app.post("/settings/schedule-step", async (req, res) => {
  const scheduleStep = Number(req.body.scheduleStep);
  if (![5, 10, 15, 30, 60].includes(scheduleStep)) return res.status(400).send("利用できない時刻の刻み幅です。");
  await req.store.saveSettings({ scheduleStep });
  res.redirect("/settings");
});
app.post("/settings/quick-times", async (req, res) => {
  const titles = Array.isArray(req.body.quickTitle) ? req.body.quickTitle : [req.body.quickTitle];
  const quickCategories = Array.isArray(req.body.quickCategory) ? req.body.quickCategory : [req.body.quickCategory];
  const starts = Array.isArray(req.body.quickStartTime) ? req.body.quickStartTime : [req.body.quickStartTime];
  const ends = Array.isArray(req.body.quickEndTime) ? req.body.quickEndTime : [req.body.quickEndTime];
  const quickTimes = titles.map((title, index) => ({
    title: cleanText(title, 100),
    category: quickCategories[index],
    startTime: starts[index],
    endTime: ends[index]
  })).filter((item) => item.title && item.startTime && item.endTime);
  if (quickTimes.length > 12) return res.status(400).send("よく使う時間帯は12個以内にしてください。");
  if (quickTimes.some((item) => !categories.includes(item.category) || !(validTime(item.startTime) || item.startTime === "24:00") || !(validTime(item.endTime) || item.endTime === "24:00"))) {
    return res.status(400).send("利用できないカテゴリまたは時刻が含まれています。");
  }
  if (!quickTimes.length || quickTimes.some((item) => item.endTime === item.startTime)) return res.status(400).send("開始時刻と終了時刻は異なる時刻にしてください。終了が開始より早い場合は翌日の終了として扱われます。");
  await req.store.saveSettings({ quickTimes });
  res.redirect("/settings");
});

app.use((req, res) => res.status(404).render("not-found", { title: "ページが見つかりません" }));

app.use((error, req, res, next) => {
  if (error instanceof InputError) return res.status(400).send(error.message);
  console.error(error);
  res.status(500).send("サーバーで問題が発生しました。");
});

app.listen(PORT, () => console.log(`Student Life Manager: http://localhost:${PORT}`));

module.exports = app;
