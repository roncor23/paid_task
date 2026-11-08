const crypto = require('node:crypto');

const COOKIE = 'session';
const MAX_AGE_S = 7 * 24 * 3600;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const sign = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function makeSession(secret) {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_S);
  return `${exp}.${sign(secret, exp)}`;
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function validSession(value, secret) {
  if (!value || !secret) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  return safeEqual(sig, sign(secret, exp)) && Number(exp) > Date.now() / 1000;
}

module.exports = { COOKIE, MAX_AGE_S, safeEqual, makeSession, readCookie, validSession };
