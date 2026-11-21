'use strict';

const { validateCommand, validateCoreResult } = require('./contracts');

// Adapterul nu primește DB-ul și nu importă engine.js. Primește doar porturi explicite.
class CoreAdapter {
  constructor(corePort) {
    if (!corePort || typeof corePort !== 'object') throw new TypeError('corePort este obligatoriu.');
    this.corePort = corePort;
  }

  async read(request) {
    if (typeof this.corePort.read !== 'function') throw new Error('Core read port nu este configurat.');
    return this.corePort.read(request);
  }

  async preview(command) {
    validateCommand(command);
    if (typeof this.corePort.preview !== 'function') throw new Error('Core preview port nu este configurat.');
    return validateCoreResult(await this.corePort.preview(command));
  }

  async execute(command, options = {}) {
    validateCommand(command);
    if (typeof this.corePort.execute !== 'function') throw new Error('Core execute port nu este configurat.');
    return validateCoreResult(await this.corePort.execute(command, options));
  }
}

module.exports = { CoreAdapter };
