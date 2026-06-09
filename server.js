const path = require("node:path");
const express = require("express");
const store = require("./lib/store");

const app = express();
const PORT = process.env.PORT || 3000;
const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
const categories = ["学習", "アルバイト", "サークル", "遊び", "就職活動", "その他"];
const categoryColors = {
  学習: "#5267df", アルバイト: "#e38a46", サークル: "#28a892",
  遊び: "#e3658c", 就職活動: "#8c61c8", その他: "#7c8798"
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  const settings = store.read().settings;
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

app.get("/", (req, res) => {
  const data = store.read();
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

app.get("/timetable", (req, res) => {
  const classes = store.list("classes");
  res.render("timetable", { title: "時間割", classes, editItem: req.query.edit ? store.find("classes", req.query.edit) : null });
});
app.post("/timetable", (req, res) => {
  const startPeriod = Number(req.body.startPeriod);
  const endPeriod = Number(req.body.endPeriod);
  if (endPeriod < startPeriod) return res.status(400).send("終了時限は開始時限以降にしてください。");
  store.save("classes", { id: req.body.id, subject: req.body.subject, weekday: req.body.weekday, period: String(startPeriod), startPeriod, endPeriod, room: req.body.room, teacher: req.body.teacher, memo: req.body.memo });
  res.redirect("/timetable");
});
app.post("/timetable/:id/move", (req, res) => {
  const lesson = store.find("classes", req.params.id);
  if (!lesson) return res.status(404).json({ message: "授業が見つかりません。" });

  const weekday = req.body.weekday;
  const startPeriod = Number(req.body.startPeriod);
  const periodCount = Number(lesson.endPeriod || lesson.period) - Number(lesson.startPeriod || lesson.period) + 1;
  const endPeriod = startPeriod + periodCount - 1;
  const periodLimit = store.read().settings.periods.length;
  if (!weekdays.slice(0, 6).includes(weekday) || startPeriod < 1 || endPeriod > periodLimit) {
    return res.status(400).json({ message: "複数コマ分を含めると、時限の範囲を超えてしまいます。" });
  }

  const overlaps = store.list("classes").some((item) => {
    if (item.id === lesson.id || item.weekday !== weekday) return false;
    const itemStart = Number(item.startPeriod || item.period);
    const itemEnd = Number(item.endPeriod || item.period);
    return startPeriod <= itemEnd && endPeriod >= itemStart;
  });
  if (overlaps) return res.status(409).json({ message: "移動先の時間には、すでに別の授業があります。" });

  store.save("classes", { ...lesson, weekday, period: String(startPeriod), startPeriod, endPeriod });
  res.json({ ok: true });
});

function listRoute(pathname, collection, title, dateField) {
  app.get(pathname, (req, res) => {
    const items = store.list(collection).sort((a, b) => new Date(a[dateField]) - new Date(b[dateField]));
    res.render(collection, {
      title,
      items,
      editItem: req.query.edit ? store.find(collection, req.query.edit) : null,
      classes: collection === "tests" ? store.list("classes") : []
    });
  });
}
listRoute("/assignments", "assignments", "課題管理", "deadline");
listRoute("/tests", "tests", "テスト管理", "examAt");
listRoute("/events", "events", "予定管理", "startAt");

app.post("/assignments", (req, res) => {
  store.save("assignments", { id: req.body.id, title: req.body.title, subject: req.body.subject, deadline: req.body.deadline, progress: Number(req.body.progress || 0), status: req.body.status, memo: req.body.memo });
  res.redirect("/assignments");
});
app.post("/tests", (req, res) => {
  store.save("tests", { id: req.body.id, subject: req.body.subject, examAt: req.body.examAt, scope: req.body.scope, memo: req.body.memo });
  res.redirect("/tests");
});
app.post("/events", (req, res) => {
  const scheduleStep = store.read().settings.scheduleStep;
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
  store.save("events", { id: req.body.id, title: req.body.title, startAt, endAt, category: req.body.category, memo: req.body.memo });
  res.redirect("/events");
});

app.post("/:collection/:id/delete", (req, res) => {
  const routes = { classes: "timetable", assignments: "assignments", tests: "tests", events: "events" };
  if (!routes[req.params.collection]) return res.sendStatus(404);
  store.remove(req.params.collection, req.params.id);
  res.redirect(`/${routes[req.params.collection]}`);
});

app.get("/calendar", (req, res) => {
  const data = store.read();
  const base = req.query.month && /^\d{4}-\d{2}$/.test(req.query.month) ? new Date(`${req.query.month}-01T00:00:00`) : new Date();
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
  res.render("calendar", { title: "カレンダー", days, items, base, prev, next, today: dateKey(new Date()) });
});

app.get("/analytics", (req, res) => {
  const events = store.list("events");
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  res.render("analytics", { title: "時間分析", daily: analysis(events, dayStart, dayEnd), weekly: analysis(events, weekStart, weekEnd), monthly: analysis(events, monthStart, monthEnd) });
});

app.get("/settings", (req, res) => res.render("settings", { title: "設定", periods: store.read().settings.periods }));
app.post("/settings/periods", (req, res) => {
  const starts = Array.isArray(req.body.startTime) ? req.body.startTime : [req.body.startTime];
  const ends = Array.isArray(req.body.endTime) ? req.body.endTime : [req.body.endTime];
  const periods = starts.map((startTime, index) => ({ number: index + 1, startTime, endTime: ends[index] })).filter((item) => item.startTime && item.endTime);
  if (!periods.length || periods.some((item) => item.endTime <= item.startTime)) return res.status(400).send("各時限の終了時刻は開始時刻より後にしてください。");
  const latestUsedPeriod = Math.max(0, ...store.list("classes").map((item) => Number(item.endPeriod || item.period)));
  if (periods.length < latestUsedPeriod) return res.status(400).send(`${latestUsedPeriod}限を使用している授業があります。先にその授業を変更してから時限数を減らしてください。`);
  store.saveSettings({ periods });
  res.redirect("/settings");
});
app.post("/settings/schedule-step", (req, res) => {
  const scheduleStep = Number(req.body.scheduleStep);
  if (![5, 10, 15, 30, 60].includes(scheduleStep)) return res.status(400).send("利用できない時刻の刻み幅です。");
  store.saveSettings({ scheduleStep });
  res.redirect("/settings");
});
app.post("/settings/quick-times", (req, res) => {
  const titles = Array.isArray(req.body.quickTitle) ? req.body.quickTitle : [req.body.quickTitle];
  const quickCategories = Array.isArray(req.body.quickCategory) ? req.body.quickCategory : [req.body.quickCategory];
  const starts = Array.isArray(req.body.quickStartTime) ? req.body.quickStartTime : [req.body.quickStartTime];
  const ends = Array.isArray(req.body.quickEndTime) ? req.body.quickEndTime : [req.body.quickEndTime];
  const quickTimes = titles.map((title, index) => ({ title: title?.trim(), category: quickCategories[index], startTime: starts[index], endTime: ends[index] })).filter((item) => item.title && item.startTime && item.endTime);
  if (quickTimes.some((item) => !categories.includes(item.category))) return res.status(400).send("利用できないカテゴリが含まれています。");
  if (!quickTimes.length || quickTimes.some((item) => item.endTime === item.startTime)) return res.status(400).send("開始時刻と終了時刻は異なる時刻にしてください。終了が開始より早い場合は翌日の終了として扱われます。");
  store.saveSettings({ quickTimes });
  res.redirect("/settings");
});

app.use((req, res) => res.status(404).render("not-found", { title: "ページが見つかりません" }));

app.listen(PORT, () => console.log(`Student Life Manager: http://localhost:${PORT}`));

module.exports = app;
