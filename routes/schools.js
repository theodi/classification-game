const accounts = require('../lib/accounts');
const schools = require('../lib/schools');
const mail = require('../lib/mail');

const EVAL_SET_IDS = Array.from({ length: 20 }, function(_, index) {
  return 'E' + String(index + 1).padStart(2, '0');
});

function register(app, deps) {
  const dbo = deps.dbo;
  const ObjectId = deps.ObjectId;

  function wantsJson(req) {
    return deps.wantsJson(req);
  }

  function currentAccount(req) {
    return deps.currentAccount(req);
  }

  function isTeacher(req) {
    const account = currentAccount(req);
    return account && (account.type === 'teacher' || account.type === 'admin');
  }

  function requireTeacher(req, res, next) {
    if (isTeacher(req)) {
      return next();
    }
    if (wantsJson(req)) {
      return res.status(401).json({ error: 'Sign in as a teacher required' });
    }
    if (!currentAccount(req)) {
      return res.redirect('/login');
    }
    res.locals.pageTitle = '401 Unauthorised';
    return res.status(401).render('errors/401');
  }

  function requireAdmin(req, res, next) {
    const account = currentAccount(req);
    if (account && account.type === 'admin') {
      return next();
    }
    if (wantsJson(req)) {
      return res.status(401).json({ error: 'An admin sign-in is required' });
    }
    if (!account) {
      return res.redirect('/login');
    }
    res.locals.pageTitle = '401 Unauthorised';
    return res.status(401).render('errors/401');
  }

  function schoolExpiredResponse(req, res) {
    if (wantsJson(req)) {
      return res.status(403).json({ error: schools.EXPIRED_MESSAGE });
    }
    res.locals.pageTitle = 'School access expired';
    return res.status(403).render('pages/school/expired');
  }

  async function loadSchoolAccess(req, res, next) {
    try {
      const school = await schools.findById(dbo, req.params.id);
      if (!school) {
        if (wantsJson(req)) {
          return res.status(404).json({ error: 'School not found' });
        }
        res.locals.pageTitle = '404 Not Found';
        return res.status(404).render('errors/404');
      }
      const account = currentAccount(req);
      if (!schools.canAccessSchool(account, String(school._id))) {
        if (wantsJson(req)) {
          return res.status(403).json({ error: 'You cannot access this school' });
        }
        res.locals.pageTitle = '401 Unauthorised';
        return res.status(401).render('errors/401');
      }
      if (!schools.canUseSchool(account, school)) {
        return schoolExpiredResponse(req, res);
      }
      req.school = school;
      res.locals.schoolId = String(school._id);
      res.locals.schoolName = school.name;
      res.locals.schoolExpired = schools.isSchoolExpired(school);
      return next();
    } catch (error) {
      console.error(error);
      if (wantsJson(req)) {
        return res.status(500).json({ error: 'Could not load school' });
      }
      return res.status(500).send('Could not load school');
    }
  }

  app.get('/schools', requireTeacher, async function(req, res) {
    const account = currentAccount(req);
    if (account.type === 'teacher') {
      if (!account.schoolId) {
        if (wantsJson(req)) {
          return res.status(403).json({ error: 'You are not assigned to a school' });
        }
        res.locals.pageTitle = 'No school assigned';
        return res.render('pages/school/unassigned');
      }
      const school = await schools.findById(dbo, account.schoolId);
      if (!school || schools.isSchoolExpired(school)) {
        return schoolExpiredResponse(req, res);
      }
      if (!wantsJson(req)) {
        return res.redirect('/schools/' + account.schoolId);
      }
    }
    if (wantsJson(req)) {
      return res.json(await schools.listSchoolsWithStats(dbo, account));
    }
    res.locals.pageTitle = 'Schools';
    return res.render('pages/school/list');
  });

  app.get('/schools/new', requireAdmin, function(req, res) {
    res.locals.pageTitle = 'Create school';
    res.render('pages/school/create');
  });

  app.post('/schools', requireAdmin, async function(req, res) {
    try {
      const school = await schools.createSchool(dbo, {
        name: req.body.name,
        domain: req.body.domain,
        expiresAt: req.body.expiresAt,
        createdBy: currentAccount(req).id
      });
      if (wantsJson(req)) {
        return res.status(201).json(schools.publicSchool(school));
      }
      return res.redirect('/schools/' + school._id);
    } catch (error) {
      if (error.code === 'BAD_REQUEST') {
        return res.status(400).json({ error: error.message });
      }
      if (error.code === 'CONFLICT') {
        return res.status(409).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Could not create school' });
    }
  });

  app.get('/schools/:id', requireTeacher, loadSchoolAccess, async function(req, res) {
    if (wantsJson(req)) {
      return res.json(schools.publicSchool(req.school));
    }
    res.locals.pageTitle = req.school.name;
    res.locals.evalSetIds = EVAL_SET_IDS;
    return res.render('pages/school/view');
  });

  app.get('/schools/:id/edit', requireAdmin, loadSchoolAccess, function(req, res) {
    return res.redirect('/schools/' + req.params.id);
  });

  app.patch('/schools/:id', requireAdmin, loadSchoolAccess, async function(req, res) {
    try {
      const school = await schools.updateSchool(dbo, req.params.id, {
        name: req.body.name,
        domain: req.body.domain,
        expiresAt: req.body.expiresAt
      });
      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }
      return res.json(schools.publicSchool(school));
    } catch (error) {
      if (error.code === 'BAD_REQUEST') {
        return res.status(400).json({ error: error.message });
      }
      if (error.code === 'CONFLICT') {
        return res.status(409).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Could not update school' });
    }
  });

  app.post('/schools/:id', requireAdmin, loadSchoolAccess, async function(req, res) {
    try {
      const school = await schools.updateSchool(dbo, req.params.id, {
        name: req.body.name,
        domain: req.body.domain,
        expiresAt: req.body.expiresAt
      });
      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }
      if (wantsJson(req)) {
        return res.json(schools.publicSchool(school));
      }
      return res.redirect('/schools/' + req.params.id);
    } catch (error) {
      if (error.code === 'BAD_REQUEST' || error.code === 'CONFLICT') {
        return res.status(error.code === 'CONFLICT' ? 409 : 400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Could not update school' });
    }
  });

  app.delete('/schools/:id', requireAdmin, loadSchoolAccess, async function(req, res) {
    try {
      await schools.deleteSchool(dbo, req.params.id);
      if (wantsJson(req)) {
        return res.status(204).send();
      }
      return res.redirect('/schools');
    } catch (error) {
      if (error.code === 'CONFLICT') {
        return res.status(409).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Could not delete school' });
    }
  });

  app.get('/schools/:id/teachers', requireTeacher, loadSchoolAccess, async function(req, res) {
    const rows = await schools.listTeachers(dbo, req.params.id);
    if (wantsJson(req)) {
      return res.json(rows.map(accounts.publicAccount));
    }
    return res.redirect('/schools/' + req.params.id);
  });

  app.post('/schools/:id/teachers', requireTeacher, loadSchoolAccess, async function(req, res) {
    const account = currentAccount(req);
    if (!schools.canManageTeachers(account, req.params.id)) {
      return res.status(403).json({ error: 'You cannot add teachers to this school' });
    }
    try {
      const teacher = await schools.addTeacher(dbo, req.school, req.body.email, account.email);
      if (wantsJson(req)) {
        return res.status(201).json(accounts.publicAccount(teacher));
      }
      return res.redirect('/schools/' + req.params.id);
    } catch (error) {
      if (error.code === 'BAD_REQUEST') {
        return res.status(400).json({ error: error.message });
      }
      if (error.code === 'CONFLICT') {
        return res.status(409).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Could not add teacher' });
    }
  });

  app.delete('/schools/:id/teachers/:accountId', requireTeacher, loadSchoolAccess, async function(req, res) {
    const account = currentAccount(req);
    if (!schools.canManageTeachers(account, req.params.id)) {
      return res.status(403).json({ error: 'You cannot remove teachers from this school' });
    }
    if (account.type !== 'admin' && String(account.id) === String(req.params.accountId)) {
      return res.status(400).json({ error: 'Ask another teacher or an admin to remove you' });
    }
    const removed = await schools.removeTeacher(dbo, req.params.id, req.params.accountId);
    if (!removed) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    if (wantsJson(req)) {
      return res.status(204).send();
    }
    return res.redirect('/schools/' + req.params.id);
  });

  app.get('/schools/:id/sessions', requireTeacher, loadSchoolAccess, async function(req, res) {
    if (wantsJson(req)) {
      const rows = await dbo.getDb().collection('Sessions').find({
        $or: [{ schoolId: String(req.params.id) }, { leaderboardId: String(req.params.id) }]
      }).sort({ createdAt: -1, name: 1 }).toArray();
      return res.json(rows);
    }
    return res.redirect('/schools/' + req.params.id);
  });

  app.get('/schools/:id/sessions/new', requireTeacher, loadSchoolAccess, function(req, res) {
    return res.redirect('/schools/' + req.params.id + '#sessions-section');
  });

  app.post('/schools/:id/sessions', requireTeacher, loadSchoolAccess, async function(req, res) {
    try {
      const evalSetId = await accounts.nextEvalSetId(dbo, EVAL_SET_IDS);
      const data = {
        name: String(req.body.name || '').trim().slice(0, 200),
        schoolId: String(req.params.id),
        leaderboardId: String(req.params.id),
        hidePublic: 'off',
        evalSetId: evalSetId,
        packId: 'group1',
        createdBy: currentAccount(req).id,
        createdAt: new Date()
      };
      if (!data.name) {
        return res.status(400).json({ error: 'Enter a session name' });
      }
      const result = await dbo.getDb().collection('Sessions').insertOne(data);
      if (wantsJson(req)) {
        data._id = result.insertedId;
        return res.status(201).json(data);
      }
      return res.redirect('/schools/' + req.params.id);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Could not create session' });
    }
  });

  app.get('/schools/:id/sessions/:sessionId', requireTeacher, loadSchoolAccess, async function(req, res) {
    if (!ObjectId.isValid(req.params.sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = await dbo.getDb().collection('Sessions').findOne({ _id: new ObjectId(req.params.sessionId) });
    if (!session || schools.sessionSchoolId(session) !== String(req.params.id)) {
      if (wantsJson(req)) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.locals.pageTitle = '404 Not Found';
      return res.status(404).render('errors/404');
    }
    if (wantsJson(req)) {
      return res.json(session);
    }
    res.locals.pageTitle = session.name || 'Session';
    res.locals.id = req.params.id;
    res.locals.sessionId = req.params.sessionId;
    return res.render('pages/session/view');
  });

  app.get('/schools/:id/sessions/:sessionId/submit', requireTeacher, loadSchoolAccess, function(req, res) {
    return res.redirect('/schools/' + req.params.id + '/sessions/' + req.params.sessionId);
  });

  app.get('/schools/:id/sessions/:sessionId/edit', requireTeacher, loadSchoolAccess, async function(req, res) {
    res.locals.pageTitle = 'Edit session';
    res.locals.id = req.params.id;
    res.locals.sessionId = req.params.sessionId;
    res.locals.evalSetIds = EVAL_SET_IDS;
    res.render('pages/session/edit');
  });

  app.get('/schools/:id/sessions/:sessionId/board', requireTeacher, loadSchoolAccess, function(req, res) {
    if (wantsJson(req)) {
      return res.redirect(307, '/schools/' + req.params.id + '/sessions/' + req.params.sessionId + '/results');
    }
    res.locals.pageTitle = 'Class board';
    res.locals.id = req.params.id;
    res.locals.sessionId = req.params.sessionId;
    res.render('pages/session/board');
  });

  app.put('/schools/:id/sessions/:sessionId', requireTeacher, loadSchoolAccess, async function(req, res) {
    if (!ObjectId.isValid(req.params.sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const existing = await dbo.getDb().collection('Sessions').findOne({ _id: new ObjectId(req.params.sessionId) });
    if (!existing || schools.sessionSchoolId(existing) !== String(req.params.id)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const update = {};
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      update.name = req.body.name.trim().slice(0, 200);
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Nothing to change' });
    }
    await dbo.getDb().collection('Sessions').updateOne(
      { _id: new ObjectId(req.params.sessionId) },
      { $set: update }
    );
    return res.status(200).json({ message: 'Session updated' });
  });

  app.delete('/schools/:id/sessions/:sessionId', requireTeacher, loadSchoolAccess, async function(req, res) {
    if (!ObjectId.isValid(req.params.sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const results = await dbo.getDb().collection('Results').countDocuments({ sessionId: String(req.params.sessionId) });
    if (results > 0) {
      return res.status(409).json({ error: 'Cannot delete a session that has results' });
    }
    const result = await dbo.getDb().collection('Sessions').deleteOne({
      _id: new ObjectId(req.params.sessionId),
      $or: [{ schoolId: String(req.params.id) }, { leaderboardId: String(req.params.id) }]
    });
    if (!result.deletedCount) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (wantsJson(req)) {
      return res.status(204).send();
    }
    return res.redirect('/schools/' + req.params.id + '/sessions');
  });

  app.get('/schools/:id/results', requireTeacher, loadSchoolAccess, async function(req, res) {
    if (!wantsJson(req)) {
      res.locals.pageTitle = 'School leaderboard — ' + req.school.name;
      res.locals.id = req.params.id;
      return res.render('pages/school/board');
    }
    const sessionDocs = await dbo.getDb().collection('Sessions').find({
      $or: [{ schoolId: String(req.params.id) }, { leaderboardId: String(req.params.id) }]
    }).toArray();
    const sessionIds = sessionDocs.map(function(row) { return String(row._id); });
    const output = await dbo.getDb().collection('Results').find({
      sessionId: { $in: sessionIds }
    }).sort({ score: -1 }).toArray();
    return res.json(output);
  });

  app.get('/schools/:id/sessions/:sessionId/results', requireTeacher, loadSchoolAccess, async function(req, res) {
    if (!wantsJson(req)) {
      return res.redirect('/schools/' + req.params.id + '/sessions/' + req.params.sessionId);
    }
    const output = await dbo.getDb().collection('Results').find({
      sessionId: String(req.params.sessionId)
    }).sort({ score: -1 }).toArray();
    return res.json(output);
  });

  app.post('/schools/:id/sessions/:sessionId/invites', requireTeacher, loadSchoolAccess, async function(req, res) {
    if (!ObjectId.isValid(req.params.sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = await dbo.getDb().collection('Sessions').findOne({ _id: new ObjectId(req.params.sessionId) });
    if (!session || schools.sessionSchoolId(session) !== String(req.params.id)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const rawEmails = Array.isArray(req.body.emails)
      ? req.body.emails
      : String(req.body.emails || req.body.email || '').split(/[\s,;]+/);
    const emails = [];
    const seen = {};
    rawEmails.forEach(function(value) {
      const email = accounts.normalEmail(value);
      if (email && !seen[email]) {
        seen[email] = true;
        emails.push(email);
      }
    });
    if (!emails.length) {
      return res.status(400).json({ error: 'Enter at least one valid email address' });
    }
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const url = proto + '://' + host + '/game/' + req.params.sessionId;
    try {
      for (let i = 0; i < emails.length; i++) {
        await mail.sendSessionLink(emails[i], {
          sessionName: session.name || 'class session',
          url: url
        });
      }
      const label = emails.length === 1 ? 'Link sent to 1 address' : 'Link sent to ' + emails.length + ' addresses';
      return res.status(202).json({ ok: true, message: label, sent: emails.length });
    } catch (error) {
      if (error.code === 'NO_MAIL') {
        return res.status(503).json({ error: 'Email is not configured' });
      }
      console.error(error);
      return res.status(500).json({ error: 'Could not send the link' });
    }
  });
}

module.exports = {
  register: register,
  EVAL_SET_IDS: EVAL_SET_IDS
};
