const requestedDate = new URLSearchParams(window.location.search).get("date");
const eventDateInput = document.querySelector('input[name="eventDate"]');
if (eventDateInput && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "")) {
  eventDateInput.value = requestedDate;
}
