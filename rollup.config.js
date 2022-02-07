import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import {terser} from "rollup-plugin-terser";
import json from '@rollup/plugin-json';
const axios = require('./lib/axios');

const lib = require("./package.json");
const outputFileName = 'axios';
const name = "axios";
const input = './lib/axios.js';

const generateConfig = (config) => {
  return [false, true].map(isMinified => ({
    input,
    ...config,
    output: {
      ...config.output,
      file: `${config.output.file}.${isMinified ? "min.js" : "js"}`,
    },
    plugins: [
      json(),
      resolve({browser: true}),
      commonjs(),
      isMinified && terser(),
      ...(config.plugins || []),
    ]
  }))
};

export default async () => {
  const year = new Date().getFullYear();
  const banner = `// ${lib.name} v${lib.version} Copyright (c) ${year} ${lib.author}`;

  return [
  ...generateConfig({
    output: {
      file: `dist/${outputFileName}`,
      name,
      format: "umd",
      exports: "default",
      banner
    }
  }),

  ...generateConfig({
    output: {
      file: `dist/esm/${outputFileName}`,
      format: "esm",
      preferConst: true,
      exports: "named",
      banner
    }
  })
]};
