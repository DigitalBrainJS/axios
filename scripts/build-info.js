import Handlebars from "handlebars";
import fs from "fs/promises";
import path from 'path';
import prettyBytes from 'pretty-bytes';
import {
  getBlobHistory,
  getCurrentBranch,
  getHeadCommit,
  getLatestTags,
  getTagBySha,
  parseVersionTag
} from './helpers/git.js';
import github from "./helpers/github.js";
import {getFilesFromNPM} from "./helpers/npm.js";
import {gzip} from "zlib";
import util from "util";
import os from "os";

const cacheFile = 'axios-bundle-stats.json';

const args = process.argv.slice(2);

const gzipAsync = util.promisify(gzip);

const {PR_NUMBER} = process.env;

const IMPACT_LOW = 100; // 0.1KB
const IMPACT_MEDIUM = 512; // 0.5KB
const IMPACT_HIGH = 1024; // 1KB

const readJSONFile = async (file) => {
  try {
    return JSON.parse(String(await fs.readFile(file)));
  } catch (e) {
    if (e.code !== 'ENOENT' && e.name !== 'SyntaxError') {
      throw e;
    }
  }
}

const {version} = await readJSONFile('./package.json');

const [MAJOR_NUMBER] = parseVersionTag(version);

Handlebars.registerHelper('filesize', (bytes) => bytes != null ? prettyBytes(bytes) : '<unknown>');

Handlebars.registerHelper('percent', (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : `---`);

Handlebars.registerHelper('or', function(a, b) {
  return a || b;
});

Handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});

const headPromise = (async () => {
  const head = await getHeadCommit();

  return {
    head,
    tag: await getTagBySha(head),
    branch: await getCurrentBranch()
  };
})();

const getFileStats = async (filename) => {
  try {
    const content = await fs.readFile(filename);

    const compressedSize = (await gzipAsync(content)).byteLength;

    const {head, tag, branch} = await headPromise;

    return {
      size: content.byteLength,
      gzip: compressedSize,
      compressed: content.byteLength ? compressedSize / content.byteLength : 1,
      commit: head,
      tag,
      branch
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    return null;
  }
}



const getFilesStats = async (files, npmHistoryDepth = 1, cacheFilePath) => {
  const stats = {};

  const npmHistory = {};

  if (npmHistoryDepth) {
    const tags = await getLatestTags(npmHistoryDepth, `v${MAJOR_NUMBER}.*`);

    await Promise.all(tags.map(async ({tag, sha}) => {
      npmHistory[sha] = {
        files: await getFilesFromNPM(`axios@${tag.replace(/^v/, '')}`),
        tag
      };
    }))
  }

  const cachedStat = cacheFilePath && (await readJSONFile(cacheFilePath));

  for (const [name, filename] of Object.entries(files)) {
    const stat = await getFileStats(filename);

    let history = [];

    const cached = cachedStat && cachedStat[filename];

    if (cached) {
      history.push(cached);
    }

    if (npmHistoryDepth) {
      Object.entries(npmHistory).forEach(([sha, {files, tag}]) => {
        const file = files[filename];
        if (file) {
          const {size, gzip, compressed} = file;

          history.push({
            commit: sha,
            tag,
            size,
            gzip,
            compressed
          });
        }
      });
    }

    stats[name] = {
      filename,
      ...stat,
      history
    };
  }

  return stats;
}

const compareValues = (a, b, format) => {
  const diff = a - b;

  return `${diff < 0 ? '-' : '+'}${format(diff)}`;
}

const generateBody = async ({files, template = './templates/build-info.hbs'} = {}) => {
  const stat = await getFilesStats(files, 1, cacheFile);

  let impactBytes = 0;

  const entries = Object.entries(stat);

  entries.forEach(([name, fileStat]) => {
    const [prev] = fileStat.history;

    const gzipDiff = prev ? fileStat.gzip - prev.gzip : 0;

    if (gzipDiff > 0) {
      impactBytes += gzipDiff;
    }

    fileStat.delta = {
      bytes: compareValues(fileStat.size, prev?.size, prettyBytes),
      gzip: compareValues(fileStat.gzip, prev?.gzip, prettyBytes),
    }
  });

  console.log(util.inspect(stat, {depth: null, colors: true}));

  let impact;

  impactBytes = impactBytes / entries.length;

  if (impactBytes < IMPACT_LOW) {
    impact = 0;
  } else if(impactBytes < IMPACT_MEDIUM) {
    impact = 1;
  } else if(impactBytes < IMPACT_HIGH) {
    impact = 2;
  } else {
    impact = 3;
  }

  return Handlebars.compile(String(await fs.readFile(
    path.join(import.meta.dirname, template)
  )))({
    stat,
    impact
  });
}

const saveFilesStat = async (files, statFile) => {
  const stats = {};

  await Promise.all(Object.entries(files).map(async ([name, filename]) => {
     const stat = await getFileStats(filename);

     if(stat) {
       stats[filename] = stat;
     }
  }));

  await fs.writeFile(statFile, JSON.stringify(stats, null, 2));
}


  const report = await generateBody({
    files: {
      'Browser build (UMD)' : 'dist/axios.min.js',
      'Browser build (ESM)' : 'dist/esm/axios.min.js',
    }
  });

  console.log(report);


//console.log(await getFileStats('dist/axios.min.js'));
/*console.log(util.inspect(await getFilesStats({
  'Browser build (UMD)': 'dist/axios.min.js',
  'Browser build (ESM)': 'dist/esm/axios.min.js',
}, 1, cacheFile), {depth: null, colors: true}));*/


/*await saveFilesStat({
  'Browser build (UMD)': 'dist/axios.min.js',
  'Browser build (ESM)': 'dist/esm/axios.min.js',
}, cacheFile);*/


const marker = '<!-- bundle-size-report -->';

//await github.findCommentAndUpdate(PR_NUMBER, `${marker}\r\n${report}`, ({body}) => body.trim().startsWith(marker));
