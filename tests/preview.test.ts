import { describe, expect, it } from 'vitest'
import { PREVIEW_SIZE_LIMIT, previewKindFor } from '../src/main/git/preview'

describe('previewKindFor', () => {
  it('classifies images, video and audio by extension', () => {
    expect(previewKindFor('assets/logo.png')).toEqual({ kind: 'image', mime: 'image/png' })
    expect(previewKindFor('video/clip.mp4')?.kind).toBe('video')
    expect(previewKindFor('audio/song.flac')?.kind).toBe('audio')
  })

  it('is case-insensitive and covers common aliases', () => {
    expect(previewKindFor('PHOTO.JPG')?.mime).toBe('image/jpeg')
    expect(previewKindFor('clip.webm')?.kind).toBe('video')
    expect(previewKindFor('track.m4a')?.kind).toBe('audio')
  })

  it('refuses text, unknown and dot-tricky paths', () => {
    expect(previewKindFor('src/main.ts')).toBeNull()
    expect(previewKindFor('data.bin')).toBeNull()
    expect(previewKindFor('README')).toBeNull()
    expect(previewKindFor('file.')).toBeNull()
    // A dot in a directory segment is not an extension boundary.
    expect(previewKindFor('v1.2/png')).toBeNull()
    expect(previewKindFor('.png')).toEqual({ kind: 'image', mime: 'image/png' })
  })

  it('caps the preview payload size', () => {
    expect(PREVIEW_SIZE_LIMIT).toBe(128 * 1024 * 1024)
  })
})
