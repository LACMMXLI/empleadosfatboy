import assert from "node:assert/strict"
import { calculateAttendance, type ScheduleRecord } from "./attendance-calculation"

const schedule = {
  lateGraceMinutes: 5,
  overtimeThresholdMinutes: 15,
  sundayEnabled: false, sundayStart: "09:00", sundayEnd: "17:00",
  mondayEnabled: true, mondayStart: "09:00", mondayEnd: "17:00",
  tuesdayEnabled: true, tuesdayStart: "09:00", tuesdayEnd: "17:00",
  wednesdayEnabled: true, wednesdayStart: "09:00", wednesdayEnd: "17:00",
  thursdayEnabled: true, thursdayStart: "09:00", thursdayEnd: "17:00",
  fridayEnabled: true, fridayStart: "09:00", fridayEnd: "17:00",
  saturdayEnabled: false, saturdayStart: "09:00", saturdayEnd: "17:00"
} satisfies ScheduleRecord

function calculatesLateArrivalAndOvertime() {
  const result = calculateAttendance({
      date: "2026-06-22",
      schedule,
      firstEntry: { localDate: "2026-06-22", localTime: "09:18:00" },
      lastExit: { localDate: "2026-06-22", localTime: "18:10:00" },
      workedMinutes: 532
  })
  assert.equal(result.lateStatus, "LATE")
  assert.equal(result.lateMinutes, 13)
  assert.equal(result.earlyDepartureMinutes, 0)
  assert.equal(result.overtimeMinutes, 70)
}

function supportsOvernightShifts() {
  const night = { ...schedule, mondayStart: "22:00", mondayEnd: "06:00" }
  const result = calculateAttendance({
      date: "2026-06-22",
      schedule: night,
      firstEntry: { localDate: "2026-06-22", localTime: "21:58:00" },
      lastExit: { localDate: "2026-06-23", localTime: "06:30:00" },
      workedMinutes: 512
  })
  assert.equal(result.scheduledMinutes, 480)
  assert.equal(result.lateStatus, "ON_TIME")
  assert.equal(result.overtimeMinutes, 30)
}

calculatesLateArrivalAndOvertime()
supportsOvernightShifts()
console.log("Attendance calculation tests passed")
