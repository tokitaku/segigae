import { v4 as uuidv4 } from 'uuid'
import { buildAdjustedAssignment, buildGeneratedAssignment } from '../domain/assignment'
import {
  advanceRevealStep,
  finishRevealSession,
  pauseRevealSession,
  resumeRevealSession,
  startRevealSession,
} from '../domain/reveal'
import { validateAssignment } from '../domain/validation'
import {
  deleteProject,
  getAssignment,
  getProject,
  listAssignments,
  listProjects,
  listRevealSessions,
  saveAssignment,
  saveProject,
  saveRevealSession,
} from '../infra/repositories'
import type {
  AssignmentDTO,
  AssignmentEditDTO,
  ConstraintViolationDTO,
  ProjectDTO,
  RevealMode,
  RevealSessionDTO,
  SeatToPersonMap,
} from '../domain/types'

export async function createProjectUseCase(name: string): Promise<ProjectDTO> {
  const now = new Date().toISOString()
  const project: ProjectDTO = {
    id: uuidv4(),
    name,
    layout: {
      rows: 6,
      cols: 6,
      disabledSeats: [],
    },
    persons: [],
    rules: [],
    createdAt: now,
    updatedAt: now,
  }

  await saveProject(project)
  return project
}

export async function updateProjectUseCase(project: ProjectDTO): Promise<ProjectDTO> {
  const updated: ProjectDTO = {
    ...project,
    updatedAt: new Date().toISOString(),
  }

  await saveProject(updated)
  return updated
}

export async function getProjectUseCase(projectId: string): Promise<ProjectDTO | undefined> {
  return getProject(projectId)
}

export async function listProjectsUseCase(): Promise<ProjectDTO[]> {
  return listProjects()
}

export async function deleteProjectUseCase(projectId: string): Promise<void> {
  await deleteProject(projectId)
}

export async function generateAssignmentUseCase(project: ProjectDTO): Promise<AssignmentDTO> {
  const assignment = buildGeneratedAssignment(project)
  await saveAssignment(assignment)
  return assignment
}

export async function getAssignmentUseCase(assignmentId: string): Promise<AssignmentDTO | undefined> {
  return getAssignment(assignmentId)
}

export async function listAssignmentsUseCase(projectId: string): Promise<AssignmentDTO[]> {
  return listAssignments(projectId)
}

export async function saveAdjustedAssignmentUseCase(
  project: ProjectDTO,
  seatToPerson: SeatToPersonMap,
  edits: AssignmentEditDTO[],
  baseAssignmentId?: string,
): Promise<AssignmentDTO> {
  const assignment = buildAdjustedAssignment(project, seatToPerson, edits, baseAssignmentId)
  await saveAssignment(assignment)
  return assignment
}

export function validateDraftAssignmentUseCase(
  project: ProjectDTO,
  seatToPerson: SeatToPersonMap,
): ConstraintViolationDTO[] {
  return validateAssignment(project, seatToPerson)
}

export async function startRevealSessionUseCase(
  projectId: string,
  assignment: AssignmentDTO,
  mode: RevealMode,
): Promise<RevealSessionDTO> {
  const session = startRevealSession(projectId, assignment, mode)
  await saveRevealSession(session)
  return session
}

export async function advanceRevealStepUseCase(session: RevealSessionDTO): Promise<RevealSessionDTO> {
  const updated = advanceRevealStep(session)
  await saveRevealSession(updated)
  return updated
}

export async function pauseRevealSessionUseCase(session: RevealSessionDTO): Promise<RevealSessionDTO> {
  const updated = pauseRevealSession(session)
  await saveRevealSession(updated)
  return updated
}

export async function resumeRevealSessionUseCase(session: RevealSessionDTO): Promise<RevealSessionDTO> {
  const updated = resumeRevealSession(session)
  await saveRevealSession(updated)
  return updated
}

export async function finishRevealSessionUseCase(session: RevealSessionDTO): Promise<RevealSessionDTO> {
  const updated = finishRevealSession(session)
  await saveRevealSession(updated)
  return updated
}

export async function listRevealSessionsUseCase(projectId: string): Promise<RevealSessionDTO[]> {
  return listRevealSessions(projectId)
}
