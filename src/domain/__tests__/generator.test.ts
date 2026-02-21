import { describe, expect, it } from 'vitest'
import { generateSeatToPerson } from '../generator'
import type { ProjectDTO } from '../types'

function createProject(): ProjectDTO {
  const now = new Date().toISOString()

  return {
    id: 'p1',
    name: 'class-a',
    createdAt: now,
    updatedAt: now,
    layout: {
      rows: 3,
      cols: 3,
      disabledSeats: ['r3c3'],
    },
    persons: [
      { id: 'alice', name: 'Alice', gender: 'female', absent: false },
      { id: 'bob', name: 'Bob', gender: 'male', absent: false },
      { id: 'carol', name: 'Carol', gender: 'female', absent: false },
      { id: 'dave', name: 'Dave', gender: 'male', absent: false },
    ],
    rules: [
      { id: 'f1', type: 'fixedSeat', personId: 'alice', seat: 'r1c1', hard: true },
      {
        id: 's1',
        type: 'separate',
        personAId: 'bob',
        personBId: 'carol',
        kind: 'notAdjacent',
        hard: true,
      },
    ],
  }
}

describe('generateSeatToPerson', () => {
  it('固定席を守ってハード違反ゼロの割り当てを返す', () => {
    const project = createProject()
    const generated = generateSeatToPerson(project, { maxRetries: 2000 })

    // fixedSeat ルールで指定した席に alice が座ることを確認する。
    expect(generated.seatToPerson.r1c1).toBe('alice')

    const hardViolations = generated.violations.filter((violation) => violation.severity === 'HARD')
    expect(hardViolations).toHaveLength(0)
  })

  it('席数不足時は例外を投げる', () => {
    const project = createProject()
    project.layout.rows = 1
    project.layout.cols = 1
    project.layout.disabledSeats = []

    expect(() => generateSeatToPerson(project)).toThrowError()
  })
})
