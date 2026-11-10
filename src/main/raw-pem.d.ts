/** Vite's ?raw suffix: the public signing key ships inlined into the
 *  main-process bundle (see src/main/update-core.ts). */
declare module '*.pem?raw' {
  const content: string
  export default content
}
