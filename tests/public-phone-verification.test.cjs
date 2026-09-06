const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/publicPhoneVerification.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject });

test('normalizes common Somali phone formats', () => {
  assert.equal(exportsObject.normalizePhone('+252 61 234 5678'), '612345678');
  assert.equal(exportsObject.normalizePhone('0612345678'), '612345678');
  assert.equal(exportsObject.normalizePhone('123'), null);
});

test('matches only complete normalized phone candidates in document text', () => {
  assert.equal(exportsObject.documentContainsPhone('Tel: +252 61 234 5678', '612345678'), true);
  assert.equal(exportsObject.documentContainsPhone('Tel: 0612345679', '612345678'), false);
});

test('removes only the document header and keeps the full body', () => {
  const summary = exportsObject.publicDocumentSummary('Madaxa hayadda UJEEDDO: Caddeyn heshiis ==== Magaca: Axmed Tel: +252 61 234 5678. Faahfaahin guud');
  assert.doesNotMatch(summary, /Madaxa hayadda/);
  assert.match(summary, /Caddeyn heshiis/);
  assert.doesNotMatch(summary, /====/);
  assert.match(summary, /\+252 61 234 5678/);
  assert.match(summary, /Faahfaahin guud/);
  assert.equal(exportsObject.publicDocumentSummary('   '), null);
});
