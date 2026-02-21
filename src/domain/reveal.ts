import { v4 as uuidv4 } from 'uuid'
import { compareSeatKey } from './seat'
import type { AssignmentDTO, RevealMode, RevealSessionDTO, SeatKey } from './types'

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

function buildRevealOrder(assignment: AssignmentDTO, mode: RevealMode): string[] {
  const entries = (Object.entries(assignment.seatToPerson) as [SeatKey, string | undefined][])
    .filter((entry): entry is [SeatKey, string] => typeof entry[1] === 'string')

  if (mode === 'roulette') {
    return shuffle(entries.map(([, personId]) => personId))
  }

  const sortedBySeat = [...entries].sort(([seatA], [seatB]) => compareSeatKey(seatA, seatB))

  if (mode === 'revealAll') {
    return sortedBySeat.map(([, personId]) => personId)
  }

  return sortedBySeat.map(([, personId]) => personId)
}

export function startRevealSession(
  projectId: string,
  assignment: AssignmentDTO,
  mode: RevealMode,
): RevealSessionDTO {
  const order = buildRevealOrder(assignment, mode)
  const now = new Date().toISOString()

  if (mode === 'revealAll') {
    return {
      id: uuidv4(),
      projectId,
      assignmentId: assignment.id,
      startedAt: now,
      state: 'FINISHED',
      mode,
      order,
      revealedPersonIds: [...order],
    }
  }

  return {
    id: uuidv4(),
    projectId,
    assignmentId: assignment.id,
    startedAt: now,
    state: 'REVEALING',
    mode,
    order,
    revealedPersonIds: [],
  }
}

export function advanceRevealStep(session: RevealSessionDTO): RevealSessionDTO {
  if (session.state !== 'REVEALING') {
    return session
  }

  const nextIndex = session.revealedPersonIds.length
  if (nextIndex >= session.order.length) {
    return { ...session, state: 'FINISHED' }
  }

  const nextPersonId = session.order[nextIndex]
  const revealedPersonIds = [...session.revealedPersonIds, nextPersonId]

  if (revealedPersonIds.length >= session.order.length) {
    return { ...session, revealedPersonIds, state: 'FINISHED' }
  }

  return { ...session, revealedPersonIds }
}

export function pauseRevealSession(session: RevealSessionDTO): RevealSessionDTO {
  if (session.state !== 'REVEALING') {
    return session
  }

  return { ...session, state: 'PAUSED' }
}

export function resumeRevealSession(session: RevealSessionDTO): RevealSessionDTO {
  if (session.state !== 'PAUSED') {
    return session
  }

  return { ...session, state: 'REVEALING' }
}

export function finishRevealSession(session: RevealSessionDTO): RevealSessionDTO {
  return {
    ...session,
    state: 'FINISHED',
    revealedPersonIds: [...session.order],
  }
}
