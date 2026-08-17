// extension/src/background/message-handler.js

import { isValidMessage } from './validators.js';

export function handleMessage(msg, sender, handlers) {
  if (!isValidMessage(msg)) {
    return { error: 'Bad request: invalid message format' };
  }

  const handler = handlers[msg.type];
  if (!handler) {
    return { error: `Unknown action: ${msg.type}` };
  }

  return handler(msg, sender);
}
