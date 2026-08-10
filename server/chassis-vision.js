'use strict';

const { normalizeUnderstellsnummer } = require('./vegvesen');

function sanitizeOpenAiApiKey(raw) {
  let key = String(raw || '').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith('\'') && key.endsWith('\''))) {
    key = key.slice(1, -1).trim();
  }
  if (/^OPENAI_API_KEY=/i.test(key)) {
    key = key.replace(/^OPENAI_API_KEY=/i, '').trim();
  }
  return key;
}

function parseVisionJson(content) {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function rankVisionCandidates(values) {
  const seen = new Set();
  const out = [];
  (values || []).forEach(function (raw) {
    const value = normalizeUnderstellsnummer(raw);
    if (!value || value.length < 11 || value.length > 17 || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

async function readChassisWithOpenAI(imageBuffer, mimeType, apiKey) {
  const base64 = imageBuffer.toString('base64');
  const mediaType = mimeType || 'image/jpeg';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Du leser understellsnummer / VIN (chassisnummer) fra et bildet.',
              'Returner KUN JSON: {"candidates":["..."]}.',
              'Regler:',
              '- Kun understellsnummer/VIN, ingen annen tekst.',
              '- Store bokstaver og tall, ingen mellomrom.',
              '- Typisk 17 tegn, men behold 11–17 hvis det er det som står.',
              '- Maks 3 kandidater, beste først.',
              '- Hvis uleselig: {"candidates":[]}.'
            ].join('\n')
          },
          {
            type: 'image_url',
            image_url: {
              url: 'data:' + mediaType + ';base64,' + base64
            }
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(function () { return ''; });
    let message = 'Vision-OCR feilet (' + response.status + ').';
    if (response.status === 401) {
      message = 'OpenAI avviste API-nøkkelen (401). Sjekk at OPENAI_API_KEY i Vercel er en gyldig nøkkel som starter med sk-, uten anførselstegn.';
    }
    const error = new Error(message);
    error.code = response.status === 401 ? 'VISION_AUTH' : 'VISION_ERROR';
    error.detail = errText.slice(0, 240);
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content || '';
  const parsed = parseVisionJson(content);
  const candidates = rankVisionCandidates(parsed?.candidates);

  return {
    candidates: candidates.map(function (value) {
      return {
        value,
        score: 2000,
        validVin: value.length === 17,
        validChecksum: false,
        confidence: 95,
        source: 'openai-vision'
      };
    }),
    best: candidates[0] || '',
    engine: 'openai'
  };
}

function isVisionConfigured() {
  return !!sanitizeOpenAiApiKey(process.env.OPENAI_API_KEY);
}

function getOpenAiApiKey() {
  return sanitizeOpenAiApiKey(process.env.OPENAI_API_KEY);
}

module.exports = {
  isVisionConfigured,
  getOpenAiApiKey,
  sanitizeOpenAiApiKey,
  readChassisWithOpenAI
};
