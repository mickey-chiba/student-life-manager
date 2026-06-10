const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

process.env.DATA_FILE = path.join(os.tmpdir(), `student-life-manager-test-${process.pid}.json`);
const store = require("../lib/store");

test.after(() => fs.rmSync(process.env.DATA_FILE, { force: true }));

const uniqueName = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

test("a new user starts with empty schedule data", async () => {
  const user = await store.createUser(uniqueName("seed"), "secret123");
  const data = await store.forUser(user.id).read();
  assert.deepEqual(data.classes, []);
  assert.deepEqual(data.assignments, []);
  assert.deepEqual(data.tests, []);
  assert.deepEqual(data.events, []);
  assert.ok(Array.isArray(data.settings.periods));
  assert.ok(data.settings.periods.length > 0);
  assert.ok([5, 10, 15, 30, 60].includes(data.settings.scheduleStep));
  assert.deepEqual(data.settings.quickTimes, []);
});

test("login succeeds with the right password and fails otherwise", async () => {
  const name = uniqueName("login");
  await store.createUser(name, "pw1234");
  assert.ok(await store.verifyUser(name, "pw1234"));
  assert.equal(await store.verifyUser(name, "wrong-password"), null);
  assert.equal(await store.verifyUser("does-not-exist", "pw1234"), null);
});

test("the same name cannot be registered twice", async () => {
  const name = uniqueName("dup");
  await store.createUser(name, "pw1234");
  await assert.rejects(() => store.createUser(name, "another"), /USER_EXISTS/);
});

test("each user's data is isolated from others", async () => {
  const a = store.forUser((await store.createUser(uniqueName("iso-a"), "pw1234")).id);
  const b = store.forUser((await store.createUser(uniqueName("iso-b"), "pw1234")).id);
  const marker = uniqueName("only-for-a");
  await a.save("assignments", { title: marker, subject: "x", deadline: "2030-01-01T09:00", progress: 0, status: "未着手", memo: "" });
  assert.ok((await a.list("assignments")).some((item) => item.title === marker));
  assert.ok(!(await b.list("assignments")).some((item) => item.title === marker));
});
