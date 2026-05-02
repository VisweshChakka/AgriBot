const { GoogleGenerativeAI } = require('@google/generative-ai');

const CONFIG = {
  MAX_RESPONSE_TOKENS: parseInt(process.env.MAX_RESPONSE_TOKENS || '2000', 10),
  MAX_HISTORY_MESSAGES: parseInt(process.env.MAX_HISTORY_MESSAGES || '6', 10),
  REQUEST_TIMEOUT: 20000,
  TEMPERATURE: 0.7
};

const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY
].filter((key) => key && key !== 'your-api-key-here');

const apiClients = API_KEYS.map((key) => {
  const client = new GoogleGenerativeAI(key);
  return client.getGenerativeModel({ model: 'gemini-2.5-flash' });
});

const keyStatus = API_KEYS.map(() => ({
  available: true,
  quotaExceeded: false,
  errorCount: 0,
  successCount: 0,
  lastError: null,
  lastUsed: null
}));

let currentKeyIndex = 0;
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((entry) => entry && typeof entry.role === 'string' && typeof entry.content === 'string')
    .slice(-CONFIG.MAX_HISTORY_MESSAGES)
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content.trim()
    }))
    .filter((entry) => entry.content);
}

function buildPrompt(systemPrompt, history, message) {
  const intro = systemPrompt ? `System: ${systemPrompt}\n\n` : '';

  if (!history.length) {
    return `${intro}User: ${message}\nAssistant:`;
  }

  const transcript = history.map((entry) => {
    const speaker = entry.role === 'assistant' ? 'Assistant' : 'User';
    return `${speaker}: ${entry.content}`;
  }).join('\n');

  return `${intro}${transcript}\nUser: ${message}\nAssistant:`;
}

function nextModel() {
  if (!apiClients.length) {
    return null;
  }

  for (let attempt = 0; attempt < apiClients.length; attempt += 1) {
    const index = (currentKeyIndex + attempt) % apiClients.length;
    const status = keyStatus[index];
    if (status.available && !status.quotaExceeded) {
      currentKeyIndex = index;
      return { model: apiClients[index], keyIndex: index };
    }
  }

  return null;
}

function markKeyResult(keyIndex, ok, errorMessage) {
  if (keyIndex < 0 || !keyStatus[keyIndex]) {
    return;
  }

  const status = keyStatus[keyIndex];
  status.lastUsed = new Date();

  if (ok) {
    status.successCount += 1;
    status.errorCount = 0;
    status.lastError = null;
    return;
  }

  status.errorCount += 1;
  status.lastError = errorMessage;

  if (errorMessage && (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota'))) {
    status.quotaExceeded = true;
  }

  if (status.errorCount >= 5) {
    status.available = false;
  }
}

async function generateReply(systemPrompt, message, history) {
  const candidate = nextModel();
  if (!candidate) {
    return {
      success: false,
      error: 'No Gemini API keys are currently available.'
    };
  }

  const { model, keyIndex } = candidate;

  try {
    const prompt = buildPrompt(systemPrompt, history, message);
    const result = await Promise.race([
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: CONFIG.TEMPERATURE,
          maxOutputTokens: CONFIG.MAX_RESPONSE_TOKENS
        }
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('API timeout')), CONFIG.REQUEST_TIMEOUT);
      })
    ]);

    const reply = result.response.text().trim();
    markKeyResult(keyIndex, true);

    return {
      success: true,
      reply
    };
  } catch (error) {
    markKeyResult(keyIndex, false, error.message || 'Gemini request failed.');
    return {
      success: false,
      error: error.message || 'Gemini request failed.'
    };
  }
}

async function handleChat(req, res) {
  const incoming = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const history = normalizeHistory(req.body?.history);
  const systemPrompt = typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt.trim() : '';

  if (!incoming) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  totalRequests += 1;

  const result = await generateReply(systemPrompt, incoming, history);

  if (!result.success) {
    failedRequests += 1;
    return res.status(503).json({
      reply: 'The model is unavailable right now. Please try again in a moment.',
      source: 'unavailable',
      error: result.error
    });
  }

  successfulRequests += 1;

  return res.status(200).json({
    reply: result.reply,
    source: 'gemini'
  });
}

function handleStatus(req, res) {
  const availableKeys = keyStatus.filter((status) => status.available && !status.quotaExceeded).length;
  const configuredKeys = API_KEYS.length;
  const hasConfiguredKeys = configuredKeys > 0;
  const status = !hasConfiguredKeys
    ? 'not_configured'
    : availableKeys > 0
      ? 'active'
      : 'inactive';

  return res.status(200).json({
    status,
    configuredKeys,
    availableKeys,
    failedRequests,
    successfulRequests,
    totalRequests,
    message: !hasConfiguredKeys
      ? 'No Gemini API keys configured.'
      : availableKeys > 0
        ? `${availableKeys} API key${availableKeys === 1 ? '' : 's'} active.`
        : 'API keys are configured but currently inactive.',
    configuration: {
      maxResponseTokens: CONFIG.MAX_RESPONSE_TOKENS,
      maxHistoryMessages: CONFIG.MAX_HISTORY_MESSAGES,
      temperature: CONFIG.TEMPERATURE
    }
  });
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      return handleStatus(req, res);
    }

    if (req.method === 'POST') {
      return await handleChat(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Serverless chat error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
