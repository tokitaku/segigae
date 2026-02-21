import { isAdjacentSeat, isSeatInsideLayout } from './seat'
import type {
  ConstraintViolationDTO,
  PersonDTO,
  ProjectDTO,
  SeatKey,
  SeatToPersonMap,
  SeparateRuleDTO,
} from './types'

function isActivePerson(persons: PersonDTO[], personId: string): boolean {
  return persons.some((person) => person.id === personId && !person.absent)
}

function buildPersonToSeatMap(seatToPerson: SeatToPersonMap): Map<string, SeatKey[]> {
  const map = new Map<string, SeatKey[]>()

  for (const [seat, personId] of Object.entries(seatToPerson) as [SeatKey, string][]) {
    if (!personId) {
      continue
    }

    const current = map.get(personId)
    if (current) {
      current.push(seat)
      continue
    }

    map.set(personId, [seat])
  }

  return map
}

export function validateAssignment(project: ProjectDTO, seatToPerson: SeatToPersonMap): ConstraintViolationDTO[] {
  const violations: ConstraintViolationDTO[] = []
  const activePersons = project.persons.filter((person) => !person.absent)
  const activePersonIdSet = new Set(activePersons.map((person) => person.id))
  const disabledSeatSet = new Set(project.layout.disabledSeats)
  const personToSeatMap = buildPersonToSeatMap(seatToPerson)

  for (const [seat, personId] of Object.entries(seatToPerson) as [SeatKey, string][]) {
    if (!personId) {
      continue
    }

    if (!isSeatInsideLayout(project.layout, seat) || disabledSeatSet.has(seat)) {
      violations.push({
        type: 'DISABLED_SEAT_USED',
        severity: 'HARD',
        message: `無効席 ${seat} に ${personId} が割り当てられています。`,
        detail: { seat, personId },
      })
    }
  }

  for (const rule of project.rules) {
    if (rule.type !== 'fixedSeat') {
      continue
    }

    if (!isActivePerson(project.persons, rule.personId)) {
      continue
    }

    const seatedPersonId = seatToPerson[rule.seat]
    if (seatedPersonId !== rule.personId) {
      violations.push({
        type: 'FIXED_SEAT_BROKEN',
        severity: 'HARD',
        message: `固定席違反: ${rule.personId} は ${rule.seat} に座る必要があります。`,
        detail: { personId: rule.personId, seat: rule.seat },
      })
    }
  }

  for (const [personId, seats] of personToSeatMap) {
    if (seats.length <= 1) {
      continue
    }

    violations.push({
      type: 'DUPLICATE_PERSON',
      severity: 'HARD',
      message: `${personId} が複数席に割り当てられています。`,
      detail: { personId, seats: seats.join(',') },
    })
  }

  for (const personId of activePersonIdSet) {
    const seats = personToSeatMap.get(personId)
    if (seats && seats.length >= 1) {
      continue
    }

    violations.push({
      type: 'UNASSIGNED_PERSON',
      severity: 'HARD',
      message: `${personId} が未割り当てです。`,
      detail: { personId },
    })
  }

  for (const rule of project.rules) {
    if (rule.type !== 'separate') {
      continue
    }

    validateSeparateRule(rule, activePersonIdSet, personToSeatMap, violations)
  }

  return violations
}

function validateSeparateRule(
  rule: SeparateRuleDTO,
  activePersonIdSet: Set<string>,
  personToSeatMap: Map<string, SeatKey[]>,
  violations: ConstraintViolationDTO[],
): void {
  if (!activePersonIdSet.has(rule.personAId) || !activePersonIdSet.has(rule.personBId)) {
    return
  }

  const seatA = personToSeatMap.get(rule.personAId)?.[0]
  const seatB = personToSeatMap.get(rule.personBId)?.[0]

  if (!seatA || !seatB) {
    return
  }

  if (!isAdjacentSeat(seatA, seatB)) {
    return
  }

  violations.push({
    type: 'NOT_ADJACENT',
    severity: 'HARD',
    message: `${rule.personAId} と ${rule.personBId} が隣接しています。`,
    detail: { personAId: rule.personAId, personBId: rule.personBId, seatA, seatB },
  })
}
