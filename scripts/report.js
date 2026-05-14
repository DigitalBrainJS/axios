import fs from "fs/promises";
import github from "./helpers/github.js";
import minimist from "minimist";



(async (args) => {
  const {file, noempty} = args;

  const pr = args.pr || process.env.PR_NUMBER;
  let marker = args.marker || process.env.COMMENT_MARKER || 'axios-comment-marker';

  if (pr) {
    let reportText;
    const fullMarker = `<!-- ${marker} -->`;

    if (file) {
      reportText = String(await fs.readFile(file));
    }

    const lines = args._.join('\r\n');

    if (lines) {
      reportText = reportText ? `${reportText}\r\n${lines}` : lines;
    }

    await github.findCommentAndUpdate(
      pr,
      reportText ? `${fullMarker}\r\n${reportText}` : '',
      ({body, user}) => user?.login === 'github-actions[bot]' && body.trim().startsWith(fullMarker),
      noempty
    );
  } else {
    console.log('PR number is not specified, skipping comment update...');
  }
})(minimist(process.argv.slice(2), {
  strings: ['pr', 'file', 'marker'],
  boolean: ['update', 'noempty'],
  alias: {
    pr: 'p',
    file: 'f',
    marker: 'm',
    update: 'u',
    noempty: 'n'
  }
}))
