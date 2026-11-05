/**
 * The 3D stage behind the diff pane's model preview.
 *
 * three.js and the one loader a model needs are imported dynamically, so the
 * viewer — three's core plus a single loader, ~1.8 MB unbundled-minified —
 * only loads when a model is actually selected, and a repository full of .pngs
 * never pays for it. Loaders are handed a LoadingManager whose URL
 * modifier answers every request from the sidecar bytes main already sent
 * (src/shared/model-resources.ts explains the matching), so a .gltf gets its
 * buffers and textures and an .obj its material library without the renderer
 * ever touching the file system.
 */

import type * as Three from 'three'
import type { FilePreview, PreviewResource } from '../../../shared/models'
import {
  type ModelFormat,
  extensionOf,
  findModelResource,
  modelFormatFor,
  normalizeRepoPath,
  repoDirOf
} from '../../../shared/model-resources'

/** What the caption reports once the stage exists. */
export interface ModelViewerInfo {
  readonly meshes: number
  readonly triangles: number
  /** Scan samples, when the file carries points instead of faces. */
  readonly points: number
  readonly resources: number
  readonly animations: number
}

export interface ModelViewer {
  dispose(): void
  resetView(): void
  setWireframe(on: boolean): void
  setGrid(on: boolean): void
}

const IMAGE_MIMES: ReadonlyMap<string, string> = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['bmp', 'image/bmp'],
  ['avif', 'image/avif'],
  ['svg', 'image/svg+xml']
])

