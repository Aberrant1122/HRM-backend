const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(file, dependencies, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext('(function(){\n' + fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8') + '\n})()', {
    module, exports: module.exports, console,
    __dirname: path.dirname(path.join(__dirname, '..', '..', file)),
    __filename: path.join(__dirname, '..', '..', file),
    require: name => {
      if (name in dependencies) return dependencies[name];
      if (name === '../utils/employeeCohort') {
        const user = dependencies['../models']?.User;
        if (user?.rawAttributes && !Object.hasOwn(user.rawAttributes, 'retainedEmployeeMembership')) {
          return { where: () => ({ role: 'employee' }), includes: u => u?.role === 'employee', basis: 'login-account-role' };
        }
        return require('../../utils/employeeCohort');
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env, argv: [] },
  }, { filename: file });
  return module.exports;
}

function response() {
  return { code: 200, headers: {}, setHeader(name,value) { this.headers[name]=value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}


module.exports = { load, response };
