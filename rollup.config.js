import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json' assert { type: 'json' };

const extensions = ['.js'];

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  'fs/promises',
  'path',
  'util',
  'crypto',
  'stream',
  'http',
  'https',
  'url',
  'zlib',
  'net',
  'tls',
  'child_process'
];

const commonPlugins = [
  resolve({
    extensions,
    preferBuiltins: true
  }),
  commonjs({
    include: 'node_modules/**'
  }),
  json(),
  babel({
    extensions,
    babelHelpers: 'bundled',
    include: ['src/**/*'],
    exclude: ['node_modules/**']
  })
];

export default [
  // ESM build
  {
    input: 'src/index.js',
    output: {
      file: pkg.module,
      format: 'esm',
      sourcemap: true
    },
    external,
    plugins: [
      ...commonPlugins,
      terser({
        ecma: 2020,
        module: true,
        warnings: true,
        compress: {
          passes: 2
        }
      })
    ]
  },
  // CommonJS build
  {
    input: 'src/index.js',
    output: {
      file: pkg.exports['.'].require,
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    external,
    plugins: [
      ...commonPlugins,
      terser({
        ecma: 2020,
        module: false,
        warnings: true,
        compress: {
          passes: 2
        }
      })
    ]
  }
];