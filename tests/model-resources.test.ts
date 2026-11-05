import { describe, expect, it } from 'vitest'
import {
  extensionOf,
  findModelResource,
  modelFormatFor,
  modelResourceKey,
  modelSidecarRefs,
  mtlSidecarRefs,
  resolveModelUri
} from '../src/shared/model-resources'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/** A minimal .glb carrying one JSON chunk. */
function glb(json: unknown): Uint8Array {
  const chunk = encode(JSON.stringify(json))
  const padded = new Uint8Array(Math.ceil(chunk.length / 4) * 4)
  padded.set(chunk)
  const bytes = new Uint8Array(20 + padded.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true) // "glTF"
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.length, true)
  view.setUint32(12, padded.length + 8, true)
  view.setUint32(16, 0x4e4f534a, true) // "JSON"
  bytes.set(padded, 20)
  return bytes
}

describe('extensionOf / modelFormatFor', () => {
  it('reads the extension only at the last path segment', () => {
    expect(extensionOf('art/robots.glb')).toBe('glb')
    expect(extensionOf('models.old/robot')).toBeNull()
    expect(extensionOf('art/ROBOT.FBX')).toBe('fbx')
    expect(extensionOf('no-extension')).toBeNull()
    expect(modelFormatFor('a/b/c.dae')).toBe('dae')
    expect(modelFormatFor('a/b/c.png')).toBeNull()
  })
})

describe('resolveModelUri', () => {
  it('resolves against the referencing file’s folder', () => {
    expect(resolveModelUri('art/robots', 'robot.bin')).toBe('art/robots/robot.bin')
    expect(resolveModelUri('art/robots', '../shared/stone.png')).toBe('art/shared/stone.png')
    expect(resolveModelUri('', 'textures/stone.png')).toBe('textures/stone.png')
    expect(resolveModelUri('art', './a/../b.png')).toBe('art/b.png')
  })

  it('folds separators, quoting, escapes and parameters', () => {
    expect(resolveModelUri('art', 'Textures\\Stone.PNG')).toBe('art/Textures/Stone.PNG')
    expect(resolveModelUri('art', '"my robot.png"')).toBe('art/my robot.png')
    expect(resolveModelUri('art', 'stone%20.png')).toBe('art/stone .png')
    expect(resolveModelUri('art', 'stone.png?v=2')).toBe('art/stone.png')
    // Collada marks a locally-authored path with a leading "#".
    expect(resolveModelUri('art', '##textures/stone.png')).toBe('art/textures/stone.png')
  })

  it('refuses anything that is not a file in this repository', () => {
    expect(resolveModelUri('art', 'data:image/png;base64,AAA')).toBeNull()
    expect(resolveModelUri('art', 'https://cdn.example/a.png')).toBeNull()
    // An author's absolute path says nothing about where it lives in the repo.
    expect(resolveModelUri('art', 'C:/Users/dev/a.png')).toBeNull()
    expect(resolveModelUri('art', '../../outside.png')).toBeNull()
    expect(resolveModelUri('', '')).toBeNull()
  })
})

