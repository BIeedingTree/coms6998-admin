/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
test('UI text and action messages use media terminology without renaming database identifiers', () => {
  const files = ['app', 'components'].flatMap(dir => fs.readdirSync(path.join(root, dir), { recursive: true }).filter(file => /\.tsx$/.test(file)).map(file => path.join(dir, file)));
  files.push('app/admin/media/actions.ts', 'lib/media.ts');
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        // The real table name is intentionally unchanged; identifiers and
        // dynamic user-generated content are not application UI wording.
        if (node.text !== 'captions') assert.doesNotMatch(node.text, /\bcaptions?\b/i, file + ': ' + node.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const create = fs.readFileSync(path.join(root, 'app/admin/media/new/page.tsx'), 'utf8');
  assert.doesNotMatch(create, /Text media|Image uploads|existing media schema/i);
  const forms = fs.readFileSync(path.join(root, 'components/media-forms.tsx'), 'utf8');
  assert.match(forms, /all its associated ratings, including upvotes and downvotes/);
  assert.match(forms, /This cannot be undone/);
  assert.match(forms, /confirmation !== String\(caption.id\)/);
});
