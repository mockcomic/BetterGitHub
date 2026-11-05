import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { FilePreview } from '../../../shared/models'
import { formatBytes } from '../format'
import {
  createModelViewer,
  type ModelViewer,
  type ModelViewerInfo
} from '../model-view/viewer'

/**
 * The 3D stage for a model change: orbit with the mouse, wheel to zoom, and the
 * three checks a reviewer actually wants — is it the right shape, is the
 * topology sound, is there a floor. The viewer itself lives in
 * src/renderer/src/model-view/viewer.ts; this component owns its lifecycle and
 * the states around it.
 */
export function ModelPreview({
  preview,
  path
}: {
  preview: FilePreview
  /** Repository path — it decides which loader reads the bytes. */
  path: string | null
}): JSX.Element {
  const host = useRef<HTMLDivElement | null>(null)
  const viewer = useRef<ModelViewer | null>(null)
  // Kept in a ref as well as state: the toggles must survive (and be applied
  // to) the next model without re-running the load.
  const flags = useRef({ wireframe: false, grid: true })
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [info, setInfo] = useState<ModelViewerInfo | null>(null)
  const [wireframe, setWireframe] = useState(flags.current.wireframe)
  const [grid, setGrid] = useState(flags.current.grid)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const element = host.current
    if (path === null || preview.data === undefined || element === null) {
      setMessage(path === null ? 'No file selected.' : 'No model bytes to read.')
      setPhase('error')
      return
    }
    let disposed = false
    setPhase('loading')
    setMessage(null)
    setInfo(null)
    void createModelViewer({ host: element, path, preview })
      .then(result => {
        if (disposed) {
          result.viewer.dispose()
          return
        }
        result.viewer.setWireframe(flags.current.wireframe)
        result.viewer.setGrid(flags.current.grid)
        viewer.current = result.viewer
        setInfo(result.info)
        setPhase('ready')
      })
      .catch((err: unknown) => {
        if (disposed) return
        setMessage(err instanceof Error ? err.message : String(err))
        setPhase('error')
      })
    return () => {
      disposed = true
      viewer.current?.dispose()
      viewer.current = null
    }
    // `attempt` restarts the load from the error state's Try again button.
  }, [preview, path, attempt])

  const toggle = (key: 'wireframe' | 'grid'): void => {
    const next = !flags.current[key]
    flags.current[key] = next
    if (key === 'wireframe') setWireframe(next)
    else setGrid(next)
    if (key === 'wireframe') viewer.current?.setWireframe(next)
    else viewer.current?.setGrid(next)
  }

  return (
    <div className="model-preview">
      <div className="model-stage" ref={host} />
      {phase === 'loading' && <p className="muted model-note">Loading model…</p>}
      {phase === 'error' && (
        <div className="model-error">
          <p className="muted">
            {labelFor(path)} could not be shown here — Aspen reads {SUPPORTED}.
          </p>
          {message !== null && message !== '' && <p className="diff-error">{message}</p>}
          <p>
            <button className="btn" onClick={() => setAttempt(n => n + 1)}>
              Try again
            </button>
          </p>
        </div>
      )}
      <div className="model-toolbar">
        <button
          className="mini"
          title="Frame the whole model again"
          onClick={() => viewer.current?.resetView()}
          disabled={phase !== 'ready'}
        >
          Reset view
        </button>
        <button
          className="mini"
          title="Show only the edges"
          aria-pressed={wireframe}
          onClick={() => toggle('wireframe')}
          disabled={phase !== 'ready'}
        >
          Wireframe
        </button>
        <button
          className="mini"
          title="Show the floor grid"
          aria-pressed={grid}
          onClick={() => toggle('grid')}
          disabled={phase !== 'ready'}
        >
          Grid
        </button>
      </div>
      {info !== null && (
        <p className="media-caption muted">
          {labelFor(path)} · {formatBytes(preview.byteLength)} ·{' '}
          {info.triangles > 0
            ? `${count(info.triangles, 'triangle')} · ${count(info.meshes, 'mesh')}`
            : count(info.points, 'point')}
          {info.resources > 0 &&
            ` · ${count(info.resources, 'sidecar')} from this ${
              preview.resourcesTruncated === true ? 'incomplete ' : ''
            }set`}
          {info.animations > 0 && ` · playing 1 of ${count(info.animations, 'animation')}`}
        </p>
      )}
    </div>
  )
}

const SUPPORTED = '.glb, .gltf, .fbx, .obj, .stl, .ply and .dae'

/** "1 mesh" / "12 meshes" — the caption should read like English. */
function count(n: number, singular: string): string {
  const value = n.toLocaleString()
  return n === 1 ? `${value} ${singular}` : `${value} ${singular}s`
}

function labelFor(path: string | null): string {
  if (path === null) return 'Model'
  const ext = path.slice(path.lastIndexOf('.') + 1).toUpperCase()
  return /^[A-Z0-9]{1,4}$/.test(ext) ? `${ext} model` : 'Model'
}