export async function createModelViewer(options: {
  host: HTMLElement
  path: string
  preview: FilePreview
}): Promise<{ viewer: ModelViewer; info: ModelViewerInfo }> {
  const format = modelFormatFor(options.path)
  const data = options.preview.data
  if (format === null) throw new Error('Unsupported model format')
  if (data === undefined) throw new Error('No model bytes to read')

  const THREE = await import('three')
  const sidecars = new Sidecars(options.preview)
  const manager = new THREE.LoadingManager()
  manager.setURLModifier(url => sidecars.urlFor(url) ?? url)

  let loaded: { object: Three.Object3D; animations: Three.AnimationClip[] }
  try {
    loaded = await loadModel(THREE, manager, format, options.path, data, sidecars)
  } catch (err) {
    sidecars.dispose()
    throw err
  }

  // The first clip plays automatically, so the stage has to be big enough for
  // the whole performance and not just the pose at import time: an FBX or Collada
  // figure that steps across its origin would otherwise walk out of the frame.
  const mixer =
    loaded.animations.length > 0 ? new THREE.AnimationMixer(loaded.object) : null
  const box = new THREE.Box3()
  if (mixer === null) {
    box.setFromObject(loaded.object)
  } else {
    const clip = loaded.animations[0]
    mixer.clipAction(clip).play()
    for (let sample = 0; sample <= 16; sample++) {
      mixer.setTime((clip.duration * sample) / 16)
      // expandByObject refreshes the object's own ancestors, not its children,
      // and the pose lives in the children.
      loaded.object.updateMatrixWorld(true)
      box.expandByObject(loaded.object)
    }
    mixer.setTime(0)
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 1
  const center = Number.isFinite(sphere.center.x) ? sphere.center : new THREE.Vector3()

  const scene = new THREE.Scene()
  scene.add(loaded.object)

  // One key, one fill, one rim: enough for PBR materials to read without an
  // environment map, and no dependence on the asset's own lights.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f46, 1.7))
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(1, 1.4, 1).multiplyScalar(radius * 4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.9)
  fill.position.set(-1.2, 0.6, -1).multiplyScalar(radius * 4)
  scene.add(fill)

  // The grid sits on the model's own floor plane; its span follows the model,
  // so a centimetre-scale FBX and a metre-scale glTF read the same.
  const grid = new THREE.GridHelper(radius * 4, 16, 0x8d949e, 0x5b6068)
  grid.position.set(center.x, box.isEmpty() ? center.y - radius : box.min.y, center.z)
  const gridMaterials = materialsOf(grid.material)
  for (const material of gridMaterials) {
    material.transparent = true
    material.opacity = 0.32
  }
  scene.add(grid)

  const camera = new THREE.PerspectiveCamera(45, 1, radius / 1000, radius * 200 + 100)
  const viewDirection = new THREE.Vector3(0.8, 0.45, 1).normalize()
  /**
   * Distance that keeps the whole model inside the pane: the tightest of the
   * vertical and horizontal fields of view, plus a little air. A narrow pane
   * needs more distance than a square one, and the diff pane is often narrow.
   */
  const frameDistance = (): number => {
    const vertical = THREE.MathUtils.degToRad(camera.fov)
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect)
    return (radius * 1.06) / Math.sin(Math.min(vertical, horizontal) / 2)
  }
  const home = (): Three.Vector3 => viewDirection.clone().multiplyScalar(frameDistance())
  camera.position.copy(center).add(home())
  camera.lookAt(center)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const canvas = renderer.domElement
  canvas.tabIndex = 0
  options.host.appendChild(canvas)

  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
  const controls = new OrbitControls(camera, canvas)
  controls.target.copy(center)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  // Until the viewer touches the model, the stage keeps it framed: resizing the
  // diff pane or the terminal drawer re-frames rather than leaving it stranded.
  let framed = true
  controls.addEventListener('start', () => {
    framed = false
  })

  const resize = (): void => {
    const width = Math.max(1, options.host.clientWidth)
    const height = Math.max(1, options.host.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (framed) {
      camera.position.copy(center).add(home())
      controls.update()
    }
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(options.host)

  const materials = new Set<Three.Material>()
  let meshes = 0
  let points = 0
  let triangles = 0
  loaded.object.traverse(node => {
    const mesh = node as Three.Mesh
    if (mesh.isMesh !== true) {
      const cloud = node as Three.Points
      if (cloud.isPoints === true) {
        points += cloud.geometry.getAttribute('position')?.count ?? 0
      }
      return
    }
    meshes++
    const geometry = mesh.geometry as Three.BufferGeometry | undefined
    const position = geometry?.getAttribute('position')
    if (geometry !== undefined && position !== undefined) {
      triangles += geometry.index !== null ? geometry.index.count / 3 : position.count / 3
    }
    for (const material of materialsOf(mesh.material)) materials.add(material)
  })

  const clock = new THREE.Clock()
  let frame = requestAnimationFrame(tick)
  let contextLost = false
  const onContextLost = (event: Event): void => {
    contextLost = true
    event.preventDefault()
  }
  canvas.addEventListener('webglcontextlost', onContextLost)

  function tick(): void {
    frame = requestAnimationFrame(tick)
    if (contextLost) return
    const delta = clock.getDelta()
    if (mixer !== null) mixer.update(delta)
    controls.update()
    renderer.render(scene, camera)
  }

  return {
    info: {
      meshes,
      triangles: Math.round(triangles),
      points,
      resources: sidecars.count,
      animations: loaded.animations.length
    },
    viewer: {
      resetView(): void {
        framed = true
        camera.position.copy(center).add(home())
        controls.target.copy(center)
        camera.lookAt(center)
        controls.update()
      },
      setWireframe(on: boolean): void {
        for (const material of materials) {
          (material as Three.MeshStandardMaterial).wireframe = on
        }
      },
      setGrid(on: boolean): void {
        grid.visible = on
      },
      dispose(): void {
        cancelAnimationFrame(frame)
        observer.disconnect()
        canvas.removeEventListener('webglcontextlost', onContextLost)
        controls.dispose()
        loaded.object.traverse(node => {
          const mesh = node as Three.Mesh
          mesh.geometry?.dispose()
          for (const material of materialsOf(mesh.material)) {
            for (const texture of texturesOf(material)) texture.dispose()
            material.dispose()
          }
        })
        grid.geometry.dispose()
        for (const material of gridMaterials) material.dispose()
        renderer.dispose()
        canvas.remove()
        sidecars.dispose()
      }
    }
  }
}

/**
 * The model plus everything it points at, decoded with the loader that fits.
 * Each loader sits behind its own dynamic import, so an FBX-only project never
 * downloads the Collada parser and vice versa.
 */
async function loadModel(
  THREE: typeof Three,
  manager: Three.LoadingManager,
  format: ModelFormat,
  path: string,
  data: ArrayBuffer,
  sidecars: Sidecars
): Promise<{ object: Three.Object3D; animations: Three.AnimationClip[] }> {
  const baseDir = `${repoDirOf(normalizeRepoPath(path) ?? path)}/`
  switch (format) {
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const gltf = await new GLTFLoader(manager).parseAsync(data, baseDir)
      return { object: gltf.scene, animations: gltf.animations }
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      const group = new FBXLoader(manager).parse(data, baseDir)
      return { object: group, animations: group.animations }
    }
    case 'obj': {
      const [{ OBJLoader }, { MTLLoader }] = await Promise.all([
        import('three/examples/jsm/loaders/OBJLoader.js'),
        import('three/examples/jsm/loaders/MTLLoader.js')
      ])
      const loader = new OBJLoader(manager)
      const library = sidecars.firstText('mtl')
      if (library !== null) {
        try {
          loader.setMaterials(
            new MTLLoader(manager).parse(library.text, `${repoDirOf(library.path)}/`)
          )
        } catch {
          // A library that will not parse leaves the model untextured, not broken.
        }
      }
      return { object: loader.parse(decodeText(data)), animations: [] }
    }
    case 'dae': {
      const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js')
      const dae = new ColladaLoader(manager).parse(decodeText(data), baseDir)
      // Collada reports clips on the scene; the flat `animations` property is the
      // deprecated alias and the loader warns about it.
      return { object: dae.scene, animations: dae.scene.animations }
    }
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
      const geometry = new STLLoader(manager).parse(data)
      // An STL is always a bag of triangles — the loader just does not index them.
      return { object: meshFromGeometry(THREE, geometry, 'stl'), animations: [] }
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js')
      const geometry = new PLYLoader(manager).parse(data)
      return { object: meshFromGeometry(THREE, geometry, 'ply'), animations: [] }
    }
  }
}

