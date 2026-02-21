import { v4 as uuidv4 } from 'uuid'
import { generateSeatToPerson, type GenerateOptions } from './generator'
import { validateAssignment } from './validation'
import type { AssignmentDTO, AssignmentEditDTO, ProjectDTO, SeatToPersonMap } from './types'

export function buildGeneratedAssignment(
  project: ProjectDTO,
  options: GenerateOptions = {},
): AssignmentDTO {
  const generated = generateSeatToPerson(project, options)

  return {
    id: uuidv4(),
    projectId: project.id,
    createdAt: new Date().toISOString(),
    seatToPerson: generated.seatToPerson,
    violations: generated.violations,
    commit: `generated(attempts=${generated.attempts})`,
  }
}

export function buildAdjustedAssignment(
  project: ProjectDTO,
  seatToPerson: SeatToPersonMap,
  edits: AssignmentEditDTO[],
  baseAssignmentId?: string,
): AssignmentDTO {
  const violations = validateAssignment(project, seatToPerson)

  return {
    id: uuidv4(),
    projectId: project.id,
    createdAt: new Date().toISOString(),
    seatToPerson,
    violations,
    edits,
    commit: 'adjusted',
    baseAssignmentId,
  }
}
