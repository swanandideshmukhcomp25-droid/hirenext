const OpenAI = require('openai');
const logger = require('../utils/logger');

// Only initialise if we actually have a key — avoids crash in dummy mode
let openai = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  logger.info('OpenAI client initialised');
} else {
  logger.info('OpenAI client NOT initialised (no API key set)');
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

module.exports = { openai, MODEL };
