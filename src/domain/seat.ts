import type { LayoutDTO, SeatKey } from './types'

const SEAT_KEY_PATTERN = /^r(\d+)c(\d+)$/

export function makeSeatKey(row: number, col: number): SeatKey {
  return `r${row}c${col}`
}

export function parseSeatKey(seat: SeatKey | string): { row: number; col: number } | null {
  const matched = seat.match(SEAT_KEY_PATTERN)
  if (!matched) {
    return null
  }

  const row = Number(matched[1])
  const col = Number(matched[2])

  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return null
  }

  return { row, col }
}

export function isSeatInsideLayout(layout: LayoutDTO, seat: SeatKey | string): boolean {
  const parsed = parseSeatKey(seat)
  if (!parsed) {
    return false
  }

  return parsed.row >= 1 && parsed.row <= layout.rows && parsed.col >= 1 && parsed.col <= layout.cols
}

export function isAdjacentSeat(a: SeatKey | string, b: SeatKey | string): boolean {
  const pa = parseSeatKey(a)
  const pb = parseSeatKey(b)
  if (!pa || !pb) {
    return false
  }

  const distance = Math.abs(pa.row - pb.row) + Math.abs(pa.col - pb.col)
  return distance === 1
}

export function listAllSeats(layout: LayoutDTO): SeatKey[] {
  const seats: SeatKey[] = []

  for (let row = 1; row <= layout.rows; row += 1) {
    for (let col = 1; col <= layout.cols; col += 1) {
      seats.push(makeSeatKey(row, col))
    }
  }

  return seats
}

export function listAssignableSeats(layout: LayoutDTO): SeatKey[] {
  const disabled = new Set(layout.disabledSeats)
  return listAllSeats(layout).filter((seat) => !disabled.has(seat))
}

export function compareSeatKey(a: SeatKey, b: SeatKey): number {
  const pa = parseSeatKey(a)
  const pb = parseSeatKey(b)
  if (!pa || !pb) {
    return a.localeCompare(b)
  }

  if (pa.row !== pb.row) {
    return pa.row - pb.row
  }

  return pa.col - pb.col
}
