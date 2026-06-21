export const scheduleDayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const

export type ScheduleDayName = (typeof scheduleDayNames)[number]

export type ScheduleRecord = {
  lateGraceMinutes: number
  overtimeThresholdMinutes: number
} & Record<`${ScheduleDayName}Enabled`, boolean>
  & Record<`${ScheduleDayName}Start`, string>
  & Record<`${ScheduleDayName}End`, string>

type LocalEntry = { localDate: string; localTime: string }

export type AttendanceCalculation = {
  scheduled: boolean
  scheduledStart: string | null
  scheduledEnd: string | null
  scheduledMinutes: number
  workedMinutes: number
  lateStatus: "NOT_SCHEDULED" | "NO_ENTRY" | "ON_TIME" | "LATE"
  lateMinutes: number
  earlyDepartureMinutes: number
  overtimeMinutes: number
}

export function calculateAttendance(input: {
  date: string
  schedule: ScheduleRecord | null | undefined
  firstEntry?: LocalEntry | null
  lastExit?: LocalEntry | null
  workedMinutes: number
}): AttendanceCalculation {
  const { date, schedule, firstEntry, lastExit, workedMinutes } = input
  if (!schedule) return emptyCalculation(workedMinutes)

  const dayIndex = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  const dayName = scheduleDayNames[dayIndex]
  const enabled = schedule[`${dayName}Enabled`]
  if (!enabled) return emptyCalculation(workedMinutes)

  const start = schedule[`${dayName}Start`]
  const end = schedule[`${dayName}End`]
  const startMinute = timeToMinutes(start)
  let endMinute = timeToMinutes(end)
  if (endMinute <= startMinute) endMinute += 24 * 60

  const firstEntryMinute = firstEntry ? localOffsetMinutes(date, firstEntry) : null
  const lastExitMinute = lastExit ? localOffsetMinutes(date, lastExit) : null
  const lateMinutes = firstEntryMinute === null
    ? 0
    : Math.max(0, firstEntryMinute - startMinute - schedule.lateGraceMinutes)
  const rawOvertime = lastExitMinute === null ? 0 : Math.max(0, lastExitMinute - endMinute)

  return {
    scheduled: true,
    scheduledStart: start,
    scheduledEnd: end,
    scheduledMinutes: endMinute - startMinute,
    workedMinutes,
    lateStatus: firstEntryMinute === null ? "NO_ENTRY" : lateMinutes > 0 ? "LATE" : "ON_TIME",
    lateMinutes,
    earlyDepartureMinutes: lastExitMinute === null ? 0 : Math.max(0, endMinute - lastExitMinute),
    overtimeMinutes: rawOvertime >= schedule.overtimeThresholdMinutes ? rawOvertime : 0
  }
}

function emptyCalculation(workedMinutes: number): AttendanceCalculation {
  return {
    scheduled: false,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledMinutes: 0,
    workedMinutes,
    lateStatus: "NOT_SCHEDULED",
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    overtimeMinutes: 0
  }
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number)
  return hours * 60 + minutes
}

function localOffsetMinutes(baseDate: string, entry: LocalEntry) {
  const base = new Date(`${baseDate}T00:00:00.000Z`)
  const current = new Date(`${entry.localDate}T00:00:00.000Z`)
  const dayOffset = Math.round((current.getTime() - base.getTime()) / 86_400_000)
  return dayOffset * 24 * 60 + timeToMinutes(entry.localTime)
}
