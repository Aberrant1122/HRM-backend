const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8'), {
    module, exports: module.exports, console,
    require: name => {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env: {} },
  }, { filename: file });
  return module.exports;
}

function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}


module.exports = { load, response };
