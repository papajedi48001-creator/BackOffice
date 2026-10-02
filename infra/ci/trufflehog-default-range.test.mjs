import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

assert.match(workflow, /fetch-depth: 0/);

const trufflehogInputs = workflow
  .split(/uses: trufflesecurity\/trufflehog@main/, 2)[1]
  .split(/\n\s*-\s/, 1)[0];

assert.doesNotMatch(trufflehogInputs, /(?:^|[,\n]\s*)(base|head):/m);
