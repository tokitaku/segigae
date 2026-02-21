import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AssignmentDTO, ProjectDTO, RevealSessionDTO } from '../domain/types'

interface SeigaeDBSchema extends DBSchema {
  projects: {
    key: string
    value: ProjectDTO
  }
  assignments: {
    key: string
    value: AssignmentDTO
    indexes: { projectId: string }
  }
  revealSessions: {
    key: string
    value: RevealSessionDTO
    indexes: { assignmentId: string; projectId: string }
  }
}

let dbPromise: Promise<IDBPDatabase<SeigaeDBSchema>> | null = null

export function getDB(): Promise<IDBPDatabase<SeigaeDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<SeigaeDBSchema>('seigae-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' })
        }

        if (!db.objectStoreNames.contains('assignments')) {
          const assignmentStore = db.createObjectStore('assignments', { keyPath: 'id' })
          assignmentStore.createIndex('projectId', 'projectId')
        }

        if (!db.objectStoreNames.contains('revealSessions')) {
          const revealSessionStore = db.createObjectStore('revealSessions', { keyPath: 'id' })
          revealSessionStore.createIndex('assignmentId', 'assignmentId')
          revealSessionStore.createIndex('projectId', 'projectId')
        }
      },
    })
  }

  return dbPromise
}
