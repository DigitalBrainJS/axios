import {readdir} from 'fs/promises';
import {join, dirname} from 'path';
import util from "util";
import cp from "child_process";
import fs from "fs/promises";
import Handlebars from "handlebars";
import prettyBytes from "pretty-bytes";

export const parseVersionTag = (tag) => {
  const [, major, minor, patch] = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag) || [];
  return [major, minor, patch];
}

export const execAsync = util.promisify(cp.exec);

export const run = async (cmd, parseLines) => {
  const stdout = (await execAsync(cmd)).stdout.trim();
  return parseLines ? stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean) : stdout;
}

export const listFiles = async (dir) => {
  try {
    const entries = await readdir(dir, {withFileTypes: true, recursive: true});

    return entries.filter(entry => entry.isFile()).map(file => {
      return join(file.parentPath, file.name);
    });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

export const readJSONFile = async (file) => {
  try {
    return JSON.parse(String(await fs.readFile(file)));
  } catch (e) {
    if (e.code !== 'ENOENT' && e.name !== 'SyntaxError') {
      throw e;
    }
  }
}


export const writeFileAsync = async (filePath, content) => {
  const dir = dirname(filePath);

  await fs.mkdir(dir, {recursive: true});

  await fs.writeFile(filePath,
    typeof content === 'object' ?
      ArrayBuffer.isView(content) ? Buffer.from(content) :
        JSON.stringify(content, null, 2) :
      String(content));
}


Handlebars.registerHelper('filesize', (bytes, ...args) => {
  args.pop();

  const [maximumFractionDigits = 2, signed] = args;

  if (bytes == null) {
    return '';
  }

  return new Handlebars.SafeString(
    `<span title="${Handlebars.escapeExpression(bytes)} bytes">${
      prettyBytes(bytes, {
        maximumFractionDigits,
        signed: !!signed
      })
    }</span>`
  );
});

Handlebars.registerHelper('tooltip', (text, title) => {
  return new Handlebars.SafeString(
    `<span title="${Handlebars.escapeExpression(title)}">${Handlebars.escapeExpression(text)}</span>`
  );
});

Handlebars.registerHelper('percent', (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : `---`);

Handlebars.registerHelper('or', function (...values) {
  values.pop();
  return values.find(Boolean);
});

Handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});

Handlebars.registerHelper('pick', function (index, ...values) {
  values.pop();
  return values[+index || 0] ?? '';
});

Handlebars.registerHelper('bold', function (value) {
  return value ? `**${value}**` : '';
});

Handlebars.registerHelper('impact', function (value, ...values) {
  let index, len = values.length;

  for (let i = 0; i < len; i += 2) {
    let val = values[i];

    if (typeof val === 'string') {
      index = i;
      break;
    }

    if (value <= val) {
      index = i + 1;
      break;
    }
  }

  return index != null && values[index || 0] || '';
});

Handlebars.registerHelper('date', (...values) => {
  values.pop();

  const [value, locale = 'en-US'] = values;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
});

Handlebars.registerHelper('join', function (...args) {
  args.pop();

  return new Handlebars.SafeString(args
    .filter(v => v !== undefined && v !== null && v !== '')
    .join(', '));
});

export const barChart = (data, width = 50, pad = 15) => {
  const max = Math.max(...data.map(d => d.value));
  const maxLen = Math.max(...data.map(d => {
    return String(d.label).length
  }));

  if (maxLen < pad) {
    pad = maxLen
  }

  return data.map(d => {
    const size = Math.round((d.value / max) * width);
    return `${d.label.slice(0, pad).padEnd(pad)} | ${'■'.repeat(size)} ${prettyBytes(d.value)}`;
  }).join('\n');
}

export {
  Handlebars
}
