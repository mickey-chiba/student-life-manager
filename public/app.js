const menu = document.querySelector(".menu-button");
menu?.addEventListener("click", () => document.body.classList.toggle("menu-open"));
document.querySelectorAll("[data-confirm]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});

const classStartPeriod = document.querySelector("[data-class-start-period]");
const classEndPeriod = document.querySelector("[data-class-end-period]");
classStartPeriod?.addEventListener("change", () => {
  if (Number(classEndPeriod.value) < Number(classStartPeriod.value)) classEndPeriod.value = classStartPeriod.value;
});

const testClassSelect = document.querySelector("[data-test-class-select]");
const testDateTime = document.querySelector("[data-test-datetime]");
testClassSelect?.addEventListener("change", () => {
  const startTime = testClassSelect.selectedOptions[0]?.dataset.start;
  if (!startTime) return;
  const date = testDateTime.value ? testDateTime.value.slice(0, 10) : new Date().toLocaleDateString("sv-SE");
  testDateTime.value = `${date}T${startTime}`;
});

const periodList = document.querySelector("[data-period-list]");
const updatePeriodNumbers = () => periodList?.querySelectorAll("[data-period-number]").forEach((item, index) => { item.textContent = index + 1; });
document.querySelector("[data-add-period]")?.addEventListener("click", () => {
  const last = periodList.querySelector(".period-row:last-child");
  if (!last || periodList.children.length >= 15) return;
  const row = last.cloneNode(true);
  row.querySelectorAll("input").forEach(input => { input.value = ""; });
  periodList.append(row);
  updatePeriodNumbers();
});
periodList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-period]");
  if (!button || periodList.children.length === 1) return;
  button.closest(".period-row").remove();
  updatePeriodNumbers();
});

const quickTimeList = document.querySelector("[data-quick-time-list]");
document.querySelector("[data-add-quick-time]")?.addEventListener("click", () => {
  const last = quickTimeList.querySelector(".quick-time-row:last-child");
  if (!last || quickTimeList.children.length >= 12) return;
  const row = last.cloneNode(true);
  row.querySelectorAll("input").forEach((input) => { input.value = ""; });
  quickTimeList.append(row);
});
quickTimeList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-quick-time]");
  if (!button || quickTimeList.children.length === 1) return;
  button.closest(".quick-time-row").remove();
});

let draggedClassId = null;
document.querySelectorAll("[data-drag-class]").forEach((card) => {
  card.addEventListener("dragstart", (event) => {
    draggedClassId = card.dataset.dragClass;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedClassId);
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => {
    draggedClassId = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".drop-target").forEach((cell) => cell.classList.remove("drop-target"));
  });
});

