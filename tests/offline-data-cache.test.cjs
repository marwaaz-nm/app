const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function worker(network, cached) {
  const handlers = {};
  const cache = {
    match: async () => cached,
    put: async (_request, response) => { cached = response; },
  };
  const context = vm.createContext({
    self: { location: { origin: 'https://app.test' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => cache }, fetch: network, Response, URL,
  });
  vm.runInContext(fs.readFileSync('public/sw.js', 'utf8'), context);
  return (url) => {
    let result;
    handlers.fetch({ request: new Request(url), respondWith: promise => { result = promise; } });
    return result;
  };
}

for (const url of ['https://app.test/api/users', 'https://project.supabase.co/rest/v1/references']) {
  test(`fresh records replace stale cache: ${url}`, async () => {
    const read = worker(async () => new Response('new record'), new Response('old records'));
    assert.equal(await (await read(url)).text(), 'new record');
  });
}
test('offline reads retain cached records', async () => {
  const read = worker(async () => { throw new Error('offline'); }, new Response('cached records'));
  assert.equal(await (await read('https://app.test/api/users')).text(), 'cached records');
});
test('deleted records are not restored from the old cache', async () => {
  const read = worker(async () => new Response('[]'), new Response('[{"id":1}]'));
  assert.deepEqual(await (await read('https://project.supabase.co/rest/v1/surveys')).json(), []);
});
test('authorization failures do not reveal cached data', async () => {
  const read = worker(async () => new Response('unauthorized', { status: 401 }), new Response('cached records'));
  assert.equal((await read('https://app.test/api/users')).status, 401);
});
