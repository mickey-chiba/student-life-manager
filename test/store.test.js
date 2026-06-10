const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../lib/store");

const uniqueName = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

test("a new user gets a fully seeded data space", () => {
  const user = store.createUser(uniqueName("seed"), "secret123");
  const data = store.forUser(user.id).read();
  assert.ok(Array.isArray(data.classes));
  assert.ok(Array.isArray(data.assignments));
  assert.ok(Array.isArray(data.tests));
  assert.ok(Array.isArray(data.events));
  assert.ok(Array.isArray(data.settings.periods));
  assert.ok(data.settings.periods.length > 0);
  assert.ok([5, 10, 15, 30, 60].includes(data.settings.scheduleStep));
  assert.ok(Array.isArray(data.settings.quickTimes));
});

test("login succeeds with the right password and fails otherwise", () => {
  const name = uniqueName("login");
  store.createUser(name, "pw1234");
  assert.ok(store.verifyUser(name, "pw1234"));
  assert.equal(store.verifyUser(name, "wrong-password"), null);
  assert.equal(store.verifyUser("does-not-exist", "pw1234"), null);
});

test("the same name cannot be registered twice", () => {
  const name = uniqueName("dup");
  store.createUser(name, "pw1234");
  assert.throws(() => store.createUser(name, "another"), /USER_EXISTS/);
});

test("each user's data is isolated from others", () => {
  const a = store.forUser(store.createUser(uniqueName("iso-a"), "pw1234").id);
  const b = store.forUser(store.createUser(uniqueName("iso-b"), "pw1234").id);
  const marker = uniqueName("only-for-a");
  a.save("assignments", { title: marker, subject: "x", deadline: "2030-01-01T09:00", progress: 0, status: "未着手", memo: "" });
  assert.ok(a.list("assignments").some((item) => item.title === marker));
  assert.ok(!b.list("assignments").some((item) => item.title === marker));
});