document.querySelectorAll("[data-drop-weekday]").forEach((cell) => {
  cell.addEventListener("dragover", (event) => {
    if (!draggedClassId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    cell.classList.add("drop-target");
  });
  cell.addEventListener("dragleave", () => cell.classList.remove("drop-target"));
  cell.addEventListener("drop", async (event) => {
    event.preventDefault();
    cell.classList.remove("drop-target");
    const classId = draggedClassId || event.dataTransfer.getData("text/plain");
    if (!classId) return;
    const response = await fetch(`/timetable/${classId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday: cell.dataset.dropWeekday, startPeriod: Number(cell.dataset.dropPeriod) })
    });
    const result = await response.json();
    if (!response.ok) return window.alert(result.message || "授業を移動できませんでした。");
    window.location.reload();
  });
});

const dayTimeline = document.querySelector("[data-day-timeline]");
if (dayTimeline) {
  const track = dayTimeline.querySelector("[data-day-track]");
  const block = dayTimeline.querySelector("[data-day-block]");
  const nextDayTimeline = dayTimeline.querySelector("[data-next-day-timeline]");
  const nextDayBlock = dayTimeline.querySelector("[data-next-day-block]");
  const label = dayTimeline.querySelector("[data-time-label]");
  const startSelect = document.querySelector("[data-event-start]");
  const endSelect = document.querySelector("[data-event-end]");
  const nextDayInput = document.querySelector("[data-event-next-day]");
  const nextDayToggle = document.querySelector("[data-next-day-toggle]");
  const durationPicker = document.querySelector("[data-duration-picker]");
  const durationSummary = document.querySelector("[data-duration-summary]");
  const endSummary = document.querySelector("[data-end-summary]");
  const categorySelect = document.querySelector("[data-event-category]");
  const titleInput = document.querySelector("[data-event-title]");
  const step = Number(dayTimeline.dataset.step);
  let drag = null;

  const timeToMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const minutesToTime = (minutes) => {
    const clock = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`;
  };
  const formatEnd = (minutes) => `${minutes >= 1440 ? "翌 " : ""}${minutesToTime(minutes)}`;
  const snap = (minutes) => Math.round(minutes / step) * step;
  const getTimes = () => ({
    start: timeToMinutes(startSelect.value),
    end: timeToMinutes(endSelect.value) + (nextDayInput.value === "1" ? 1440 : 0)
  });
  const setTimes = (start, end) => {
    const safeStart = Math.max(0, Math.min(1440 - step, snap(start)));
    const safeEnd = Math.max(safeStart + step, Math.min(safeStart + 1440, snap(end)));
    startSelect.value = minutesToTime(safeStart);
    endSelect.value = minutesToTime(safeEnd);
    nextDayInput.value = safeEnd >= 1440 ? "1" : "0";
    nextDayToggle.checked = safeEnd >= 1440;
    renderTimeline();
  };
  const renderTimeline = () => {
    const { start, end } = getTimes();
    const duration = end - start;
    const currentDayEnd = Math.min(end, 1440);
    block.style.left = `${start / 1440 * 100}%`;
    block.style.width = `${Math.max(step, currentDayEnd - start) / 1440 * 100}%`;
    label.textContent = `${minutesToTime(start)}〜${formatEnd(end)}`;
    endSummary.textContent = formatEnd(end);
    durationSummary.textContent = duration < 60 ? `${duration}分` : `${Math.floor(duration / 60)}時間${duration % 60 ? `${duration % 60}分` : ""}`;
    durationPicker.dataset.duration = duration;
    nextDayTimeline.classList.toggle("visible", end > 1440);
    nextDayBlock.style.width = `${Math.max(0, end - 1440) / 1440 * 100}%`;
    document.querySelectorAll("[data-duration]").forEach((button) => button.classList.toggle("active", Number(button.dataset.duration) === duration));
  };

  startSelect.addEventListener("change", () => {
    const { start, end } = getTimes();
    const duration = Math.max(step, end - start);
    setTimes(start, start + duration);
  });
  nextDayToggle.addEventListener("change", () => {
    const start = timeToMinutes(startSelect.value);
    const rawEnd = timeToMinutes(endSelect.value);
    nextDayInput.value = nextDayToggle.checked ? "1" : "0";
    setTimes(start, nextDayToggle.checked ? (rawEnd <= start ? rawEnd + 1440 : Math.min(start + 1440, rawEnd + 1440)) : Math.max(start + step, rawEnd));
  });

  document.querySelectorAll("[data-duration]").forEach((button) => button.addEventListener("click", () => {
    const { start } = getTimes();
    setTimes(start, start + Number(button.dataset.duration));
  }));
  document.querySelectorAll("[data-adjust-duration]").forEach((button) => button.addEventListener("click", () => {
    const { start, end } = getTimes();
    setTimes(start, end + Number(button.dataset.adjustDuration));
  }));
  document.querySelectorAll("[data-time-preset]").forEach((button) => button.addEventListener("click", () => {
    let [start, end] = button.dataset.timePreset.split(",").map(timeToMinutes);
    if (end <= start) end += 1440;
    titleInput.value = button.dataset.presetTitle;
    categorySelect.value = button.dataset.presetCategory;
    setTimes(start, end);
  }));
  const categoryDurations = { "学習": 60, "アルバイト": 240, "サークル": 120, "遊び": 120, "就職活動": 90, "その他": 60 };
  categorySelect?.addEventListener("change", () => {
    const { start } = getTimes();
    setTimes(start, start + categoryDurations[categorySelect.value]);
  });

  const beginDrag = (event, mode) => {
    event.preventDefault();
    const times = getTimes();
    drag = { mode, x: event.clientX, ...times };
    block.setPointerCapture(event.pointerId);
    block.classList.add("adjusting");
  };
  block.addEventListener("pointerdown", (event) => beginDrag(event, event.target.dataset.timeHandle || "move"));
  block.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const delta = snap((event.clientX - drag.x) / track.getBoundingClientRect().width * 1440);
    const duration = drag.end - drag.start;
    if (drag.mode === "move") {
      const start = Math.max(0, Math.min(1440 - step, drag.start + delta));
      setTimes(start, start + duration);
    } else if (drag.mode === "start") {
      setTimes(Math.max(0, Math.min(drag.end - step, drag.start + delta)), drag.end);
    } else {
      setTimes(drag.start, drag.end + delta);
    }
  });
  block.addEventListener("pointerup", () => { drag = null; block.classList.remove("adjusting"); });
  block.addEventListener("pointercancel", () => { drag = null; block.classList.remove("adjusting"); });
  track.addEventListener("pointerdown", (event) => {
    if (event.target !== track) return;
    const { start, end } = getTimes();
    const duration = end - start;
    const point = snap((event.clientX - track.getBoundingClientRect().left) / track.getBoundingClientRect().width * 1440);
    const nextStart = Math.max(0, Math.min(1440 - step, snap(point - Math.min(duration, 240) / 2)));
    setTimes(nextStart, nextStart + duration);
  });
  renderTimeline();
}
