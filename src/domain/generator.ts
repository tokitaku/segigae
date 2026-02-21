import { listAssignableSeats } from './seat'
import { validateAssignment } from './validation'
import type { ConstraintViolationDTO, PersonDTO, ProjectDTO, SeatToPersonMap } from './types'

export interface GenerateOptions {
  maxRetries?: number
}

export interface GenerateResult {
  seatToPerson: SeatToPersonMap
  violations: ConstraintViolationDTO[]
  attempts: number
}

function shuffle<T>(items: T[]): T[] {
  const copied = [...items]

  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copied[i]
    copied[i] = copied[j]
    copied[j] = tmp
  }

  return copied
}

function listActivePersons(project: ProjectDTO): PersonDTO[] {
  return project.persons.filter((person) => !person.absent)
}

function placeFixedSeats(project: ProjectDTO): {
  fixedSeatToPerson: SeatToPersonMap
  fixedPersonIdSet: Set<string>
} {
  const fixedSeatToPerson: SeatToPersonMap = {}
  const fixedPersonIdSet = new Set<string>()
  const activePersonIdSet = new Set(listActivePersons(project).map((person) => person.id))

  for (const rule of project.rules) {
    if (rule.type !== 'fixedSeat') {
      continue
    }

    if (!activePersonIdSet.has(rule.personId)) {
      continue
    }

    fixedSeatToPerson[rule.seat] = rule.personId
    fixedPersonIdSet.add(rule.personId)
  }

  return { fixedSeatToPerson, fixedPersonIdSet }
}

export function generateSeatToPerson(project: ProjectDTO, options: GenerateOptions = {}): GenerateResult {
  const maxRetries = options.maxRetries ?? 500
  const activePersons = listActivePersons(project)
  const assignableSeats = listAssignableSeats(project.layout)

  if (activePersons.length > assignableSeats.length) {
    throw new Error('割り当て可能席数より出席者数が多いため生成できません。')
  }

  const { fixedSeatToPerson, fixedPersonIdSet } = placeFixedSeats(project)
  const fixedSeatSet = new Set(Object.keys(fixedSeatToPerson))
  const remainingSeats = assignableSeats.filter((seat) => !fixedSeatSet.has(seat))
  const remainingPersons = activePersons.filter((person) => !fixedPersonIdSet.has(person.id))

  let best: GenerateResult | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const seatToPerson: SeatToPersonMap = { ...fixedSeatToPerson }
    const shuffledSeats = shuffle(remainingSeats)
    const shuffledPersons = shuffle(remainingPersons)

    for (let i = 0; i < shuffledPersons.length; i += 1) {
      const seat = shuffledSeats[i]
      const person = shuffledPersons[i]
      if (!seat || !person) {
        continue
      }

      seatToPerson[seat] = person.id
    }

    const violations = validateAssignment(project, seatToPerson)
    const hardViolationCount = violations.filter((violation) => violation.severity === 'HARD').length

    if (!best) {
      best = { seatToPerson, violations, attempts: attempt }
    } else {
      const bestHardCount = best.violations.filter((violation) => violation.severity === 'HARD').length
      if (hardViolationCount < bestHardCount) {
        best = { seatToPerson, violations, attempts: attempt }
      }
    }

    if (hardViolationCount === 0) {
      return { seatToPerson, violations, attempts: attempt }
    }
  }

  if (!best) {
    return { seatToPerson: {}, violations: [], attempts: 0 }
  }

  return best
}
