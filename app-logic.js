(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.AppLogic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parseTime(timeText) {
    if (!timeText) return null;
    const [hours, minutes] = timeText.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  function diffMinutes(start, end) {
    if (start === null || end === null) return 0;
    if (end < start) return (24 * 60 - start) + end;
    return end - start;
  }

  function calculateWorkedHours({ entry1, exit1, entry2, exit2, jornada }) {
    const t1 = parseTime(entry1);
    const t2 = parseTime(exit1);
    const t3 = parseTime(entry2);
    const t4 = parseTime(exit2);

    let totalMinutes = 0;
    totalMinutes += diffMinutes(t1, t2);
    totalMinutes += diffMinutes(t3, t4);

    const hours = totalMinutes / 60;
    const workingDay = Number.isFinite(jornada) ? jornada : 8;

    return {
      hours,
      normal: Math.min(workingDay, hours),
      extra: Math.max(0, hours - workingDay)
    };
  }

  function calculatePay({ tipo, hours, normal, extra, hourlyRate, overtimeRate, holidayRate }) {
    if (tipo === "holiday") {
      return hours * holidayRate;
    }
    return normal * hourlyRate + extra * overtimeRate;
  }

  function parseCurrencyBRL(value) {
    return parseFloat(value.replace("R$", "").replace(/\./g, "").replace(",", ".")) || 0;
  }

  return {
    parseTime,
    calculateWorkedHours,
    calculatePay,
    parseCurrencyBRL,
    diffMinutes
  };
});
