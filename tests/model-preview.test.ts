import { execFileSync } from 'child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { collectModelResources } from '../src/main/git/preview'

/**
 * The sidecar walk against real files in a throwaway folder: a .gltf whose
 * buffer and images live beside it, an .obj two hops from its textures through
 * a .mtl, and the references a repository does not actually contain.
 */

let root = ''

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'aspen-preview-'))
  const write = async (path: string, text: string): Promise<void> => {
    const target = join(root, path)
    await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true })
    await writeFile(target, text, 'utf8')
  }
  await write('art/gltf/robot.gltf', JSON.stringify({
    buffers: [{ uri: 'robot.bin' }],
    images: [{ uri: 'textures/body.png' }, { uri: 'textures/gone.png' }]
  }))
  await write('art/gltf/robot.bin', 'GEOMETRY')
  await write('art/gltf/textures/body.png', 'PNG')
  await write('art/obj/robot.obj', 'mtllib robot.mtl\nv 0 0 0\n')
  await write('art/obj/robot.mtl', 'newmtl body\nmap_Kd -s 1 1 1 tex/body.jpg\n')
  await write('art/obj/tex/body.jpg', 'JPEG')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

const bytes = (root_: string, path: string): Promise<Buffer> =>
  import('fs/promises').then(fs => fs.readFile(join(root_, path)))

describe('collectModelResources', () => {
  it('follows a glTF manifest to its buffer and images', async () => {
    const result = await collectModelResources(
      root,
      'art/gltf/robot.gltf',
      undefined,
      await bytes(root, 'art/gltf/robot.gltf')
    )
    expect(result.resources.map(r => r.path)).toEqual([
      'art/gltf/robot.bin',
      'art/gltf/textures/body.png'
    ])
    expect(Buffer.from(result.resources[0].data).toString('utf8')).toBe('GEOMETRY')
    expect(result.resources[0].byteLength).toBe(8)
    // A reference to a file the repository does not have is dropped, and the
    // preview still stands: the model renders, just without that texture.
    expect(result.resourcesTruncated).toBeUndefined()
  })

  it('follows an obj through its material library to the library’s images', async () => {
    const result = await collectModelResources(
      root,
      'art/obj/robot.obj',
      undefined,
      await bytes(root, 'art/obj/robot.obj')
    )
    expect(result.resources.map(r => r.path)).toEqual([
      'art/obj/robot.mtl',
      'art/obj/tex/body.jpg'
    ])
  })

  it('returns nothing for a model that references nothing', async () => {
    const result = await collectModelResources(
      root,
      'art/obj/robot.stl',
      undefined,
      await bytes(root, 'art/obj/tex/body.jpg')
    )
    expect(result.resources).toEqual([])
  })

  it('refuses to read outside the repository', async () => {
    const outside = join(root, '..')
    const result = await collectModelResources(
      root,
      'art/gltf/robot.gltf',
      undefined,
      Buffer.from(
        JSON.stringify({ buffers: [{ uri: '../../escape.bin' }], images: [] })
      )
    )
    // The escape never reaches the reader: resolveModelUri stops it at the door.
    expect(outside).not.toBe(root)
    expect(result.resources).toEqual([])
  })
})

/**
 * The same walk over a commit's tree, which is what the History tab asks for.
 * Sidecars must come out of the object store — reading the working tree here
 * would preview a version of the asset that is not in the commit being read.
 */
describe('collectModelResources from a commit', () => {
  let gitRoot = ''
  let sha = ''

  beforeAll(async () => {
    gitRoot = await mkdtemp(join(tmpdir(), 'aspen-preview-git-'))
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: gitRoot, encoding: 'utf8' })
    const write = async (path: string, text: string): Promise<void> => {
      const target = join(gitRoot, path)
      await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true })
      await writeFile(target, text, 'utf8')
    }
    await write('art/robot.gltf', JSON.stringify({ buffers: [{ uri: 'robot.bin' }] }))
    await write('art/robot.bin', 'GEOMETRY')
    git('init', '-q', '.')
    git('add', '-A')
    git('commit', '-qm', 'the model')
    sha = git('rev-parse', 'HEAD').trim()
    // Dirty the working tree: the commit preview must ignore this.
    await write('art/robot.bin', 'REWRITTEN IN THE WORKING TREE')
  })

  afterAll(async () => {
    await rm(gitRoot, { recursive: true, force: true })
  })

  it('reads the model and its sidecars out of the commit, not the checkout', async () => {
    const model = Buffer.from(
      execFileSync('git', ['cat-file', 'blob', `${sha}:art/robot.gltf`], {
        cwd: gitRoot,
        maxBuffer: 1 << 20
      })
    )
    const result = await collectModelResources(gitRoot, 'art/robot.gltf', sha, model)
    expect(result.resources.map(r => r.path)).toEqual(['art/robot.bin'])
    expect(Buffer.from(result.resources[0].data).toString('utf8')).toBe('GEOMETRY')
    expect(result.resources[0].byteLength).toBe(8)
  })
})