describe('modelSidecarRefs', () => {
  it('collects glTF buffers and images but not embedded data URIs', () => {
    const refs = modelSidecarRefs(
      'art/robot.gltf',
      encode(
        JSON.stringify({
          buffers: [{ uri: 'robot.bin' }, { uri: 'data:application/octet-stream;base64,AA' }],
          images: [{ uri: 'textures/body.png' }, { uri: 'textures/tire.jpg' }]
        })
      )
    )
    expect(refs).toEqual(['art/robot.bin', 'art/textures/body.png', 'art/textures/tire.jpg'])
  })

  it('reads the same references out of a .glb container', () => {
    const refs = modelSidecarRefs(
      'art/robot.glb',
      glb({ buffers: [{ uri: 'robot.bin' }], images: [{ uri: 'textures/body.png' }] })
    )
    expect(refs).toEqual(['art/robot.bin', 'art/textures/body.png'])
  })

  it('survives a manifest that is not JSON', () => {
    expect(modelSidecarRefs('art/robot.gltf', encode('{not json'))).toEqual([])
    expect(modelSidecarRefs('art/robot.glb', encode('junk'))).toEqual([])
  })

  it('collects every library named by an obj’s mtllib lines', () => {
    const obj = ['# obj', 'mtllib body.mtl', 'mtllib "two parts.mtl" extra.mtl', 'v 0 0 0'].join(
      '\n'
    )
    expect(modelSidecarRefs('art/robot.obj', encode(obj))).toEqual([
      'art/body.mtl',
      'art/extra.mtl',
      'art/two parts.mtl'
    ])
  })

  it('collects Collada image sources', () => {
    const dae = `
      <library_images>
        <image id="body"><init_from>textures/body.png</init_from></image>
        <image id="tire"><init_from>##textures/tire.jpg</init_from></image>
        <image id="rim" filename="textures/rim.png"><init_from/></image>
      </library_images>`
    expect(modelSidecarRefs('art/robot.dae', encode(dae))).toEqual([
      'art/textures/body.png',
      'art/textures/rim.png',
      'art/textures/tire.jpg'
    ])
  })

  it('finds FBX texture paths in ASCII and in binary', () => {
    const ascii =
      'Property: "RelativeFilename", "K", "", "textures\\\\body.png", ""\n' +
      'Property: "RelativeFilename", "K", "", "C:\\\\dev\\\\textures\\\\tire.jpg", ""'
    // Each FBX reference is tried both as written and as a plain file name
    // beside the model, so an author's absolute path still has a chance.
    expect(modelSidecarRefs('art/robot.fbx', encode(ascii))).toEqual([
      'art/body.png',
      'art/textures/body.png',
      'art/tire.jpg'
    ])

    // Binary FBX: the path is a length-prefixed string in a field of otherwise
    // non-printable bytes.
    const path = encode('textures/body.png')
    const bytes = new Uint8Array(9 + path.length)
    bytes.set([0x00, 0xff, 0x12, 0x01], 0)
    bytes.set([path.length, 0, 0, 0], 4)
    bytes.set(path, 8)
    expect(modelSidecarRefs('art/robot.fbx', bytes)).toEqual([
      'art/body.png',
      'art/textures/body.png'
    ])
  })

  it('ignores formats that carry everything themselves', () => {
    expect(modelSidecarRefs('art/robot.stl', encode('solid x'))).toEqual([])
    expect(modelSidecarRefs('art/robot.ply', encode('ply'))).toEqual([])
    expect(modelSidecarRefs('art/robot.png', encode('PNG'))).toEqual([])
  })
})

describe('mtlSidecarRefs', () => {
  it('reads map lines past their flag tokens', () => {
    const mtl = [
      'newmtl body',
      'map_Kd -s 1 1 1 textures/body.png',
      'map_Ks "textures/chrome.png"',
      'bump textures/bump.tga',
      'Kd 0.8 0.8 0.8'
    ].join('\n')
    expect(mtlSidecarRefs('art/body.mtl', encode(mtl))).toEqual([
      'art/textures/body.png',
      'art/textures/bump.tga',
      'art/textures/chrome.png'
    ])
  })
})

describe('modelResourceKey / findModelResource', () => {
  const resources = new Map<string, string>([
    ['art/robot.bin', 'bin'],
    ['art/textures/body.png', 'body'],
    ['vendor/shared/tire.png', 'tire']
  ])

  it('normalizes the forms loaders hand back', () => {
    expect(modelResourceKey('art/textures/body.png')).toBe('art/textures/body.png')
    expect(modelResourceKey('file://art/textures/body.png')).toBe('art/textures/body.png')
    expect(modelResourceKey('file:///art/./textures/../textures/body.png')).toBe(
      'art/textures/body.png'
    )
    expect(modelResourceKey('blob:http://localhost:5173/art/textures/body.png')).toBe(
      'art/textures/body.png'
    )
    expect(modelResourceKey('art\\textures\\body.png')).toBe('art/textures/body.png')
    expect(modelResourceKey('')).toBe('')
  })

  it('matches exactly, then by path suffix, then by a unique base name', () => {
    // GLTFLoader asks with the model's folder, MTLLoader with the library's,
    // FBXLoader often with nothing but the file name.
    expect(findModelResource(resources, 'file://art/robot.bin')).toBe('bin')
    expect(findModelResource(resources, 'art/textures/body.png')).toBe('body')
    expect(findModelResource(resources, 'textures/body.png')).toBe('body')
    expect(findModelResource(resources, 'body.png')).toBe('body')
    expect(findModelResource(resources, 'https://cdn.example/tire.png')).toBe('tire')
    expect(findModelResource(resources, 'textures/tire.jpg')).toBeUndefined()
    expect(findModelResource(resources, '?')).toBeUndefined()
  })

  it('refuses to guess between two libraries that name the same file', () => {
    const twins = new Map([
      ['art/textures/body.png', 'art'],
      ['vendor/textures/body.png', 'vendor']
    ])
    expect(findModelResource(twins, 'art/textures/body.png')).toBe('art')
    expect(findModelResource(twins, 'body.png')).toBeUndefined()
  })
})
