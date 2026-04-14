import Handlebars from "handlebars";
import fs from "fs/promises";
import path from 'path';
import prettyBytes from 'pretty-bytes';
import {getBlobHistory, parseVersionTag} from './helpers/git.js';
import github from "./helpers/github.js";
import {getFilesFromNPM} from "./helpers/npm.js";
import zlib from "zlib";



const {PR_NUMBER} = process.env;

const FILE_SIZE_DIFF_THRESHOLD = 512; // 0.5KB

const readJSONFile = async (file) => JSON.parse(String(await fs.readFile(file)));

const {version} = await readJSONFile('./package.json');

const [MAJOR_NUMBER] = parseVersionTag(version);

Handlebars.registerHelper('filesize', (bytes)=> bytes != null ? prettyBytes(bytes) : '<unknown>');

Handlebars.registerHelper('percent', (value)=> Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : `---` );




const generateFileReport = async (files, historyCount = 3) => {
  const filesStat = {};

  const commits = (await getBlobHistory('package.json', historyCount)).filter(({tag}) => {
    return MAJOR_NUMBER === parseVersionTag(tag)[0];
  });
  const warns = [];

  const npmHistory = {};

  await Promise.all(commits.map(async ({tag}) => {
    npmHistory[tag] = await getFilesFromNPM(`axios@${tag.replace(/^v/, '')}`);
  }));

  for(const [name, filename] of Object.entries(files)) {
    const file = await fs.stat(String(filename)).catch(console.warn);
    const gzip = file ? zlib.gzipSync(await fs.readFile(filename)).length : 0;


    const stat = filesStat[filename] = file ? {
      name,
      size: file.size,
      path: filename,
      gzip,
      compressed: file.size ? gzip / file.size : 1,
      history: commits.map(({tag}) => {
        const files = npmHistory[tag];
        const file = files && files[filename] || null;

        return {
          tag,
          ...file
        };
      })
    } : null;

    if(stat && stat.history[0]) {
      const diff = stat.gzip - stat.history[0].gzip;

      if (diff > FILE_SIZE_DIFF_THRESHOLD) {
        warns.push({
          filename,
          sizeReport: true,
          diff,
          percent: stat.gzip ? diff / stat.gzip : 0,
        });
      }
    }
  }

  return {
    version,
    stat: filesStat,
    warns
  };
}



const generateBody = async ({files, template = './templates/build-info.hbs'} = {}) => {
  const data = await generateFileReport(files);

  return Handlebars.compile(String(await fs.readFile(
    path.join(import.meta.dirname, template)
  )))(data);
}

const report = await generateBody({
  files: {
    'Browser build (UMD)' : 'dist/axios.min.js',
    'Browser build (ESM)' : 'dist/esm/axios.min.js',
  }
});

console.log(report);

const marker = '<!-- bundle-size-report -->';

//await github.findCommentAndUpdate(PR_NUMBER, `${marker}${report}`, ({body}) => body.trim().startsWith(marker));
