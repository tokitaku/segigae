export type SeatKey = `r${number}c${number}`

export interface LayoutDTO {
  rows: number
  cols: number
  disabledSeats: SeatKey[]
}

export interface PersonDTO {
  id: string
  name: string
  gender: 'male' | 'female'
  absent: boolean
}

export interface FixedSeatRuleDTO {
  id: string
  type: 'fixedSeat'
  personId: string
  seat: SeatKey
  hard: true
}

export interface SeparateRuleDTO {
  id: string
  type: 'separate'
  personAId: string
  personBId: string
  kind: 'notAdjacent'
  hard: true
}

export interface AvoidSameSeatFromLastRuleDTO {
  id: string
  type: 'avoidSameSeatFromLast'
  mode: 'soft'
  scope: 'last'
}

export type RuleDTO = FixedSeatRuleDTO | SeparateRuleDTO | AvoidSameSeatFromLastRuleDTO

export interface ProjectDTO {
  id: string
  name: string
  layout: LayoutDTO
  persons: PersonDTO[]
  rules: RuleDTO[]
  createdAt: string
  updatedAt: string
}

export type SeatToPersonMap = Partial<Record<SeatKey, string>>

export type ConstraintViolationType =
  | 'DISABLED_SEAT_USED'
  | 'FIXED_SEAT_BROKEN'
  | 'NOT_ADJACENT'
  | 'DUPLICATE_PERSON'
  | 'UNASSIGNED_PERSON'

export type ConstraintSeverity = 'HARD' | 'SOFT'

export interface ConstraintViolationDTO {
  type: ConstraintViolationType
  severity: ConstraintSeverity
  message: string
  detail?: Record<string, string>
}

export interface AssignmentEditDTO {
  type: 'swap' | 'move'
  fromSeat: SeatKey
  toSeat: SeatKey
  at: string
}

export interface AssignmentDTO {
  id: string
  projectId: string
  createdAt: string
  seatToPerson: SeatToPersonMap
  violations: ConstraintViolationDTO[]
  edits?: AssignmentEditDTO[]
  commit?: string
  baseAssignmentId?: string
}

export type RevealState = 'IDLE' | 'REVEALING' | 'PAUSED' | 'FINISHED'
export type RevealMode = 'roulette' | 'revealAll' | 'block'

export interface RevealSessionDTO {
  id: string
  projectId: string
  assignmentId: string
  startedAt: string
  state: RevealState
  mode: RevealMode
  revealedPersonIds: string[]
  order: string[]
}
