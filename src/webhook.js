// Fire the lead.created webhook. Never throws: a dead endpoint must not stop a lead from saving.
function makeWebhook({ url, fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {}) {
  return async (lead) => {
    if (!url) return;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'lead.created', lead }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res && res.ok === false) console.warn(`Webhook returned HTTP ${res.status} for lead ${lead.id}`);
    } catch (err) {
      console.warn(`Webhook failed for lead ${lead.id}: ${err.message}`);
    }
  };
}

module.exports = { makeWebhook };
