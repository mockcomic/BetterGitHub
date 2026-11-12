import { describe, expect, it } from 'vitest'
import type { AiBatchOutcome } from '../src/renderer/src/ai-batch'
import { summarizeAiBatch } from '../src/renderer/src/ai-batch'

function outcome(
  path: string,
  kind: AiBatchOutcome['kind'],
  detail = ''
): AiBatchOutcome {
  return { path, kind, detail }
}

describe('summarizeAiBatch', () => {
  it('celebrates a pass that cleared the whole list', () => {
    const report = summarizeAiBatch(
      [outcome('a.ts', 'resolved'), outcome('b.ts', 'resolved')],
      2
    )
    expect(report.tone).toBe('success')
    expect(report.message).toBe('AI merged all 2 conflicts.')
    expect(report.left).toBe(0)
  })

  it('uses the singular line for a single conflict', () => {
    expect(summarizeAiBatch([outcome('a.ts', 'resolved')], 1).message).toBe(
      'AI merged the conflict.'
    )
  })

  it('counts the leftovers it did not clear and says what still needs the reader', () => {
    const report = summarizeAiBatch(
      [
        outcome('a.ts', 'resolved'),
        outcome('b.ts', 'resolved'),
        outcome('c.ts', 'asked'),
        outcome('d.ts', 'failed', 'binary')
      ],
      4
    )
    expect(report).toMatchObject({ tone: 'info', resolved: 2, left: 2 })
    expect(report.message).toBe(
      'AI merged 2 of 4 conflicts — 2 still need you.'
    )
  })

  it('switches to the singular verb for one leftover', () => {
    const report = summarizeAiBatch(
      [outcome('a.ts', 'resolved'), outcome('b.ts', 'asked')],
      2
    )
    expect(report.message).toBe(
      'AI merged 1 of 2 conflicts — 1 still needs you.'
    )
  })

  it('names the reason when nothing landed', () => {
    const report = summarizeAiBatch(
      [
        outcome('a.ts', 'failed', 'The our side version is binary.'),
        outcome('b.ts', 'failed', 'HTTP 500')
      ],
      2
    )
    expect(report.tone).toBe('error')
    expect(report.message).toBe(
      'The AI merge agent merged none of the 2 conflicts — The our side version is binary.'
    )
  })

  it('says the agent refused to guess when every file asked', () => {
    const report = summarizeAiBatch(
      [outcome('a.ts', 'asked'), outcome('b.ts', 'asked')],
      2
    )
    expect(report.tone).toBe('error')
    expect(report.message).toMatch(/would not guess on any of the 2 conflicts/)
  })

  it('reports a stopped pass by what it managed before stopping', () => {
    const report = summarizeAiBatch(
      [outcome('a.ts', 'resolved'), outcome('b.ts', 'resolved')],
      7,
      'stopped'
    )
    expect(report.tone).toBe('info')
    expect(report.message).toBe('Stopped — AI merged 2 of 7 conflicts.')
    expect(report.left).toBe(5)
  })

  it('is honest about a stop before the first file landed', () => {
    const report = summarizeAiBatch([], 3, 'stopped')
    expect(report.message).toBe(
      'Stopped before the AI merge agent finished any conflict.'
    )
  })
})
