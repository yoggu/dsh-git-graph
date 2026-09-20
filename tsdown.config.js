import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { client: 'src/client/index.js' },
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  outDir: '.',
  outExtensions: () => ({ js: '.js' }),
  clean: false,
  sourcemap: false,
  minify: true,
  deps: {
    neverBundle: ['react'],
    alwaysBundle: [/^highlight\.js(?:\/|$)/],
    onlyBundle: ['highlight.js'],
  },
  checks: { legacyCjs: false },
  outputOptions: {
    exports: 'auto',
  },
  banner: "window.__ModuleLoader__.load({ id: 'dsh-git-graph', factory: (require) => { const module = { exports: {} }; const exports = module.exports;",
  footer: 'module.exports = module.exports.default ?? module.exports; return module.exports } })',
})
