const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../lib/store");

test("store exposes all required collections", () => {
  const data = store.read();
  assert.ok(Array.isArray(data.classes));
  assert.ok(Array.isArray(data.assignments));
  assert.ok(Array.isArray(data.tests));
  assert.ok(Array.isArray(data.events));
  assert.ok(Array.isArray(data.settings.periods));
  assert.ok(data.settings.periods.length > 0);
  assert.ok([5, 10, 15, 30, 60].includes(data.settings.scheduleStep));
  assert.ok(Array.isArray(data.settings.quickTimes));
});
