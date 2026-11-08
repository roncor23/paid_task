const SERVICES = ['cleaning', 'repair', 'consultation', 'other'];
const STATUSES = ['new', 'contacted', 'won', 'lost'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const chars = (s) => [...s].length; // count Unicode characters, not UTF-16 units or bytes
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Values are checked but never altered: text is stored exactly as typed.
function validateLead(body) {
  if (!isObject(body)) return { error: 'Request body must be a JSON object' };
  const { name, email, phone, service, message } = body;

  if (name === undefined || name === null) return { error: 'name is required' };
  if (typeof name !== 'string') return { error: 'name must be a string' };
  if (!name.trim()) return { error: 'name is required' };
  if (chars(name) > 100) return { error: 'name must be 100 characters or fewer' };

  if (email === undefined || email === null || email === '') return { error: 'email is required' };
  if (typeof email !== 'string') return { error: 'email must be a string' };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { error: 'email must be a valid email address' };

  if (phone !== undefined && phone !== null && typeof phone !== 'string') return { error: 'phone must be a string' };
  if (typeof phone === 'string' && chars(phone) > 50) return { error: 'phone must be 50 characters or fewer' };

  if (service === undefined || service === null || service === '') return { error: 'service is required' };
  if (!SERVICES.includes(service)) return { error: `service must be one of: ${SERVICES.join(', ')}` };

  if (message === undefined || message === null) return { error: 'message is required' };
  if (typeof message !== 'string') return { error: 'message must be a string' };
  if (!message.trim()) return { error: 'message is required' };
  if (chars(message) > 2000) return { error: 'message must be 2000 characters or fewer' };

  return { value: { name, email, phone: phone || '', service, message } };
}

function validatePatch(body) {
  if (!isObject(body)) return { error: 'Request body must be a JSON object' };
  const patch = {};
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) return { error: `status must be one of: ${STATUSES.join(', ')}` };
    patch.status = body.status;
  }
  if ('note' in body) {
    if (typeof body.note !== 'string') return { error: 'note must be a string' };
    if (chars(body.note) > 5000) return { error: 'note must be 5000 characters or fewer' };
    patch.note = body.note;
  }
  if (!Object.keys(patch).length) return { error: 'Provide status and/or note' };
  return { value: patch };
}

module.exports = { validateLead, validatePatch, SERVICES, STATUSES };
