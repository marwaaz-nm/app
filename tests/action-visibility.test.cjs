const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const handlers = {
  references: ['handleOpenAddForm', 'handleOpenEditForm', 'handleDeleteReference'],
  transfers: ['handleOpenAddForm', 'handleOpenEditForm', 'handleDeleteTransfer'],
  financials: ['openPayDialog', 'openBulkPayDialog', 'openPayDebtDialog', 'openExpenseDialog', 'openExpenseEditDialog', 'handleDeleteExpense', 'openReceiptEditMode', 'handleDeleteReceipt'],
  reports: ['openExport', 'downloadExport', 'window.print'],
  'drive-files': ['handleDownload'],
};

for (const [page, names] of Object.entries(handlers)) {
  test(`${page}: restricted action buttons are conditionally rendered`, () => {
    const path = `src/app/(dashboard)/${page}/page.tsx`;
    const ast = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let checked = 0;
    function visit(node) {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button') {
        const click = node.openingElement.attributes.properties.find(attr => attr.name?.getText(ast) === 'onClick')?.getText(ast) || '';
        if (names.some(name => click.includes(name)) && !click.includes("'backup'")) {
          let parent = node.parent;
          while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
          assert.ok(parent && ts.isConditionalExpression(parent) && parent.condition.getText(ast).startsWith('canAction(profile,'), click);
          checked++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(checked > 0);
  });
}
