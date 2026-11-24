const accounts = require('./accounts');

function normalDomain(value) {
  if (typeof value !== 'string') {
    return null;
  }
  let domain = value.trim().toLowerCase();
  domain = domain.replace(/^@/, '').replace(/^https?:\/\//, '').split('/')[0];
  if (!domain || domain.length > 200 || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(domain)) {
    return null;
  }
  return domain;
}

function emailDomain(email) {
  if (typeof email !== 'string' || email.indexOf('@') < 0) {
    return null;
  }
  return normalDomain(email.split('@').pop());
}

/** Calendar date → end of that UTC day (23:59:59.999Z). Accepts Date or YYYY-MM-DD. */
function parseExpiresAt(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23, 59, 59, 999
    ));
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parseExpiresAt(parsed);
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const expiresAt = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  if (
    expiresAt.getUTCFullYear() !== year ||
    expiresAt.getUTCMonth() !== month ||
    expiresAt.getUTCDate() !== day
  ) {
    return null;
  }
  return expiresAt;
}

function formatExpiresAtDate(expiresAt) {
  if (!expiresAt) {
    return '';
  }
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

function isSchoolExpired(school) {
  if (!school || !school.expiresAt) {
    return true;
  }
  const expiresAt = school.expiresAt instanceof Date ? school.expiresAt : new Date(school.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return true;
  }
  return Date.now() > expiresAt.getTime();
}

function publicSchool(school) {
  if (!school) {
    return null;
  }
  return {
    id: String(school._id),
    name: school.name,
    domain: school.domain,
    type: school.type || 'school',
    cardset: school.cardset || ['1'],
    createdBy: school.createdBy || null,
    createdAt: school.createdAt || null,
    expiresAt: school.expiresAt || null,
    expiresOn: formatExpiresAtDate(school.expiresAt),
    expired: isSchoolExpired(school)
  };
}

function sessionSchoolId(session) {
  if (!session) {
    return '';
  }
  return String(session.schoolId || session.leaderboardId || '');
}

function canAccessSchool(account, schoolId) {
  if (!account || !schoolId) {
    return false;
  }
  if (account.type === 'admin') {
    return true;
  }
  if (account.type === 'teacher' && account.schoolId && String(account.schoolId) === String(schoolId)) {
    return true;
  }
  return false;
}

/** Membership plus expiry: admins always; teachers only while school is active. */
function canUseSchool(account, school) {
  if (!account || !school) {
    return false;
  }
  if (account.type === 'admin') {
    return true;
  }
  if (!canAccessSchool(account, String(school._id))) {
    return false;
  }
  return !isSchoolExpired(school);
}

function canManageTeachers(account, schoolId) {
  return canAccessSchool(account, schoolId) && (account.type === 'admin' || account.type === 'teacher');
}

async function findById(dbo, id) {
  const ObjectId = require('mongodb').ObjectID;
  if (!ObjectId.isValid(String(id))) {
    return null;
  }
  return dbo.getDb().collection('Schools').findOne({ _id: new ObjectId(String(id)) });
}

async function findByDomain(dbo, domain) {
  const normalized = normalDomain(domain);
  if (!normalized) {
    return null;
  }
  return dbo.getDb().collection('Schools').findOne({ domain: normalized });
}

async function schoolForEmailDomain(dbo, email) {
  const domain = emailDomain(email);
  if (!domain) {
    return null;
  }
  return findByDomain(dbo, domain);
}

async function listSchools(dbo, account) {
  const collection = dbo.getDb().collection('Schools');
  if (account.type === 'admin') {
    return collection.find({}).sort({ name: 1 }).toArray();
  }
  if (account.type === 'teacher' && account.schoolId) {
    const ObjectId = require('mongodb').ObjectID;
    if (!ObjectId.isValid(String(account.schoolId))) {
      return [];
    }
    const school = await collection.findOne({ _id: new ObjectId(String(account.schoolId)) });
    return school ? [school] : [];
  }
  return [];
}

async function listSchoolsWithStats(dbo, account) {
  const rows = await listSchools(dbo, account);
  const db = dbo.getDb();
  return Promise.all(rows.map(async function(school) {
    const id = String(school._id);
    const sessionCount = await db.collection('Sessions').countDocuments({
      $or: [{ schoolId: id }, { leaderboardId: id }]
    });
    const teacherCount = await db.collection('accounts').countDocuments({
      schoolId: id,
      type: 'teacher'
    });
    const public = publicSchool(school);
    public.sessionCount = sessionCount;
    public.teacherCount = teacherCount;
    return public;
  }));
}

async function createSchool(dbo, { name, domain, createdBy, expiresAt }) {
  const normalized = normalDomain(domain);
  if (!name || typeof name !== 'string' || !name.trim()) {
    const error = new Error('Enter a school name');
    error.code = 'BAD_REQUEST';
    throw error;
  }
  if (!normalized) {
    const error = new Error('Enter a valid email domain');
    error.code = 'BAD_REQUEST';
    throw error;
  }
  const parsedExpiry = parseExpiresAt(expiresAt);
  if (!parsedExpiry) {
    const error = new Error('Enter a valid expiry date');
    error.code = 'BAD_REQUEST';
    throw error;
  }
  const existing = await findByDomain(dbo, normalized);
  if (existing) {
    const error = new Error('A school already uses that domain');
    error.code = 'CONFLICT';
    throw error;
  }
  const doc = {
    name: name.trim().slice(0, 200),
    domain: normalized,
    type: 'school',
    cardset: ['1'],
    expiresAt: parsedExpiry,
    createdBy: createdBy || null,
    createdAt: new Date()
  };
  const result = await dbo.getDb().collection('Schools').insertOne(doc);
  doc._id = result.insertedId;
  return doc;
}

async function updateSchool(dbo, id, fields) {
  const ObjectId = require('mongodb').ObjectID;
  const update = {};
  if (typeof fields.name === 'string' && fields.name.trim()) {
    update.name = fields.name.trim().slice(0, 200);
  }
  if (fields.domain !== undefined) {
    const normalized = normalDomain(fields.domain);
    if (!normalized) {
      const error = new Error('Enter a valid email domain');
      error.code = 'BAD_REQUEST';
      throw error;
    }
    const clash = await dbo.getDb().collection('Schools').findOne({
      domain: normalized,
      _id: { $ne: new ObjectId(String(id)) }
    });
    if (clash) {
      const error = new Error('A school already uses that domain');
      error.code = 'CONFLICT';
      throw error;
    }
    update.domain = normalized;
  }
  if (fields.expiresAt !== undefined) {
    const parsedExpiry = parseExpiresAt(fields.expiresAt);
    if (!parsedExpiry) {
      const error = new Error('Enter a valid expiry date');
      error.code = 'BAD_REQUEST';
      throw error;
    }
    update.expiresAt = parsedExpiry;
  }
  if (!Object.keys(update).length) {
    const error = new Error('Nothing to change');
    error.code = 'BAD_REQUEST';
    throw error;
  }
  update.updatedAt = new Date();
  const result = await dbo.getDb().collection('Schools').updateOne(
    { _id: new ObjectId(String(id)) },
    { $set: update }
  );
  if (!result.matchedCount) {
    return null;
  }
  return findById(dbo, id);
}

async function deleteSchool(dbo, id) {
  const ObjectId = require('mongodb').ObjectID;
  const sessions = await dbo.getDb().collection('Sessions').countDocuments({
    $or: [{ schoolId: String(id) }, { leaderboardId: String(id) }]
  });
  if (sessions > 0) {
    const error = new Error('Cannot delete a school that has sessions');
    error.code = 'CONFLICT';
    throw error;
  }
  const teachers = await dbo.getDb().collection('accounts').countDocuments({
    schoolId: String(id),
    type: 'teacher',
    status: 'active'
  });
  if (teachers > 0) {
    const error = new Error('Remove teachers before deleting the school');
    error.code = 'CONFLICT';
    throw error;
  }
  const result = await dbo.getDb().collection('Schools').deleteOne({ _id: new ObjectId(String(id)) });
  return result.deletedCount > 0;
}

async function listTeachers(dbo, schoolId) {
  return dbo.getDb().collection('accounts').find({
    schoolId: String(schoolId),
    type: 'teacher'
  }).sort({ email: 1 }).toArray();
}

async function addTeacher(dbo, school, email, decidedBy) {
  const normalized = accounts.normalEmail(email);
  if (!normalized) {
    const error = new Error('Enter a valid email address');
    error.code = 'BAD_REQUEST';
    throw error;
  }
  const domain = emailDomain(normalized);
  if (!domain || domain !== school.domain) {
    const error = new Error('Teacher email must use the school domain (@' + school.domain + ')');
    error.code = 'BAD_REQUEST';
    throw error;
  }
  if (accounts.isOdiEmail(normalized)) {
    const error = new Error('ODI staff are platform admins, not school teachers');
    error.code = 'BAD_REQUEST';
    throw error;
  }
  const collection = dbo.getDb().collection('accounts');
  const existing = await collection.findOne({ email: normalized });
  const now = new Date();
  const schoolId = String(school._id);
  if (existing) {
    if (existing.type === 'admin') {
      const error = new Error('That account is a platform admin');
      error.code = 'CONFLICT';
      throw error;
    }
    if (existing.schoolId && String(existing.schoolId) !== schoolId) {
      const error = new Error('That email already belongs to another school');
      error.code = 'CONFLICT';
      throw error;
    }
    await collection.updateOne({ email: normalized }, {
      $set: {
        type: 'teacher',
        status: 'active',
        schoolId: schoolId,
        requestedType: 'teacher',
        decidedAt: now,
        decidedBy: decidedBy || 'system'
      }
    });
    return collection.findOne({ email: normalized });
  }
  const doc = {
    email: normalized,
    type: 'teacher',
    status: 'active',
    schoolId: schoolId,
    note: 'Added as school teacher',
    requestedType: 'teacher',
    createdAt: now,
    decidedAt: now,
    decidedBy: decidedBy || 'system'
  };
  const result = await collection.insertOne(doc);
  doc._id = result.insertedId;
  return doc;
}

async function removeTeacher(dbo, schoolId, accountId) {
  const ObjectId = require('mongodb').ObjectID;
  if (!ObjectId.isValid(String(accountId))) {
    return null;
  }
  const collection = dbo.getDb().collection('accounts');
  const account = await collection.findOne({ _id: new ObjectId(String(accountId)) });
  if (!account || String(account.schoolId) !== String(schoolId) || account.type !== 'teacher') {
    return null;
  }
  await collection.updateOne({ _id: account._id }, {
    $set: {
      status: 'disabled',
      decidedAt: new Date(),
      decidedBy: 'system'
    },
    $unset: { schoolId: '' }
  });
  return true;
}

async function ensureDomainStudent(dbo, email) {
  const school = await schoolForEmailDomain(dbo, email);
  if (!school || isSchoolExpired(school)) {
    return null;
  }
  const collection = dbo.getDb().collection('accounts');
  const existing = await collection.findOne({ email: email });
  if (existing) {
    return existing.status === 'active' ? existing : null;
  }
  const now = new Date();
  const doc = {
    email: email,
    type: 'selfpaced',
    status: 'active',
    schoolId: String(school._id),
    note: 'Auto student for @' + school.domain,
    requestedType: 'selfpaced',
    createdAt: now,
    decidedAt: now,
    decidedBy: 'system'
  };
  const result = await collection.insertOne(doc);
  doc._id = result.insertedId;
  return doc;
}

async function schoolExpiredForAccount(dbo, account) {
  if (!account || !account.schoolId || account.type === 'admin') {
    return false;
  }
  const school = await findById(dbo, account.schoolId);
  return isSchoolExpired(school);
}

async function ensureIndexes(dbo) {
  await dbo.getDb().collection('Schools').createIndex({ domain: 1 }, { unique: true });
}

module.exports = {
  normalDomain: normalDomain,
  emailDomain: emailDomain,
  parseExpiresAt: parseExpiresAt,
  formatExpiresAtDate: formatExpiresAtDate,
  isSchoolExpired: isSchoolExpired,
  publicSchool: publicSchool,
  sessionSchoolId: sessionSchoolId,
  canAccessSchool: canAccessSchool,
  canUseSchool: canUseSchool,
  canManageTeachers: canManageTeachers,
  findById: findById,
  findByDomain: findByDomain,
  schoolForEmailDomain: schoolForEmailDomain,
  listSchools: listSchools,
  listSchoolsWithStats: listSchoolsWithStats,
  createSchool: createSchool,
  updateSchool: updateSchool,
  deleteSchool: deleteSchool,
  listTeachers: listTeachers,
  addTeacher: addTeacher,
  removeTeacher: removeTeacher,
  ensureDomainStudent: ensureDomainStudent,
  schoolExpiredForAccount: schoolExpiredForAccount,
  ensureIndexes: ensureIndexes,
  EXPIRED_MESSAGE: 'School access has expired'
};
