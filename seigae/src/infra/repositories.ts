import { getDB } from './db'
import type { AssignmentDTO, ProjectDTO, RevealSessionDTO } from '../domain/types'

function normalizeProject(project: ProjectDTO): ProjectDTO {
  return {
    ...project,
    persons: project.persons.map((person) => ({
      ...person,
      gender: person.gender === 'female' ? 'female' : 'male',
    })),
  }
}

export async function listProjects(): Promise<ProjectDTO[]> {
  const db = await getDB()
  const projects = await db.getAll('projects')
  return projects.map(normalizeProject).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getProject(projectId: string): Promise<ProjectDTO | undefined> {
  const db = await getDB()
  const project = await db.get('projects', projectId)
  if (!project) {
    return undefined
  }

  return normalizeProject(project)
}

export async function saveProject(project: ProjectDTO): Promise<void> {
  const db = await getDB()
  await db.put('projects', normalizeProject(project))
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['projects', 'assignments', 'revealSessions'], 'readwrite')

  await tx.objectStore('projects').delete(projectId)

  const assignmentStore = tx.objectStore('assignments')
  const assignmentIndex = assignmentStore.index('projectId')
  let cursor = await assignmentIndex.openCursor(projectId)

  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }

  const revealStore = tx.objectStore('revealSessions')
  const revealIndex = revealStore.index('projectId')
  let revealCursor = await revealIndex.openCursor(projectId)

  while (revealCursor) {
    await revealCursor.delete()
    revealCursor = await revealCursor.continue()
  }

  await tx.done
}

export async function listAssignments(projectId: string): Promise<AssignmentDTO[]> {
  const db = await getDB()
  const assignments = await db.getAllFromIndex('assignments', 'projectId', projectId)
  return assignments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getAssignment(assignmentId: string): Promise<AssignmentDTO | undefined> {
  const db = await getDB()
  return db.get('assignments', assignmentId)
}

export async function saveAssignment(assignment: AssignmentDTO): Promise<void> {
  const db = await getDB()
  await db.put('assignments', assignment)
}

export async function saveRevealSession(session: RevealSessionDTO): Promise<void> {
  const db = await getDB()
  await db.put('revealSessions', session)
}

export async function listRevealSessions(projectId: string): Promise<RevealSessionDTO[]> {
  const db = await getDB()
  const sessions = await db.getAllFromIndex('revealSessions', 'projectId', projectId)
  return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}
