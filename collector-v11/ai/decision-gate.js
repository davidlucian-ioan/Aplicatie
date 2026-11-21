'use strict';

const { validateInterpretation } = require('./contracts');

function decide(rawInterpretation) {
  const interpretation = validateInterpretation(rawInterpretation);
  switch (interpretation.intent) {
    case 'clarify':
      return { action: 'clarify', question: interpretation.question };
    case 'refuse':
      return { action: 'refuse', reason: interpretation.reason || 'Cererea nu poate fi executată.' };
    case 'model_extension':
      return { action: 'model_extension', proposal: interpretation.proposal || null };
    case 'answer':
      return { action: 'answer', answer: interpretation.answer, readRequest: interpretation.readRequest || null };
    case 'propose':
      if (Array.isArray(interpretation.ambiguities) && interpretation.ambiguities.length) {
        return {
          action: 'clarify',
          question: interpretation.clarificationQuestion || 'Am nevoie de o clarificare înainte să înregistrez operația.'
        };
      }
      return { action: 'propose', command: interpretation.command };
    default:
      throw new TypeError('Decizie AI necunoscută.');
  }
}

module.exports = { decide };
