import minimist from "minimist";
import {getCommitInfo, getLatestTags, checkout, getCommits} from "./helpers/git.js";
import fs from "fs/promises";
import {listFiles, readJSONFile, writeFileAsync, Handlebars, barChart} from "./helpers/helpers.js";
import path from "path";
import util from "util";
import os from "os";
import {gzip} from "zlib";
import {getFilesFromNPM} from "./helpers/npm.js";
import github from "./helpers/github.js";


const gzipAsync = util.promisify(gzip);

const jsFilesExt = {
  '.js': true,
  '.cjs': true,
  '.mjs': true
};

const statDir = path.join(os.tmpdir(), './axios-stats/');
const distDir = 'dist/';

const getFileStats = async (filename) => {
  try {
    const content = await fs.readFile(filename);

    const compressedSize = (await gzipAsync(content)).byteLength;

    return {
      size: content.byteLength,
      gzip: compressedSize,
      compressed: content.byteLength ? compressedSize / content.byteLength : 1
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    return null;
  }
}

const snapshot = async (dir = distDir, skipIfExists = true) => {
  const {sha, tag, short, date} = await getCommitInfo();

  if (skipIfExists) {
    try {
      await fs.access(path.join(statDir, `${sha}.json`), fs.constants.F_OK);
      return;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  const files = await listFiles(dir);

  const stat = {
    sha,
    tag,
    date,
    short,
    stats: {}
  };

  await Promise.all(files.filter((file) => jsFilesExt[path.extname(file)]).map(async (filePath) => {
    stat.stats[filePath.replace(/\\\\?/g, '/')] = await getFileStats(filePath);
  }));

  if (statDir) {
    await writeFileAsync(path.join(statDir, `${sha}.json`), stat);
  }

  return stat;
}

const getStatsFromNPM = async (version) => {
  try {
    const npmPackage = await getFilesFromNPM(`axios@${version.replace(/^v/, '')}`, (filepath) => {
      return jsFilesExt[path.extname(filepath)] && filepath.startsWith(distDir)
    });
    const stats = {};

    for (const [filepath, {size, gzip, compressed}] of Object.entries(npmPackage)) {
      stats[filepath] = {
        size,
        gzip,
        compressed
      }
    }

    return stats;
  } catch (err) {
    return null;
  }
}


const report = async (files, {releases = 1, base, clear = true} = {}) => {
  const tags = await getLatestTags(releases);
  const fromTag = tags.length && tags[tags.length - 1];
  const from = fromTag ? fromTag.sha : 'HEAD~5';


  const commits = await getCommits(from);
  const snapshots = {};
  const commit2Tag = {};

  tags.forEach(tagData => {
    commit2Tag[tagData.sha] = tagData;
  });

  await Promise.all(commits.map(async (sha, i) => {
    let snapshot = await readJSONFile(path.join(statDir, `${sha}.json`));

    if (!snapshot) {
      const tagInfo = commit2Tag[sha];

      console.log(`No snapshot found for ${sha}`);

      if (tagInfo) {
        console.log(` Trying to pull [${tagInfo.tag}] from NPM`);

        const stats = await getStatsFromNPM(tagInfo.tag);

        if (stats) {
          snapshot = {
            sha,
            tag: tagInfo.tag,
            date: tagInfo.date,
            short: tagInfo.short,
            stats
          };

          await writeFileAsync(path.join(statDir, `${sha}.json`), snapshot);
        } else {
          // Ignore errors for missing tags in NPM
          console.error(`Failed to get snapshot for ${tagInfo.tag} (${sha}) from NPM`);
        }
      }
    } else {
      console.log(`Loaded snapshot for ${sha} [${snapshot.tag || '---'}] from disk`);
    }

    if (snapshot) {
      snapshots[sha] = {
        ...snapshot,
        label: !i ? 'HEAD' : (snapshot.sha === base ? 'BASE': '')
      };
    }
  }));

  if (clear) {
    await clearStats(snapshots);
  }

  const stats = {};

  let impact = 0;

  files.forEach(file => {
    const stat = Object.values(snapshots).map((snapshot) => {
      const stat = snapshot?.stats[file];

      if (stat) {
        return {
          sha: snapshot.sha,
          short: snapshot.short,
          tag: snapshot.tag,
          date: snapshot.date,
          ...stat
        }
      }
    }).filter(Boolean).map((snapshot, i, snapshots) => {
      const next = snapshots[i + 1];
      const diff = next ? snapshot.size - next.size : null;
      const diffGZip = next ? snapshot.gzip - next.gzip : null;

      if (diffGZip > 0) {
        impact += diffGZip;
      }

      return {
        ...snapshot,
        diff: {
          size: diff,
          gzip: diffGZip
        }
      }
    });

    const baseStat = base &&
      (base === 'release' ? tags[0].sha : stat.find(({sha}) => sha === base)) ||
      stat[1];

    stats[file] = {
      diff: {
        size: baseStat ? stat[0].size - baseStat.size : null,
        gzip: baseStat ? stat[0].gzip - baseStat.gzip : null,
      },
      graph: barChart(stat.map(({tag, short, sha, gzip}) => {
        return {
          label: tag || short || sha,
          value: gzip
        };
      }))
    };
  });

  return {
    impact,
    stats,
    snapshots
  };
}

const clearStats = async (snapshots) => {
  try {
    const files = await listFiles(statDir);

    await Promise.all(files.map(file => {
      const sha = path.parse(file).name;

      if (!snapshots[sha]) {
        console.log(`Removing irrelevant snapshot for ${sha}`);
        return fs.unlink(path.join(statDir, file))
      }
    }));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}




(async (args) => {
  let {template, skipIfExists = true, releases, base, dir = distDir} = args;
  let [action, ...rest] = args._;
  let pr = args.pr || process.env.PR_NUMBER;
  let marker = args.marker || process.env.DEFAULT_MARKER || 'axios-comment-marker';

  console.log(`Stat dir: ${statDir}`);

  switch (action) {
    case 'snapshot':
    case 'snap': {
      const stat = await snapshot(dir, skipIfExists);

      if (stat) {
        console.log(`Snapshot for ${stat.sha} (${stat.tag || '---'}) saved successfully!`);
      } else {
        console.log('Snapshot already exists, skipping...');
      }

      break;
    }
    case 'report': {
      const [...files] = rest;

      const template = await fs.readFile('./scripts/templates/build-stat.hbs');

      const stats = await report(files, {
        releases,
        base
      });

      const reportText = Handlebars.compile(String(template))(stats);

      if (pr) {
        const fullMarker = `<!-- ${marker} -->`;

        await github.findCommentAndUpdate(
          pr,
          reportText ? `${fullMarker}\r\n${reportText}` : '',
          ({body}) => body.trim().startsWith(fullMarker)
        );
      }

      console.log(reportText);

      break;
    }
  }
})(minimist(process.argv.slice(2), {
  strings: ['template', 'releases', 'pr', 'base', 'dir', 'target'],
  boolean: ['skipIfExists'],
  alias: {
    template: 't',
    releases: 'r',
    skipIfExists: 's',
    base: 'b',
    pr: 'p',
    dir: 'd',
    target: 't'
  }
}));
