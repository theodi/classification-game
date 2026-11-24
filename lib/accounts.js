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

function isOdiEmail(email) {
  return typeof email === 'string' && email.endsWith('@theodi.org');
}

async function ensureOdiAdmin(dbo, email) {
  if (!isOdiEmail(email)) {
    return null;
  }
  const collection = dbo.getDb().collection('accounts');
  const existing = await collection.findOne({ email: email });
  const now = new Date();
  if (existing && existing.status === 'active' && existing.type === 'admin') {
    return existing;
  }
  if (!existing) {
    const doc = {
      email: email,
      type: 'admin',
      status: 'active',
      note: 'Auto-admin for @theodi.org',
      requestedType: 'admin',
      createdAt: now,
      decidedAt: now,
      decidedBy: 'system'
    };
    const result = await collection.insertOne(doc);
    doc._id = result.insertedId;
    return doc;
  }
  await collection.updateOne({ email: email }, {
    $set: {
      type: 'admin',
      status: 'active',
      decidedAt: now,
      decidedBy: 'system'
    }
  });
  return collection.findOne({ email: email });
}

function publicAccount(account) {
  return {
    id: String(account._id),
    email: account.email,
    type: account.type,
    status: account.status,
    schoolId: account.schoolId ? String(account.schoolId) : null,
    note: account.note || '',
    requestedType: account.requestedType || account.type,
    createdAt: account.createdAt
  };
}

function sessionAccount(account) {
  return {
    id: String(account._id),
    email: account.email,
    type: account.type,
    schoolId: account.schoolId ? String(account.schoolId) : null
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
  const schools = require('./schools');
  const accounts = dbo.getDb().collection('accounts');
  const codes = dbo.getDb().collection('loginCodes');
  let account = await accounts.findOne({ email: email, status: 'active' });
  if (!account) {
    account = await ensureOdiAdmin(dbo, email);
  }
  if (!account) {
    account = await schools.ensureDomainStudent(dbo, email);
  }
  if (account && await schools.schoolExpiredForAccount(dbo, account)) {
    return { message: schools.EXPIRED_MESSAGE, expired: true };
  }
  const now = new Date();
  const existing = await codes.findOne({ email: email });
  let sends = existing && existing.windowStart && (now - existing.windowStart) < WINDOW_MS ? existing.sendsInWindow || 0 : 0;
  const windowStart = sends === 0 ? now : existing.windowStart;
  if (sends >= MAX_SENDS) {
    return { message: GENERIC };
  }
  sends += 1;
  if (!account) {
    await codes.updateOne({ email: email }, {
      $set: { email: email, windowStart: windowStart, sendsInWindow: sends, attempts: MAX_ATTEMPTS, expiresAt: now }
    }, { upsert: true });
    return { message: GENERIC };
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
  const result = { message: GENERIC };
  if (process.env.NODE_ENV !== 'production') {
    result.developmentCode = code;
  }
  return result;
}

async function checkCode(dbo, email, code) {
  const schools = require('./schools');
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
  const account = await dbo.getDb().collection('accounts').findOne({ email: email, status: 'active' });
  if (account && await schools.schoolExpiredForAccount(dbo, account)) {
    const error = new Error(schools.EXPIRED_MESSAGE);
    error.code = 'SCHOOL_EXPIRED';
    throw error;
  }
  return account;
}

async function requestAccount(dbo, email, requestedType, note) {
  if (isOdiEmail(email)) {
    await ensureOdiAdmin(dbo, email);
    return;
  }
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
  sessionAccount: sessionAccount,
  isOdiEmail: isOdiEmail,
  ensureAdmin: ensureAdmin,
  expireOldResults: expireOldResults,
  nextEvalSetId: nextEvalSetId,
  requestCode: requestCode,
  checkCode: checkCode,
  requestAccount: requestAccount,
  GENERIC: GENERIC
};
