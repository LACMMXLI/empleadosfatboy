import type { PrismaClient } from "@prisma/client"

type SequenceClient = Pick<PrismaClient, "$queryRaw" | "sequenceCounter">

export function dailySequenceKey(prefix: string, now = new Date()) {
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
  return `${prefix}-${day}`
}

export function dayBounds(now = new Date()) {
  return {
    gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  }
}

/**
 * Returns the next value of a named counter. The increment is a single atomic
 * INSERT ... ON CONFLICT statement, so concurrent callers never get the same value.
 * `seed` is only evaluated when the counter does not exist yet, to continue
 * numbering from rows created before the counter table was introduced.
 */
export async function nextSequenceValue(client: SequenceClient, key: string, seed: () => Promise<number>) {
  let initial = 0
  const existing = await client.sequenceCounter.findUnique({ where: { key }, select: { key: true } })
  if (!existing) initial = await seed()

  const rows = await client.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "SequenceCounter" ("key", "value", "updatedAt")
    VALUES (${key}, ${initial + 1}, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = "SequenceCounter"."value" + 1, "updatedAt" = NOW()
    RETURNING "value"`
  return Number(rows[0].value)
}

export function formatSequence(key: string, value: number) {
  return `${key}-${String(value).padStart(4, "0")}`
}
