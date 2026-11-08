// Lead sorting: keyword rules always work; an optional Claude call runs first when a key is set.
const CATEGORIES = ['booking', 'question', 'complaint', 'other'];
const URGENCIES = ['high', 'normal', 'low'];

const has = (text, words) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

const COMPLAINT = ['complain', 'terrible', 'awful', 'horrible', 'worst', 'rude', 'refund', 'disappoint',
  'unhappy', 'not happy', 'broke', 'damaged', 'ruined', 'never (showed|came|called)', 'no.?show', 'late again',
  'unacceptable', 'poor service', 'bad service', 'scam', 'overcharg', 'angry', 'furious', 'still not fixed'];
const BOOKING = ['book', 'schedul', 'appointment', 'reserv', 'availab', 'come (on|over|by|to)?',
  'visit', 'quote for', 'hire', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'tomorrow', 'next week', 'this week', 'slot', 'set up a time', 'when can you', 'need (a|someone|you)'];
const QUESTION = ['how much', 'price', 'pricing', 'cost', 'rate', 'do you', 'can you', 'are you', 'is it',
  'what', 'how', 'which', 'does', 'info', 'wonder'];
const HIGH = ['urgent', 'asap', 'emergency', 'immediately', 'right away', 'today', 'tonight', 'now',
  'leak', 'flood', 'fire', 'smoke', 'gas', 'no power', 'no water', 'dangerous', 'help!'];
const LOW = ['no rush', 'whenever', 'no hurry', 'not urgent', 'sometime', 'next month', 'in a few weeks',
  'just curious', 'just wondering', 'eventually', 'when you get a chance'];

function ruleSort({ message = '', service = 'other' } = {}) {
  const text = String(message);
  let category = 'other';
  if (has(text, COMPLAINT)) category = 'complaint';
  else if (has(text, BOOKING) && !/^\s*(how much|what|do you|does)\b/i.test(text)) category = 'booking';
  else if (text.includes('?') || has(text, QUESTION)) category = 'question';

  let urgency = 'normal';
  if (has(text, HIGH)) urgency = 'high';
  else if (has(text, LOW) && category !== 'complaint') urgency = 'low';
  return { category, urgency };
}

async function aiSort({ message, service }, { apiKey, fetchImpl, timeoutMs, model }) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 50,
      system: 'You sort inbound leads for a service business. Reply with JSON only: '
        + '{"category": one of booking|question|complaint|other, "urgency": one of high|normal|low}.',
      messages: [{ role: 'user', content: `Service: ${service}\nMessage:\n${message}` }],
    }),
  });
  if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  if (!CATEGORIES.includes(parsed.category) || !URGENCIES.includes(parsed.urgency)) throw new Error('AI bad output');
  return { category: parsed.category, urgency: parsed.urgency };
}

function makeSorter({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 4000, model = 'claude-haiku-5-5' } = {}) {
  return async (lead) => {
    if (apiKey) {
      try {
        return await aiSort(lead, { apiKey, fetchImpl, timeoutMs, model });
      } catch (err) {
        console.warn('AI sort failed, using rules:', err.message);
      }
    }
    return ruleSort(lead);
  };
}

module.exports = { ruleSort, makeSorter, CATEGORIES, URGENCIES };