/**
 * A neutral surface for formats that carry no materials at all (.stl/.ply). A
 * PLY with no faces is a scan, not a mesh, and shows as its samples.
 */
function meshFromGeometry(
  THREE: typeof Three,
  geometry: Three.BufferGeometry,
  format: ModelFormat
): Three.Object3D {
  geometry.computeBoundingSphere()
  if (geometry.getAttribute('normal') === undefined) geometry.computeVertexNormals()
  const vertexColors = geometry.getAttribute('color') !== undefined
  if (format === 'ply' && geometry.index === null) {
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.012,
        sizeAttenuation: true,
        color: 0xb4bac2,
        vertexColors
      })
    )
  }
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xb4bac2,
      metalness: 0.05,
      roughness: 0.62,
      vertexColors
    })
  )
}

/** The sidecar payload, addressable as blob URLs and as text. */
class Sidecars {
  readonly urls = new Map<string, string>()
  private readonly entries = new Map<string, PreviewResource>()
  private readonly objectUrls: string[] = []

  constructor(preview: FilePreview) {
    for (const resource of preview.resources ?? []) {
      const key = normalizeRepoPath(resource.path)
      if (key === null) continue
      const mime = IMAGE_MIMES.get(extensionOf(resource.path) ?? '') ?? 'application/octet-stream'
      const url = URL.createObjectURL(new Blob([resource.data], { type: mime }))
      this.objectUrls.push(url)
      this.urls.set(key, url)
      this.entries.set(key, resource)
    }
  }

  get count(): number {
    return this.entries.size
  }

  /** The blob URL for whatever a loader just asked for, or the URL untouched. */
  urlFor(requested: string): string | undefined {
    if (/^(data|blob|https?):/i.test(requested)) return requested
    return findModelResource(this.urls, requested)
  }

  /**
   * The first sidecar of an extension, decoded. Used for an .obj's material
   * library: main only ever sent libraries the file itself named, so the one
   * that arrived is the one the model asked for.
   */
  firstText(extension: string): { path: string; text: string } | null {
    for (const [path, resource] of this.entries) {
      if (extensionOf(path) === extension) return { path, text: decodeText(resource.data) }
    }
    return null
  }

  dispose(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url)
    this.objectUrls.length = 0
  }
}

const decoder = new TextDecoder('utf-8')

function decodeText(data: ArrayBuffer): string {
  return decoder.decode(data)
}

function materialsOf(
  material: Three.Material | Three.Material[] | undefined
): Three.Material[] {
  if (material === undefined) return []
  return Array.isArray(material) ? material : [material]
}

function texturesOf(material: Three.Material): Three.Texture[] {
  const out: Three.Texture[] = []
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    const texture = value as Three.Texture | undefined
    if (texture?.isTexture === true) out.push(texture)
  }
  return out
}
