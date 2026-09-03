const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const formExports = {};
const permissionExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/permissions.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: permissionExports });
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/userForm.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: formExports, require: () => permissionExports });

function loadRoute(results, authError = null) {
  let deleteCalls = 0;
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }),
      admin: {
        updateUserById: async () => ({ error: authError }),
        deleteUser: async () => { deleteCalls++; return { error: null }; },
      },
    },
    from: () => {
      const query = {
        select: () => query, eq: () => query, update: () => query,
        single: async () => results.shift(),
        then: (resolve, reject) => Promise.resolve(results.shift()).then(resolve, reject),
      };
      return query;
    },
  };
  const exports = {};
  const context = vm.createContext({ exports, URL, console: { error() {} },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
    require: name => name === '@/lib/userForm' ? formExports : name === 'next/server'
      ? { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }
      : { createClient: () => client },
  });
  vm.runInContext(ts.transpileModule(fs.readFileSync('src/app/api/users/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return { ...exports, deleteCalls: () => deleteCalls };
}
const admin = () => ({ data: { role: 'Admin' }, error: null });
const request = body => ({ headers: new Headers({ Authorization: 'Bearer test' }), json: async () => body });

test('password failure is not reported as success', async () => {
  const route = loadRoute([admin(), { data: { id: 'target', role: 'User' } }, { error: null }], { message: 'Password too short' });
  const response = await route.PUT(request({ username: 'staff', fullname: 'Staff', role: 'User', password: 'long-password', permitted_menus: [], permitted_actions: [] }));
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Password too short/);
});
test('SuperAdmin cannot be downgraded by edit', async () => {
  const route = loadRoute([admin(), { data: { id: 'target', role: 'SuperAdmin' } }]);
  const response = await route.PUT(request({ username: 'boss', fullname: 'Boss', role: 'Admin' }));
  assert.equal(response.status, 403);
});
test('self deletion is rejected before deleting auth account', async () => {
  const route = loadRoute([admin(), { data: { id: 'actor', role: 'Admin' } }]);
  const response = await route.DELETE({ ...request(), url: 'https://example.test/api/users?username=operator' });
  assert.equal(response.status, 403);
  assert.equal(route.deleteCalls(), 0);
});
test('unauthenticated requests are rejected', async () => {
  const route = loadRoute([]);
  const response = await route.PUT({ headers: new Headers() });
  assert.equal(response.status, 401);
});
test('blank names and invalid usernames fail validation', () => {
  const errors = formExports.accountErrors({ fullname: '   ', username: 'a b', password: 'short' }, true);
  assert.deepEqual(Object.keys(errors), ['fullname', 'username', 'password']);
});
test('an unchanged password is optional on edit', () => {
  assert.equal(Object.keys(formExports.accountErrors({ fullname: 'Test User', username: 'test.user' }, false)).length, 0);
});
test('actions without a permitted menu are removed', () => {
  assert.equal(JSON.stringify(formExports.actionsForMenus(['finance.manage', 'survey.edit', 'unknown'], ['/records'])), '["survey.edit"]');
  assert.equal(formExports.actionsForMenus(['finance.manage'], []).length, 0);
});
for (const endpoint of ['pay-debt', 'update-status']) {
  test(`${endpoint} checks finance permission before any write`, async () => {
    const exports = {};
    let checked;
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/app/api/financials/${endpoint}/route.ts`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, require: name => name === 'next/server'
      ? { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }
      : { requireViewer: async (_req, action) => { checked = action; throw new Error('Forbidden'); }, apiError: () => ({ status: 403, message: 'Forbidden' }) },
    });
    assert.equal((await exports.POST({})).status, 403);
    assert.equal(checked, endpoint === 'pay-debt' ? 'payment.pay_debt' : 'payment.edit');
  });
}
test('read-only reports do not imply export', () => {
  const profile = { role: 'User', permitted_menus: ['/reports'], permitted_actions: ['report.view'] };
  assert.equal(permissionExports.canAction(profile, 'report.view'), true);
  assert.equal(permissionExports.canAction(profile, 'report.export'), false);
});
test('create permission does not imply edit or delete', () => {
  const profile = { role: 'User', permitted_menus: ['/transfers'], permitted_actions: ['transfer.create'] };
  assert.equal(permissionExports.canAction(profile, 'transfer.create'), true);
  assert.equal(permissionExports.canAction(profile, 'transfer.delete'), false);
});
test('legacy finance permissions expand, but still require the menu', () => {
  const profile = { role: 'User', permitted_menus: ['/financials'], permitted_actions: ['finance.manage'] };
  assert.equal(permissionExports.canAction(profile, 'expense.delete'), true);
  assert.equal(permissionExports.canAction({ ...profile, permitted_menus: [] }, 'expense.delete'), false);
});
