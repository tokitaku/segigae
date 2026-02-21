import { describe, expect, it } from 'vitest'
import { validateAssignment } from '../validation'
import type { ProjectDTO } from '../types'

function createProject(): ProjectDTO {
  const now = new Date().toISOString()

  return {
    id: 'p1',
    name: 'class-a',
    createdAt: now,
    updatedAt: now,
    layout: {
      rows: 2,
      cols: 2,
      disabledSeats: ['r2c2'],
    },
    persons: [
      { id: 'alice', name: 'Alice', gender: 'female', absent: false },
      { id: 'bob', name: 'Bob', gender: 'male', absent: false },
      { id: 'carol', name: 'Carol', gender: 'female', absent: false },
    ],
    rules: [
      { id: 'f1', type: 'fixedSeat', personId: 'alice', seat: 'r1c1', hard: true },
      {
        id: 's1',
        type: 'separate',
        personAId: 'alice',
        personBId: 'bob',
        kind: 'notAdjacent',
        hard: true,
      },
    ],
  }
}

describe('validateAssignment', () => {
  it('固定席違反と隣接違反を検出する', () => {
    const project = createProject()
    const violations = validateAssignment(project, {
      // alice を固定席からずらすことで固定席違反を意図的に発生させる。
      r1c2: 'alice',
      // bob を隣接席に配置して notAdjacent 違反を発生させる。
      r1c1: 'bob',
      r2c1: 'carol',
    })

    expect(violations.some((violation) => violation.type === 'FIXED_SEAT_BROKEN')).toBe(true)
    expect(violations.some((violation) => violation.type === 'NOT_ADJACENT')).toBe(true)
  })

  it('重複割り当てと未割り当てを検出する', () => {
    const project = createProject()
    const violations = validateAssignment(project, {
      // 同一人物を複数席に置いて DUPLICATE_PERSON を検証する。
      r1c1: 'alice',
      r1c2: 'alice',
    })

    expect(violations.some((violation) => violation.type === 'DUPLICATE_PERSON')).toBe(true)
    expect(violations.some((violation) => violation.type === 'UNASSIGNED_PERSON')).toBe(true)
  })

  it('無効席使用を検出する', () => {
    const project = createProject()
    const violations = validateAssignment(project, {
      r1c1: 'alice',
      r1c2: 'bob',
      // disabledSeats に含まれる席へ割り当てて違反を発生させる。
      r2c2: 'carol',
    })

    expect(violations.some((violation) => violation.type === 'DISABLED_SEAT_USED')).toBe(true)
  })
})
