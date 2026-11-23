const crypto = require('crypto');
const mail = require('./mail');

const CODE_TTL_MS = 10 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS = 5;
const MAX_ATTEMPTS = 5;
const GENERIC = 'If an active account exists for that email, a code is on its way. You can ask for a code five times every 15 minutes.';

function normalEmail(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const email = value.trim().toLowerCase();
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

function publicAccount(account) {
  return {
    id: String(account._id),
    email: account.email,
    type: account.type,
    status: account.status,
    note: account.note || '',
    requestedType: account.requestedType || account.type,
    createdAt: account.createdAt
  };
}

async function ensureAdmin(dbo) {
  const email = normalEmail(process.env.ADMIN_EMAIL || '');
  if (!email) {
    return;
  }
  const collection = dbo.getDb().collection('accounts');
  const existing = await collection.findOne({ email: email });
  if (existing) {
    return;
  }
  await collection.insertOne({
    email: email,
    type: 'admin',
    status: 'active',
    note: 'First admin from ADMIN_EMAIL',
    requestedType: 'admin',
    createdAt: new Date(),
    decidedAt: new Date(),
    decidedBy: 'system'
  });
}

async function expireOldResults(dbo) {
  const days = parseInt(process.env.RESULT_RETENTION_DAYS || '365', 10);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  await dbo.getDb().collection('Results').deleteMany({ date: { $lt: cutoff } });
  await dbo.getDb().collection('loginCodes').deleteMany({ expiresAt: { $lt: new Date() } });
}

async function nextEvalSetId(dbo, ids) {
  const sessions = await dbo.getDb().collection('Sessions').find({ evalSetId: { $in: ids } }).toArray();
  const counts = {};
  ids.forEach(function(id) { counts[id] = 0; });
  sessions.forEach(function(session) {
    if (counts[session.evalSetId] !== undefined) {
      counts[session.evalSetId] += 1;
    }
  });
  return ids.slice().sort(function(a, b) {
    return counts[a] - counts[b] || a.localeCompare(b);
  })[0];
}

async function requestCode(dbo, email) {
  if (process.env.NODE_ENV === 'production' && !mail.configured()) {
    const error = new Error('Email is not configured');
    error.code = 'NO_MAIL';
    throw error;
  }
  const accounts = dbo.getDb().collection('accounts');
  const codes = dbo.getDb().collection('loginCodes');
  const account = await accounts.findOne({ email: email, status: 'active' });
  const now = new Date();
  const existing = await codes.findOne({ email: email });
  let sends = existing && existing.windowStart && (now - existing.windowStart) < WINDOW_MS ? existing.sendsInWindow || 0 : 0;
  const windowStart = sends === 0 ? now : existing.windowStart;
  if (sends >= MAX_SENDS) {
    return GENERIC;
  }
  sends += 1;
  if (!account) {
    await codes.updateOne({ email: email }, {
      $set: { email: email, windowStart: windowStart, sendsInWindow: sends, attempts: MAX_ATTEMPTS, expiresAt: now }
    }, { upsert: true });
    return GENERIC;
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await codes.updateOne({ email: email }, {
    $set: {
      email: email,
      codeHash: mail.hashCode(email, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      windowStart: windowStart,
      sendsInWindow: sends
    }
  }, { upsert: true });
  await mail.sendLoginCode(email, code);
  return GENERIC;
}

async function checkCode(dbo, email, code) {
  const codes = dbo.getDb().collection('loginCodes');
  const record = await codes.findOne({ email: email });
  if (!record || !record.codeHash || record.attempts >= MAX_ATTEMPTS || record.expiresAt < new Date()) {
    return null;
  }
  if (record.codeHash !== mail.hashCode(email, code)) {
    await codes.updateOne({ email: email }, { $inc: { attempts: 1 } });
    return null;
  }
  await codes.deleteOne({ email: email });
  return dbo.getDb().collection('accounts').findOne({ email: email, status: 'active' });
}

async function requestAccount(dbo, email, requestedType, note) {
  const accounts = dbo.getDb().collection('accounts');
  const existing = await accounts.findOne({ email: email });
  if (!existing) {
    await accounts.insertOne({
      email: email,
      type: requestedType,
      status: 'pending',
      requestedType: requestedType,
      note: note,
      createdAt: new Date(),
      decidedAt: null,
      decidedBy: null
    });
  }
}

module.exports = {
  normalEmail: normalEmail,
  publicAccount: publicAccount,
  ensureAdmin: ensureAdmin,
  expireOldResults: expireOldResults,
  nextEvalSetId: nextEvalSetId,
  requestCode: requestCode,
  checkCode: checkCode,
  requestAccount: requestAccount,
  GENERIC: GENERIC
};
