const { test } = require('node:test');
const assert = require('node:assert/strict');
const access = require('../middleware/employeeAccess');

const { load, response } = require('./helpers/controller');

for (const role of ['employee', 'manager', 'client', 'hr', 'accounts', 'admin']) {
  test(`${role}: own access preserved; cross-employee access restricted`, () => {
    assert.equal(access.canAccessConfidentialEmployee({ id: 1, role }, '1'), true);
    const res = response(); let called = false;
    access.requireEmployeeAccess({ user: { id: 1, role }, params: { userId: '2' } }, res, () => { called = true; });
    assert.equal(called, role === 'admin');
    assert.equal(res.code, role === 'admin' ? 200 : 403);
  });
}

test('missing authentication and invalid target never grant self access', () => {
  const res = response();
  access.requireEmployeeAccess({ params: { userId: 1 } }, res, () => assert.fail());
  assert.equal(res.code, 401);
  assert.equal(access.canAccessConfidentialEmployee({ id: 1 }, '1junk'), false);
});

test('bank and attachment routes enforce access before handlers and upload side effects', () => {
  const routes = [];
  const router = Object.fromEntries(['get','post','put','delete','patch'].map(method => [method, (url, ...handlers) => routes.push({method,url,handlers})]));
  const validator = new Proxy(() => validator, { get: () => validator });
  const noop = () => {};
  const controllers = new Proxy({}, { get: () => noop });
  const upload = { array: () => noop, single: () => noop };
  load('routes/employeeRoutes.js', {
    express: { Router: () => router }, 'express-validator': { param: validator, query: validator },
    '../controllers/employeeController': controllers,
    '../middleware/authMiddleware': { isAdmin: noop },
    '../middleware/employeeAccess': access,
    '../middleware/validationMiddleware': { handleValidationErrors: noop },
    '../validations/bankInfoValidation': { bankInfoValidation: [], updateBankInfoValidation: [] },
    '../middleware/upload': { uploadEmployeeAttachments: upload, uploadProfilePicture: upload },
    '../validations/profileValidation': [],
  });
  const protectedRoutes = routes.filter(r => /bank-details/.test(r.url) || ['post','delete'].includes(r.method) && /attachments|profile-picture/.test(r.url) && r.method !== 'delete' || r.method === 'delete' && /attachments/.test(r.url));
  assert.equal(protectedRoutes.length, 6);
  for (const route of protectedRoutes) {
    const handlers = route.handlers.flat(Infinity);
    const gate = handlers.indexOf(access.requireEmployeeAccess);
    assert.ok(gate >= 0, `${route.method} ${route.url}`);
    assert.ok(gate < handlers.lastIndexOf(noop));
    const res = response();
    handlers[gate]({user:{id:1,role:'employee'},params:{userId:2}},res,()=>assert.fail('Unauthorized request reached side effect'));
    assert.equal(res.code,403);
  }
});

test('cross-employee profile query excludes confidential fields; self/admin retain them', async () => {
  let options;
  const controller = load('controllers/employeeController.js', {
    '../middleware/employeeAccess': access,
    '../models': { User: { findOne: async opts => { options = opts; return null; } }, UserInfo: {}, UserBankInfo: {} },
    sequelize: { Op: {} }, 'express-validator': {}, path: {}, '../utils/pagination': {},
  });
  for (const [actor,confidential] of [[{id:1,role:'employee'},false],[{id:2,role:'employee'},true],[{id:1,role:'admin'},true]]) {
    await controller.getUserById({params:{userId:2},user:actor},response());
    const fields = options.include[0].attributes;
    assert.equal(fields === undefined, confidential);
    if (!confidential) {
      for (const field of ['salary','cnic','dob','address','attachments']) assert.equal(fields.includes(field),false);
      assert.ok(fields.includes('department'));
    }
  }
});
