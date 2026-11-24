const accounts = require('../lib/accounts');

function register(app, deps) {
  const dbo = deps.dbo;
  const ObjectId = deps.ObjectId;

  function adminOnly(req, res, next) {
    const account = deps.currentAccount(req);
    if (account && account.type === 'admin') {
      return next();
    }
    if (deps.wantsJson(req)) {
      return res.status(401).json({ error: 'An admin sign-in is required' });
    }
    if (!account) {
      return res.redirect('/login');
    }
    res.locals.pageTitle = '401 Unauthorised';
    return res.status(401).render('errors/401');
  }

  app.get('/login', function(req, res) {
    if (deps.currentAccount(req)) {
      return res.redirect('/');
    }
    res.locals.pageTitle = 'Sign in';
    res.render('pages/login');
  });

  app.get('/account-request', function(req, res) {
    res.locals.pageTitle = 'Request an account';
    res.render('pages/account-request');
  });

  app.post('/login-codes', async function(req, res) {
    const email = accounts.normalEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    try {
      const result = await accounts.requestCode(dbo, email);
      return res.status(202).json(result);
    } catch (error) {
      if (error.code === 'NO_MAIL') {
        return res.status(503).json({ error: 'Email is not configured' });
      }
      console.error(error);
      return res.status(500).json({ error: 'The code could not be sent' });
    }
  });

  app.post('/sessions', async function(req, res) {
    const email = accounts.normalEmail(req.body.email);
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(401).json({ error: 'That code is not valid' });
    }
    let account;
    try {
      account = await accounts.checkCode(dbo, email, code);
    } catch (error) {
      if (error.code === 'SCHOOL_EXPIRED') {
        return res.status(403).json({ error: error.message });
      }
      throw error;
    }
    if (!account) {
      return res.status(401).json({ error: 'That code is not valid' });
    }
    req.session.regenerate(function(err) {
      if (err) {
        return res.status(500).json({ error: 'Could not start the session' });
      }
      req.session.account = accounts.sessionAccount(account);
      req.session.save(function(saveErr) {
        if (saveErr) {
          return res.status(500).json({ error: 'Could not start the session' });
        }
        return res.status(201).json({ type: account.type });
      });
    });
  });

  app.delete('/sessions', function(req, res) {
    req.session.destroy(function() {
      res.status(204).send();
    });
  });

  app.post('/account-requests', async function(req, res) {
    const email = accounts.normalEmail(req.body.email);
    const requestedType = req.body.requestedType === 'teacher' ? 'teacher' : 'selfpaced';
    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 500) : '';
    if (!email) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (req.body.requestedType !== 'teacher' && req.body.requestedType !== 'selfpaced') {
      return res.status(400).json({ error: 'Choose teacher or self-paced' });
    }
    await accounts.requestAccount(dbo, email, requestedType, note);
    return res.status(202).json({
      message: 'If this email is new, an admin will review the request. You can sign in once it is approved.'
    });
  });

  app.get('/account-requests', adminOnly, async function(req, res) {
    if (!deps.wantsJson(req)) {
      return res.redirect('/accounts');
    }
    const pending = await dbo.getDb().collection('accounts').find({ status: 'pending' }).sort({ createdAt: 1 }).toArray();
    res.json(pending.map(accounts.publicAccount));
  });

  app.patch('/account-requests/:id', adminOnly, async function(req, res) {
    const decision = req.body.decision;
    const type = req.body.type === 'teacher' || req.body.type === 'selfpaced' || req.body.type === 'admin' ? req.body.type : null;
    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ error: 'Choose approve or reject' });
    }
    if (decision === 'approve' && !type) {
      return res.status(400).json({ error: 'Choose an account type' });
    }
    const result = await dbo.getDb().collection('accounts').updateOne(
      { _id: new ObjectId(req.params.id), status: 'pending' },
      {
        $set: {
          status: decision === 'approve' ? 'active' : 'disabled',
          type: decision === 'approve' ? type : 'selfpaced',
          decidedAt: new Date(),
          decidedBy: deps.currentAccount(req).email
        }
      }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json({ ok: true });
  });

  app.get('/accounts', adminOnly, async function(req, res) {
    if (!deps.wantsJson(req)) {
      res.locals.pageTitle = 'Accounts';
      return res.render('pages/accounts');
    }
    const rows = await dbo.getDb().collection('accounts').find({}).sort({ createdAt: -1 }).toArray();
    res.json(rows.map(accounts.publicAccount));
  });

  app.patch('/accounts/:id', adminOnly, async function(req, res) {
    const type = req.body.type;
    const status = req.body.status;
    const update = {};
    if (type === 'admin' || type === 'teacher' || type === 'selfpaced') {
      update.type = type;
    }
    if (status === 'active' || status === 'disabled' || status === 'pending') {
      update.status = status;
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Nothing to change' });
    }
    update.decidedAt = new Date();
    update.decidedBy = deps.currentAccount(req).email;
    const result = await dbo.getDb().collection('accounts').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: update }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ ok: true });
  });
}

module.exports = { register: register };
