import { useCallback, useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import './App.css'
import { compareSeatKey, isSeatInsideLayout, listAllSeats } from './domain/seat'
import type {
  AssignmentDTO,
  AssignmentEditDTO,
  ConstraintViolationDTO,
  PersonDTO,
  ProjectDTO,
  RevealMode,
  RevealSessionDTO,
  RuleDTO,
  SeatKey,
  SeatToPersonMap,
} from './domain/types'
import {
  advanceRevealStepUseCase,
  createProjectUseCase,
  deleteProjectUseCase,
  finishRevealSessionUseCase,
  generateAssignmentUseCase,
  listAssignmentsUseCase,
  listProjectsUseCase,
  pauseRevealSessionUseCase,
  resumeRevealSessionUseCase,
  saveAdjustedAssignmentUseCase,
  startRevealSessionUseCase,
  updateProjectUseCase,
  validateDraftAssignmentUseCase,
} from './usecases'

type Tab = 'setup' | 'history' | 'reveal'

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

function isHardViolation(violation: ConstraintViolationDTO): boolean {
  return violation.severity === 'HARD'
}

function toggleGender(gender: PersonDTO['gender']): PersonDTO['gender'] {
  return gender === 'male' ? 'female' : 'male'
}

function formatGenderLabel(gender: PersonDTO['gender']): string {
  return gender === 'female' ? '女' : '男'
}

function formatGenderToggleText(gender: PersonDTO['gender']): string {
  // 現在値と次の値を並べて、クリックで切り替わることを明示する。
  return `${formatGenderLabel(gender)}→${formatGenderLabel(toggleGender(gender))}`
}

function toSeatKey(raw: string): SeatKey | null {
  if (!/^r\d+c\d+$/.test(raw)) {
    return null
  }

  return raw as SeatKey
}

function filterRulesByExistingPersons(rules: RuleDTO[], persons: PersonDTO[]): RuleDTO[] {
  const personIdSet = new Set(persons.map((person) => person.id))

  return rules.filter((rule) => {
    if (rule.type === 'fixedSeat') {
      return personIdSet.has(rule.personId)
    }

    if (rule.type === 'separate') {
      return personIdSet.has(rule.personAId) && personIdSet.has(rule.personBId)
    }

    return true
  })
}

function pruneDisabledSeats(seatToPerson: SeatToPersonMap, disabledSeats: SeatKey[]): SeatToPersonMap {
  const disabledSet = new Set(disabledSeats)
  const next: SeatToPersonMap = {}

  for (const [seat, personId] of Object.entries(seatToPerson) as [SeatKey, string][]) {
    if (disabledSet.has(seat)) {
      continue
    }

    next[seat] = personId
  }

  return next
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('setup')
  const [projects, setProjects] = useState<ProjectDTO[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<AssignmentDTO[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const [revealAssignmentId, setRevealAssignmentId] = useState<string | null>(null)

  const [newProjectName, setNewProjectName] = useState('')
  const [projectNameDraft, setProjectNameDraft] = useState('')
  const [rowsDraft, setRowsDraft] = useState(6)
  const [colsDraft, setColsDraft] = useState(6)

  const [singleName, setSingleName] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [genderToggleDisabled, setGenderToggleDisabled] = useState(false)

  const [fixedPersonIdDraft, setFixedPersonIdDraft] = useState('')
  const [fixedSeatDraft, setFixedSeatDraft] = useState('')
  const [separateA, setSeparateA] = useState('')
  const [separateB, setSeparateB] = useState('')

  const [draggingSeat, setDraggingSeat] = useState<SeatKey | null>(null)
  const [draftSeatToPerson, setDraftSeatToPerson] = useState<SeatToPersonMap>({})
  const [draftViolations, setDraftViolations] = useState<ConstraintViolationDTO[]>([])
  const [draftEdits, setDraftEdits] = useState<AssignmentEditDTO[]>([])

  const [revealMode, setRevealMode] = useState<RevealMode>('roulette')
  const [revealSession, setRevealSession] = useState<RevealSessionDTO | null>(null)

  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null,
    [assignments, selectedAssignmentId],
  )

  const revealAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === revealAssignmentId) ?? null,
    [assignments, revealAssignmentId],
  )

  const personNameMap = useMemo(() => {
    return new Map(selectedProject?.persons.map((person) => [person.id, person.name]) ?? [])
  }, [selectedProject])

  const revealLocked = useMemo(() => {
    return revealSession?.state === 'REVEALING' || revealSession?.state === 'PAUSED'
  }, [revealSession])

  const revealedPersonIdSet = useMemo(() => {
    return new Set(revealSession?.revealedPersonIds ?? [])
  }, [revealSession])

  const refreshProjects = useCallback(async (preferredProjectId?: string) => {
    const listed = await listProjectsUseCase()
    setProjects(listed)

    if (listed.length === 0) {
      setSelectedProjectId(null)
      setAssignments([])
      setSelectedAssignmentId(null)
      setRevealAssignmentId(null)
      return
    }

    setSelectedProjectId((currentId) => {
      if (preferredProjectId && listed.some((project) => project.id === preferredProjectId)) {
        return preferredProjectId
      }

      if (currentId && listed.some((project) => project.id === currentId)) {
        return currentId
      }

      return listed[0].id
    })
  }, [])

  const refreshAssignments = useCallback(
    async (projectId: string, preferredAssignmentId?: string) => {
      const listed = await listAssignmentsUseCase(projectId)
      setAssignments(listed)

      setSelectedAssignmentId((currentId) => {
        if (preferredAssignmentId && listed.some((assignment) => assignment.id === preferredAssignmentId)) {
          return preferredAssignmentId
        }

        if (currentId && listed.some((assignment) => assignment.id === currentId)) {
          return currentId
        }

        return listed[0]?.id ?? null
      })
    },
    [],
  )

  useEffect(() => {
    const run = async () => {
      try {
        await refreshProjects()
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [refreshProjects])

  useEffect(() => {
    if (!selectedProjectId) {
      setAssignments([])
      setSelectedAssignmentId(null)
      return
    }

    void refreshAssignments(selectedProjectId)
  }, [selectedProjectId, refreshAssignments])

  useEffect(() => {
    if (!selectedProject) {
      setProjectNameDraft('')
      setRowsDraft(6)
      setColsDraft(6)
      return
    }

    setProjectNameDraft(selectedProject.name)
    setRowsDraft(selectedProject.layout.rows)
    setColsDraft(selectedProject.layout.cols)
  }, [selectedProject])

  useEffect(() => {
    // プロジェクトを切り替えたら、性別トグルの disable 状態を初期化する。
    setGenderToggleDisabled(false)
  }, [selectedProjectId])

  useEffect(() => {
    if (!selectedAssignment) {
      setDraftSeatToPerson({})
      setDraftEdits([])
      return
    }

    // Assignment は immutable なので編集開始時に copy を作る。
    setDraftSeatToPerson({ ...selectedAssignment.seatToPerson })
    setDraftEdits([])
  }, [selectedAssignment])

  useEffect(() => {
    if (!selectedProject) {
      setDraftViolations([])
      return
    }

    setDraftViolations(validateDraftAssignmentUseCase(selectedProject, draftSeatToPerson))
  }, [selectedProject, draftSeatToPerson])

  useEffect(() => {
    if (revealLocked) {
      return
    }

    setRevealAssignmentId(selectedAssignmentId)
  }, [selectedAssignmentId, revealLocked])

  const clearMessages = useCallback(() => {
    setNotice('')
    setError('')
  }, [])

  const saveProject = useCallback(
    async (project: ProjectDTO) => {
      const updated = await updateProjectUseCase(project)
      await refreshProjects(updated.id)
      return updated
    },
    [refreshProjects],
  )

  const handleCreateProject = useCallback(async () => {
    clearMessages()
    const name = newProjectName.trim()

    if (!name) {
      setError('プロジェクト名を入力してください。')
      return
    }

    const created = await createProjectUseCase(name)
    setNewProjectName('')
    await refreshProjects(created.id)
    setNotice('プロジェクトを作成しました。')
  }, [clearMessages, newProjectName, refreshProjects])

  const handleDeleteProject = useCallback(async () => {
    if (!selectedProject) {
      return
    }

    clearMessages()
    await deleteProjectUseCase(selectedProject.id)
    setRevealSession(null)
    await refreshProjects()
    setNotice('プロジェクトを削除しました。')
  }, [clearMessages, refreshProjects, selectedProject])

  const handleRenameProject = useCallback(async () => {
    if (!selectedProject) {
      return
    }

    clearMessages()
    const name = projectNameDraft.trim()
    if (!name) {
      setError('プロジェクト名を入力してください。')
      return
    }

    await saveProject({ ...selectedProject, name })
    setNotice('プロジェクト名を更新しました。')
  }, [clearMessages, projectNameDraft, saveProject, selectedProject])

  const handleUpdateLayout = useCallback(async () => {
    if (!selectedProject) {
      return
    }

    clearMessages()

    const rows = Math.max(1, Math.min(20, rowsDraft))
    const cols = Math.max(1, Math.min(20, colsDraft))

    const nextDisabledSeats = selectedProject.layout.disabledSeats.filter((seat) => {
      return isSeatInsideLayout({ rows, cols, disabledSeats: [] }, seat)
    })

    const nextRules = selectedProject.rules.filter((rule) => {
      if (rule.type !== 'fixedSeat') {
        return true
      }

      if (!isSeatInsideLayout({ rows, cols, disabledSeats: [] }, rule.seat)) {
        return false
      }

      return !nextDisabledSeats.includes(rule.seat)
    })

    const updated = await saveProject({
      ...selectedProject,
      layout: {
        rows,
        cols,
        disabledSeats: nextDisabledSeats,
      },
      rules: nextRules,
    })

    const prunedDraft = pruneDisabledSeats(draftSeatToPerson, updated.layout.disabledSeats)
    setDraftSeatToPerson(prunedDraft)
    setNotice('レイアウトを更新しました。')
  }, [clearMessages, colsDraft, draftSeatToPerson, rowsDraft, saveProject, selectedProject])

  const toggleDisabledSeat = useCallback(
    async (seat: SeatKey) => {
      if (!selectedProject) {
        return
      }

      clearMessages()
      const disabledSet = new Set(selectedProject.layout.disabledSeats)
      if (disabledSet.has(seat)) {
        disabledSet.delete(seat)
      } else {
        disabledSet.add(seat)
      }

      const nextDisabledSeats = [...disabledSet].sort(compareSeatKey)
      const nextRules = selectedProject.rules.filter((rule) => {
        if (rule.type !== 'fixedSeat') {
          return true
        }

        return !disabledSet.has(rule.seat)
      })

      await saveProject({
        ...selectedProject,
        layout: {
          ...selectedProject.layout,
          disabledSeats: nextDisabledSeats,
        },
        rules: nextRules,
      })

      setDraftSeatToPerson((current) => pruneDisabledSeats(current, nextDisabledSeats))
    },
    [clearMessages, saveProject, selectedProject],
  )

  const handleAddSinglePerson = useCallback(async () => {
    if (!selectedProject) {
      return
    }

    clearMessages()
    const name = singleName.trim()
    if (!name) {
      setError('名前を入力してください。')
      return
    }

    const nextPersons: PersonDTO[] = [
      ...selectedProject.persons,
      { id: uuidv4(), name, gender: 'male', absent: false },
    ]
    await saveProject({ ...selectedProject, persons: nextPersons })
    setSingleName('')
    setNotice('メンバーを追加しました。')
  }, [clearMessages, saveProject, selectedProject, singleName])

  const handleAddBulkPersons = useCallback(async () => {
    if (!selectedProject) {
      return
    }

    clearMessages()
    const names = bulkNames
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (names.length === 0) {
      setError('一括追加する名前がありません。')
      return
    }

    const newPersons: PersonDTO[] = names.map((name) => ({
      id: uuidv4(),
      name,
      gender: 'male',
      absent: false,
    }))
    await saveProject({ ...selectedProject, persons: [...selectedProject.persons, ...newPersons] })
    setBulkNames('')
    setNotice(`${newPersons.length}人を追加しました。`)
  }, [bulkNames, clearMessages, saveProject, selectedProject])

  const handleToggleAbsent = useCallback(
    async (personId: string) => {
      if (!selectedProject) {
        return
      }

      clearMessages()
      const nextPersons = selectedProject.persons.map((person) => {
        if (person.id !== personId) {
          return person
        }

        return { ...person, absent: !person.absent }
      })

      await saveProject({ ...selectedProject, persons: nextPersons })
    },
    [clearMessages, saveProject, selectedProject],
  )

  const handleToggleGender = useCallback(
    async (personId: string) => {
      if (!selectedProject || genderToggleDisabled) {
        return
      }

      clearMessages()
      const nextPersons = selectedProject.persons.map((person) => {
        if (person.id !== personId) {
          return person
        }

        return { ...person, gender: toggleGender(person.gender) }
      })

      await saveProject({ ...selectedProject, persons: nextPersons })
    },
    [clearMessages, genderToggleDisabled, saveProject, selectedProject],
  )

  const handleDeletePerson = useCallback(
    async (personId: string) => {
      if (!selectedProject) {
        return
      }

      clearMessages()
      const nextPersons = selectedProject.persons.filter((person) => person.id !== personId)
      const nextRules = filterRulesByExistingPersons(selectedProject.rules, nextPersons)
      const nextDraft: SeatToPersonMap = {}

      for (const [seat, assignedPersonId] of Object.entries(draftSeatToPerson) as [SeatKey, string][]) {
        if (assignedPersonId === personId) {
          continue
        }

        nextDraft[seat] = assignedPersonId
      }

      await saveProject({ ...selectedProject, persons: nextPersons, rules: nextRules })
      setDraftSeatToPerson(nextDraft)
    },
    [clearMessages, draftSeatToPerson, saveProject, selectedProject],
  )

  const handleAddFixedRule = useCallback(async () => {
    if (!selectedProject) {
      return
    }

    clearMessages()

    if (!fixedPersonIdDraft) {
      setError('固定席にするメンバーを選択してください。')
      return
    }

    const seat = toSeatKey(fixedSeatDraft.trim())
    if (!seat) {
      setError('席キーは r{row}c{col} 形式で入力してください。')
      return
    }

    if (!isSeatInsideLayout(selectedProject.layout, seat)) {
      setError('指定席が現在のレイアウト範囲外です。')
      return
    }

    if (selectedProject.layout.disabledSeats.includes(seat)) {
      setError('無効席は固定席に設定できません。')
      return
    }

    const nextRules = selectedProject.rules
      .filter((rule) => !(rule.type === 'fixedSeat' && rule.personId === fixedPersonIdDraft))
      .concat({
        id: uuidv4(),
        type: 'fixedSeat',
        personId: fixedPersonIdDraft,
        seat,
        hard: true,
      })

    await saveProject({ ...selectedProject, rules: nextRules })
    setFixedSeatDraft('')
    setNotice('固定席ルールを追加しました。')
  }, [clearMessages, fixedPersonIdDraft, fixedSeatDraft, saveProject, selectedProject])

  const handleRemoveRule = useCallback(
    async (ruleId: string) => {
      if (!selectedProject) {
        return
      }

      clearMessages()
      const nextRules = selectedProject.rules.filter((rule) => rule.id !== ruleId)
      await saveProject({ ...selectedProject, rules: nextRules })
    },
    [clearMessages, saveProject, selectedProject],
  )

  const handleAddSeparateRule = useCallback(async () => {
    if (!selectedProject) {
      return
    }

    clearMessages()

    if (!separateA || !separateB) {
      setError('離席ルールの2名を選択してください。')
      return
    }

    if (separateA === separateB) {
      setError('同じメンバー同士は指定できません。')
      return
    }

    const duplicate = selectedProject.rules.some((rule) => {
      if (rule.type !== 'separate') {
        return false
      }

      return (
        (rule.personAId === separateA && rule.personBId === separateB) ||
        (rule.personAId === separateB && rule.personBId === separateA)
      )
    })

    if (duplicate) {
      setError('同じ離席ルールが既に存在します。')
      return
    }

    const nextRules = selectedProject.rules.concat({
      id: uuidv4(),
      type: 'separate',
      personAId: separateA,
      personBId: separateB,
      kind: 'notAdjacent',
      hard: true,
    })

    await saveProject({ ...selectedProject, rules: nextRules })
    setNotice('離席ルールを追加しました。')
  }, [clearMessages, saveProject, selectedProject, separateA, separateB])

  const handleGenerateAssignment = useCallback(async () => {
    if (!selectedProject) {
      return
    }

    clearMessages()

    try {
      const assignment = await generateAssignmentUseCase(selectedProject)
      await refreshAssignments(selectedProject.id, assignment.id)
      setSelectedAssignmentId(assignment.id)
      setTab('setup')

      const hardCount = assignment.violations.filter(isHardViolation).length
      if (hardCount > 0) {
        setNotice(`生成は完了しましたが HARD 違反が ${hardCount} 件あります。`)
      } else {
        setNotice('席替えを生成しました。')
      }
    } catch (generationError) {
      if (generationError instanceof Error) {
        setError(generationError.message)
      } else {
        setError('生成に失敗しました。')
      }
    }
  }, [clearMessages, refreshAssignments, selectedProject])

  const handleDropSeat = useCallback(
    (toSeat: SeatKey) => {
      if (!selectedProject || !draggingSeat || draggingSeat === toSeat) {
        setDraggingSeat(null)
        return
      }

      const disabledSet = new Set(selectedProject.layout.disabledSeats)
      if (disabledSet.has(toSeat) || disabledSet.has(draggingSeat)) {
        setDraggingSeat(null)
        return
      }

      const fromPersonId = draftSeatToPerson[draggingSeat]
      if (!fromPersonId) {
        setDraggingSeat(null)
        return
      }

      const toPersonId = draftSeatToPerson[toSeat]
      const nextSeatToPerson: SeatToPersonMap = { ...draftSeatToPerson }
      let editType: AssignmentEditDTO['type'] = 'move'

      if (toPersonId) {
        nextSeatToPerson[draggingSeat] = toPersonId
        nextSeatToPerson[toSeat] = fromPersonId
        editType = 'swap'
      } else {
        delete nextSeatToPerson[draggingSeat]
        nextSeatToPerson[toSeat] = fromPersonId
      }

      // move/swap の履歴は調整保存時に Assignment.edits として残す。
      setDraftEdits((current) => [
        ...current,
        {
          type: editType,
          fromSeat: draggingSeat,
          toSeat,
          at: new Date().toISOString(),
        },
      ])
      setDraftSeatToPerson(nextSeatToPerson)
      setDraggingSeat(null)
    },
    [draftSeatToPerson, draggingSeat, selectedProject],
  )

  const handleSaveAdjustedAssignment = useCallback(async () => {
    if (!selectedProject) {
      return
    }

    clearMessages()

    const adjusted = await saveAdjustedAssignmentUseCase(
      selectedProject,
      draftSeatToPerson,
      draftEdits,
      selectedAssignment?.id,
    )

    await refreshAssignments(selectedProject.id, adjusted.id)
    setSelectedAssignmentId(adjusted.id)

    const hardCount = adjusted.violations.filter(isHardViolation).length
    if (hardCount > 0) {
      setNotice(`調整版を保存しました。HARD 違反が ${hardCount} 件あります。`)
    } else {
      setNotice('調整版を保存しました。')
    }
  }, [
    clearMessages,
    draftEdits,
    draftSeatToPerson,
    refreshAssignments,
    selectedAssignment?.id,
    selectedProject,
  ])

  const handleStartReveal = useCallback(async () => {
    if (!selectedProject || !revealAssignment) {
      return
    }

    clearMessages()
    const started = await startRevealSessionUseCase(selectedProject.id, revealAssignment, revealMode)
    setRevealSession(started)
    setTab('reveal')
  }, [clearMessages, revealAssignment, revealMode, selectedProject])

  const handleAdvanceReveal = useCallback(async () => {
    if (!revealSession) {
      return
    }

    const advanced = await advanceRevealStepUseCase(revealSession)
    setRevealSession(advanced)
  }, [revealSession])

  const handlePauseReveal = useCallback(async () => {
    if (!revealSession) {
      return
    }

    const paused = await pauseRevealSessionUseCase(revealSession)
    setRevealSession(paused)
  }, [revealSession])

  const handleResumeReveal = useCallback(async () => {
    if (!revealSession) {
      return
    }

    const resumed = await resumeRevealSessionUseCase(revealSession)
    setRevealSession(resumed)
  }, [revealSession])

  const handleFinishReveal = useCallback(async () => {
    if (!revealSession) {
      return
    }

    const finished = await finishRevealSessionUseCase(revealSession)
    setRevealSession(finished)
  }, [revealSession])

  useEffect(() => {
    if (!revealSession || revealSession.state !== 'REVEALING') {
      return
    }

    if (revealSession.mode === 'revealAll') {
      return
    }

    const timerId = window.setTimeout(() => {
      void (async () => {
        try {
          const advanced = await advanceRevealStepUseCase(revealSession)
          setRevealSession(advanced)
        } catch {
          setError('演出の進行に失敗しました。')
        }
      })()
    }, 850)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [revealSession])

  const seats = useMemo(() => {
    if (!selectedProject) {
      return [] as SeatKey[]
    }

    return listAllSeats(selectedProject.layout)
  }, [selectedProject])

  if (loading) {
    return <div className="shell">ロード中...</div>
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>席替えアプリ</h1>
          <p>制約付き自動生成 + 調整 + 演出モード</p>
        </div>
        <div className="status-messages" aria-live="polite">
          {notice ? <p className="status-notice">{notice}</p> : null}
          {error ? <p className="status-error">{error}</p> : null}
        </div>
      </header>

      <div className="layout">
        <aside className="panel sidebar">
          <h2>プロジェクト</h2>
          <div className="inline-row">
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="新規プロジェクト名"
            />
            <button type="button" onClick={() => void handleCreateProject()}>
              作成
            </button>
          </div>

          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className={project.id === selectedProjectId ? 'project-button is-active' : 'project-button'}
                  onClick={() => {
                    setSelectedProjectId(project.id)
                    setRevealSession(null)
                  }}
                  disabled={revealLocked && project.id !== selectedProjectId}
                >
                  <span>{project.name}</span>
                  <small>{formatDateTime(project.updatedAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="panel main">
          {!selectedProject ? (
            <p>プロジェクトを作成してください。</p>
          ) : (
            <>
              <div className="tabs">
                <button
                  type="button"
                  className={tab === 'setup' ? 'tab is-active' : 'tab'}
                  onClick={() => setTab('setup')}
                >
                  セットアップ
                </button>
                <button
                  type="button"
                  className={tab === 'history' ? 'tab is-active' : 'tab'}
                  onClick={() => setTab('history')}
                >
                  履歴
                </button>
                <button
                  type="button"
                  className={tab === 'reveal' ? 'tab is-active' : 'tab'}
                  onClick={() => setTab('reveal')}
                >
                  演出
                </button>
              </div>

              {tab === 'setup' ? (
                <section className="stack">
                  <article className="card">
                    <h3>1. プロジェクト情報</h3>
                    <div className="inline-row">
                      <input
                        value={projectNameDraft}
                        onChange={(event) => setProjectNameDraft(event.target.value)}
                        placeholder="プロジェクト名"
                      />
                      <button type="button" onClick={() => void handleRenameProject()}>
                        名前変更
                      </button>
                      <button type="button" className="danger" onClick={() => void handleDeleteProject()}>
                        削除
                      </button>
                    </div>
                  </article>

                  <article className="card">
                    <h3>2. レイアウト</h3>
                    <div className="inline-row">
                      <label>
                        rows
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={rowsDraft}
                          onChange={(event) => setRowsDraft(Number(event.target.value))}
                        />
                      </label>
                      <label>
                        cols
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={colsDraft}
                          onChange={(event) => setColsDraft(Number(event.target.value))}
                        />
                      </label>
                      <button type="button" onClick={() => void handleUpdateLayout()}>
                        レイアウト更新
                      </button>
                      <button type="button" onClick={() => setGenderToggleDisabled((current) => !current)}>
                        男女切替: {genderToggleDisabled ? '無効中' : '有効中'}
                      </button>
                    </div>
                    <p>席をクリックすると無効席を切り替えます。</p>
                    <div
                      className="seat-grid"
                      style={{
                        gridTemplateColumns: `repeat(${selectedProject.layout.cols}, minmax(72px, 1fr))`,
                      }}
                    >
                      {seats.map((seat) => {
                        const disabled = selectedProject.layout.disabledSeats.includes(seat)
                        return (
                          <button
                            key={seat}
                            type="button"
                            className={disabled ? 'seat-cell disabled' : 'seat-cell'}
                            onClick={() => void toggleDisabledSeat(seat)}
                          >
                            <span>{seat}</span>
                            <small>{disabled ? '無効' : '有効'}</small>
                          </button>
                        )
                      })}
                    </div>
                  </article>

                  <article className="card split">
                    <div>
                      <h3>3. メンバー</h3>
                      <div className="inline-row">
                        <input
                          value={singleName}
                          onChange={(event) => setSingleName(event.target.value)}
                          placeholder="名前"
                        />
                        <button type="button" onClick={() => void handleAddSinglePerson()}>
                          追加
                        </button>
                      </div>
                      <textarea
                        value={bulkNames}
                        onChange={(event) => setBulkNames(event.target.value)}
                        placeholder={'一括追加 (1行1名)\n例:\n田中\n佐藤'}
                        rows={5}
                      />
                      <button type="button" onClick={() => void handleAddBulkPersons()}>
                        一括追加
                      </button>
                    </div>

                    <div>
                      <h4>メンバー一覧</h4>
                      <ul className="member-list">
                        {selectedProject.persons.map((person) => (
                          <li key={person.id}>
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={person.absent}
                                onChange={() => void handleToggleAbsent(person.id)}
                              />
                              <span>{person.name}</span>
                              <small className="gender-label">{formatGenderLabel(person.gender)}</small>
                              <small>{person.absent ? '欠席' : '出席'}</small>
                            </label>
                            <div className="member-actions">
                              <button
                                type="button"
                                className={
                                  person.gender === 'female' ? 'gender-toggle is-female' : 'gender-toggle is-male'
                                }
                                onClick={() => void handleToggleGender(person.id)}
                                disabled={genderToggleDisabled}
                                aria-label={`${person.name} の性別を切り替え`}
                                title={`クリックで ${formatGenderLabel(toggleGender(person.gender))} に切り替え`}
                              >
                                {formatGenderToggleText(person.gender)}
                              </button>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => void handleDeletePerson(person.id)}
                              >
                                削除
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>

                  <article className="card split">
                    <div>
                      <h3>4. ルール</h3>
                      <h4>固定席</h4>
                      <div className="inline-row">
                        <select
                          value={fixedPersonIdDraft}
                          onChange={(event) => setFixedPersonIdDraft(event.target.value)}
                        >
                          <option value="">メンバー選択</option>
                          {selectedProject.persons.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                        <input
                          value={fixedSeatDraft}
                          onChange={(event) => setFixedSeatDraft(event.target.value)}
                          placeholder="r1c1"
                        />
                        <button type="button" onClick={() => void handleAddFixedRule()}>
                          追加
                        </button>
                      </div>

                      <h4>離席 (notAdjacent)</h4>
                      <div className="inline-row">
                        <select value={separateA} onChange={(event) => setSeparateA(event.target.value)}>
                          <option value="">personA</option>
                          {selectedProject.persons.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                        <select value={separateB} onChange={(event) => setSeparateB(event.target.value)}>
                          <option value="">personB</option>
                          {selectedProject.persons.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => void handleAddSeparateRule()}>
                          追加
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4>ルール一覧</h4>
                      <ul className="rule-list">
                        {selectedProject.rules.map((rule) => (
                          <li key={rule.id}>
                            <span>
                              {rule.type === 'fixedSeat'
                                ? `fixedSeat: ${personNameMap.get(rule.personId) ?? rule.personId} -> ${rule.seat}`
                                : rule.type === 'separate'
                                  ? `separate: ${personNameMap.get(rule.personAId) ?? rule.personAId} / ${personNameMap.get(rule.personBId) ?? rule.personBId}`
                                  : 'avoidSameSeatFromLast (future)'}
                            </span>
                            <button type="button" className="ghost" onClick={() => void handleRemoveRule(rule.id)}>
                              削除
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>

                  <article className="card">
                    <h3>5. 生成 & 7. 調整</h3>
                    <div className="inline-row">
                      <button type="button" onClick={() => void handleGenerateAssignment()}>
                        GenerateAssignment
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveAdjustedAssignment()}
                        disabled={Object.keys(draftSeatToPerson).length === 0}
                      >
                        SaveAdjustedAssignment
                      </button>
                    </div>

                    {selectedAssignment ? (
                      <p>
                        編集対象: {selectedAssignment.id} ({formatDateTime(selectedAssignment.createdAt)})
                      </p>
                    ) : (
                      <p>履歴から Assignment を選択すると調整できます。</p>
                    )}

                    <div
                      className="seat-grid"
                      style={{
                        gridTemplateColumns: `repeat(${selectedProject.layout.cols}, minmax(120px, 1fr))`,
                      }}
                    >
                      {seats.map((seat) => {
                        const disabled = selectedProject.layout.disabledSeats.includes(seat)
                        const personId = draftSeatToPerson[seat]
                        const name = personId ? personNameMap.get(personId) ?? personId : ''

                        return (
                          <div
                            key={seat}
                            className={disabled ? 'seat-card disabled' : 'seat-card'}
                            onDragOver={(event) => {
                              event.preventDefault()
                            }}
                            onDrop={() => handleDropSeat(seat)}
                          >
                            <strong>{seat}</strong>
                            {disabled ? (
                              <span className="muted">無効席</span>
                            ) : personId ? (
                              <button
                                type="button"
                                draggable
                                className="person-chip"
                                onDragStart={() => setDraggingSeat(seat)}
                                onDragEnd={() => setDraggingSeat(null)}
                              >
                                {name}
                              </button>
                            ) : (
                              <span className="muted">空席</span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="violation-box">
                      <h4>8. 制約検証結果</h4>
                      {draftViolations.length === 0 ? (
                        <p>違反はありません。</p>
                      ) : (
                        <ul>
                          {draftViolations.map((violation, index) => (
                            <li key={`${violation.type}-${index}`} className={isHardViolation(violation) ? 'hard' : 'soft'}>
                              <strong>{violation.severity}</strong> {violation.type}: {violation.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                </section>
              ) : null}

              {tab === 'history' ? (
                <section className="stack">
                  <article className="card">
                    <h3>6. Assignment履歴</h3>
                    <p>保存時は常に新規 Assignment が追加されます。</p>

                    <ul className="history-list">
                      {assignments.map((assignment) => {
                        const hardCount = assignment.violations.filter(isHardViolation).length
                        const selected = assignment.id === selectedAssignmentId
                        return (
                          <li key={assignment.id} className={selected ? 'history-item is-active' : 'history-item'}>
                            <div>
                              <strong>{assignment.id}</strong>
                              <small>{formatDateTime(assignment.createdAt)}</small>
                            </div>
                            <div>
                              <span>HARD: {hardCount}</span>
                              <span>ALL: {assignment.violations.length}</span>
                            </div>
                            <div className="inline-row">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAssignmentId(assignment.id)
                                  setTab('setup')
                                }}
                                disabled={revealLocked && assignment.id !== selectedAssignmentId}
                              >
                                調整へ
                              </button>
                              <button
                                type="button"
                                onClick={() => setRevealAssignmentId(assignment.id)}
                                disabled={revealLocked && assignment.id !== revealAssignmentId}
                              >
                                演出対象
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </article>
                </section>
              ) : null}

              {tab === 'reveal' ? (
                <section className="stack">
                  <article className="card">
                    <h3>9. 演出モード</h3>
                    {!revealAssignment ? <p>履歴から演出対象の Assignment を選択してください。</p> : null}

                    <div className="inline-row">
                      <label>
                        mode
                        <select
                          value={revealMode}
                          onChange={(event) => setRevealMode(event.target.value as RevealMode)}
                          disabled={revealLocked}
                        >
                          <option value="roulette">roulette</option>
                          <option value="revealAll">revealAll</option>
                          <option value="block">block</option>
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={() => void handleStartReveal()}
                        disabled={!revealAssignment || revealLocked}
                      >
                        StartRevealSession
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleAdvanceReveal()}
                        disabled={!revealSession || revealSession.state !== 'REVEALING'}
                      >
                        AdvanceRevealStep
                      </button>

                      <button
                        type="button"
                        onClick={() => void handlePauseReveal()}
                        disabled={!revealSession || revealSession.state !== 'REVEALING'}
                      >
                        Pause
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleResumeReveal()}
                        disabled={!revealSession || revealSession.state !== 'PAUSED'}
                      >
                        Resume
                      </button>

                      <button type="button" onClick={() => void handleFinishReveal()} disabled={!revealSession}>
                        FinishRevealSession
                      </button>
                    </div>

                    <p>
                      状態: <strong>{revealSession?.state ?? 'IDLE'}</strong>
                    </p>

                    {revealAssignment ? (
                      <div
                        className="seat-grid"
                        style={{
                          gridTemplateColumns: `repeat(${selectedProject.layout.cols}, minmax(120px, 1fr))`,
                        }}
                      >
                        {seats.map((seat) => {
                          const disabled = selectedProject.layout.disabledSeats.includes(seat)
                          const personId = revealAssignment.seatToPerson[seat]
                          const visible = personId
                            ? revealSession?.assignmentId === revealAssignment.id &&
                              (revealedPersonIdSet.has(personId) || revealSession.state === 'FINISHED')
                            : false
                          const revealClassName = disabled
                            ? 'seat-card disabled'
                            : visible
                              ? 'seat-card is-revealed'
                              : 'seat-card'

                          return (
                            <div key={seat} className={revealClassName}>
                              <strong>{seat}</strong>
                              {disabled ? (
                                <span className="muted">無効席</span>
                              ) : personId ? (
                                <span className={visible ? 'revealed-name' : 'hidden-name'}>
                                  {visible ? personNameMap.get(personId) ?? personId : '???'}
                                </span>
                              ) : (
                                <span className="muted">空席</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </article>
                </section>
              ) : null}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
