# 席替えアプリ 仕様書 v1.0

## 目次
- [概要](#概要)
- [1. プロジェクト管理](#1-プロジェクト管理)
- [2. レイアウト管理](#2-レイアウト管理)
- [3. メンバー管理](#3-メンバー管理)
- [4. ルール](#4-ルール)
- [5. 席生成](#5-席生成)
- [6. Assignment仕様](#6-assignment仕様)
- [7. ドラッグ＆ドロップ調整](#7-ドラッグドロップ調整)
- [8. 制約検証](#8-制約検証)
- [9. 演出モード](#9-演出モード)
- [10. 永続化（IndexedDB）](#10-永続化indexeddb)
- [11. UseCase一覧](#11-usecase一覧)
- [12. 非機能要件](#12-非機能要件)
- [13. Definition of Done](#13-definition-of-done)
- [将来拡張](#将来拡張)

## 概要
制約付きで席替えを自動生成し、演出モードで発表できるアプリ。  
生成後にドラッグ＆ドロップで微調整可能。  
調整後は新規履歴として保存する。

### 前提
- 個人開発
- 投影メイン
- Local-first（IndexedDB）
- バックエンドなし（将来追加可能設計）

## 1. プロジェクト管理
- プロジェクト作成
- プロジェクト一覧表示
- 名前変更
- 削除（任意）

## 2. レイアウト管理
- `rows × cols` グリッド
- 無効席（`disabledSeats`）指定可能
- SeatKey形式: `"r{row}c{col}"`（例: `r3c5`）

### 制約
- 無効席には割当不可

## 3. メンバー管理
- 名前追加
- 一括追加（貼り付け）
- 欠席フラグ

### 制約
- `absent=true` の人は割当対象外

## 4. ルール

### 4.1 固定席
- `type: "fixedSeat"`
- `personId`
- `seat`
- `hard: true`

意味:  
指定人物は必ず指定席に座る

### 4.2 離席ルール
- `type: "separate"`
- `personAId`
- `personBId`
- `kind: "notAdjacent"`
- `hard: true`

意味:  
上下左右で隣接してはならない

### 4.3 前回回避（将来機能）
- `type: "avoidSameSeatFromLast"`
- `mode: "soft"`
- `scope: "last"`

意味:  
直近の席と同じになることをできれば避ける

## 5. 席生成

### 入力
- `layout`
- `persons`（`absent`除外）
- `rules`
- `options`

### 処理
1. 固定席配置
2. 残りシャッフル
3. 制約チェック
4. 必要ならリトライ

### 出力
- `Assignment`

## 6. Assignment仕様
- `id`（UUID）
- `projectId`
- `createdAt`（ISO8601）
- `seatToPerson`（`SeatKey -> PersonId`）
- `violations`（保存時点の診断結果）
- `edits`（任意）
- `commit`（任意）

### 特性
- immutable（更新不可）
- 保存時は常に新規作成

## 7. ドラッグ＆ドロップ調整

### 操作
- Seat単位でドラッグ
- Drop先に人がいればswap
- Drop先が空ならmove

### 編集状態（UI）
- `draftSeatToPerson`
- `draftViolations`
- `draftEdits`

### 検証
- ドロップ毎に `validate` 実行
- 違反一覧表示

### 保存
- `SaveAdjustedAssignmentUseCase` 実行
- 新規Assignmentとして保存
- Hard違反があっても保存可能（警告表示）

## 8. 制約検証
`validateAssignment(project, seatToPerson)`

### 違反タイプ
- `DISABLED_SEAT_USED`
- `FIXED_SEAT_BROKEN`
- `NOT_ADJACENT`
- `DUPLICATE_PERSON`
- `UNASSIGNED_PERSON`

### 戻り値
- `ConstraintViolationDTO[]`

### Hard違反
- `severity = HARD`

### Soft違反
- `severity = SOFT`

## 9. 演出モード

### 演出開始
- 対象Assignmentをロック
- RevealSession生成

### 状態
- `IDLE`
- `REVEALING`
- `PAUSED`
- `FINISHED`

### 表示モード
- `roulette`
- `revealAll`
- `block`

## 10. 永続化（IndexedDB）

### ストア
`projects`
- key: `projectId`
- value: `ProjectDTO`

`assignments`
- key: `assignmentId`
- index: `projectId`
- value: `AssignmentDTO`

`revealSessions`（任意）

## 11. UseCase一覧

### Project系
- `CreateProject`
- `UpdateProject`
- `GetProject`
- `ListProjects`

### Assignment系
- `GenerateAssignment`
- `GetAssignment`
- `ListAssignments`
- `SaveAdjustedAssignment`

### Validation系
- `ValidateDraftAssignment`

### Reveal系
- `StartRevealSession`
- `AdvanceRevealStep`
- `FinishRevealSession`

## 12. 非機能要件
- 30〜50人で問題なく動作
- D&Dでスムーズな描画（60fps目標）
- 永続化はIndexedDB
- データ削除時の復旧保証なし（将来export対応可）

## 13. Definition of Done
- 生成→保存→履歴表示可能
- D&Dでswap可能
- Hard違反が表示される
- Hard違反ありでも保存可能
- 保存すると履歴に新Assignment追加
- 履歴から演出モードへ遷移可能

## 将来拡張
- 前回回避の強化（n回）
- Soft制約スコア最適化
- Undo/Redo
- JSONエクスポート/インポート
- バックエンド追加（Repository差し替えで対応）
