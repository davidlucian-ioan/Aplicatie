'use strict';

// Provider determinist pentru teste. Nu interpretează limbaj natural și nu apelează servicii externe.
class MockProvider {
  constructor(responses = []) {
    this.responses = [...responses];
    this.calls = 0;
  }

  async interpret({ input, context }) {
    this.calls += 1;
    if (!this.responses.length) throw new Error('MockProvider nu mai are răspunsuri configurate.');
    const next = this.responses.shift();
    return typeof next === 'function' ? next({ input, context }) : structuredClone(next);
  }
}

module.exports = { MockProvider };
