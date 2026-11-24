//Loads the config fomr config.env to process.env (turn off prior to deployment)
require("dotenv").config({ path: "./config.env" });
// index.js

/*  EXPRESS */

const express = require('express');
const app = express();
const session = require('express-session');
const fs = require('fs');
const http = require('http');
const https = require('https');
const dbo = require("./db/conn");
const cors = require('cors');
var ObjectId = require('mongodb').ObjectID;

app.use(cors());


if (process.env.SSLKEY) {
  var privateKey  = fs.readFileSync(process.env.SSLKEY, 'utf8');
  var certificate = fs.readFileSync(process.env.SSLCERT, 'utf8');
  var credentials = {key: privateKey, cert: certificate};
}

app.set('view engine', 'ejs');

app.use(session({
  resave: false,
  saveUninitialized: false,
  secret: process.env.SESSION_SECRET || 'development-only-secret',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const accounts = require('./lib/accounts');
const schools = require('./lib/schools');
const access = require('./routes/access');
const schoolRoutes = require('./routes/schools');

function currentAccount(req) {
  return req.session && req.session.account;
}

function isTeacher(req) {
  const account = currentAccount(req);
  return account && (account.type === 'teacher' || account.type === 'admin');
}

function wantsJson(req) {
  const accept = (req.headers.accept || '').split(',')[0];
  return accept === 'application/json';
}

app.use(function(req, res, next) {
  res.locals.user = currentAccount(req) || null;
  res.locals.pageLink = req.path;
  next();
});

app.use(express.static(__dirname + '/public'));

function ensureAuthenticated(req, res, next) {
  if (currentAccount(req)) {
    return next();
  }
  return unauthorised(res);
}

function unauthorised(res) {
  res.locals.pageTitle = "401 Unauthorised";
  return res.status(401).render("errors/401");
}

function schoolExpired(res) {
  res.locals.pageTitle = 'School access expired';
  return res.status(403).render('pages/school/expired');
}

async function loadUsableSchool(account, schoolId) {
  if (!schoolId) {
    return null;
  }
  const school = await schools.findById(dbo, schoolId);
  if (!school || !schools.canUseSchool(account, school)) {
    return null;
  }
  return school;
}

function gameView(options) {
  return {
    session: options.sessionId,
    leaderboardId: options.leaderboardId || options.schoolId || '',
    set: 1,
    evalSetId: options.evalSetId || '',
    resultId: options.resultId || '',
    isTutor: !!options.isTutor,
    requireEvaluationPin: !!options.requireEvaluationPin,
    entryMode: !!options.entryMode,
    replayOnly: !!options.replayOnly,
    teamName: options.teamName || ''
  };
}

function renderGame(req, res, data, options) {
  options = options || {};
  const entryMode = !!options.entryMode;
  const isTutor = !!options.isTutor;
  res.render('pages/game', gameView({
    sessionId: data._id,
    leaderboardId: schools.sessionSchoolId(data),
    evalSetId: data.evalSetId || '',
    isTutor: isTutor,
    requireEvaluationPin: false,
    entryMode: entryMode,
    teamName: options.teamName || ''
  }));
}

async function sessionSchoolActive(sessionDoc) {
  const schoolId = schools.sessionSchoolId(sessionDoc);
  if (!schoolId) {
    return null;
  }
  const school = await schools.findById(dbo, schoolId);
  if (!school || schools.isSchoolExpired(school)) {
    return null;
  }
  return school;
}

app.get('/', async function(req, res) {
  const account = currentAccount(req);
  if (!account) {
    return res.redirect('/login');
  }
  if (account.type === 'admin') {
    return res.redirect('/schools');
  }
  if (account.type === 'teacher') {
    if (account.schoolId) {
      const school = await schools.findById(dbo, account.schoolId);
      if (!school || schools.isSchoolExpired(school)) {
        return schoolExpired(res);
      }
      return res.redirect('/schools/' + account.schoolId);
    }
    return res.redirect('/schools');
  }
  if (account.schoolId) {
    const school = await schools.findById(dbo, account.schoolId);
    if (!school || schools.isSchoolExpired(school)) {
      return schoolExpired(res);
    }
  }
  return res.redirect('/play');
});

access.register(app, { dbo: dbo, ObjectId: ObjectId, currentAccount: currentAccount, wantsJson: wantsJson });
schoolRoutes.register(app, { dbo: dbo, ObjectId: ObjectId, currentAccount: currentAccount, wantsJson: wantsJson });

app.use('/private', ensureAuthenticated);
app.use('/private', express.static(__dirname + '/private'));

/**
 * Methods to allow users to play the game
 *
 */

app.get('/play', async function(req, res) {
  const account = currentAccount(req);
  if (!account) {
    return res.redirect('/login');
  }
  if (account.schoolId && account.type !== 'admin') {
    const school = await schools.findById(dbo, account.schoolId);
    if (!school || schools.isSchoolExpired(school)) {
      return schoolExpired(res);
    }
  }
  res.render('pages/game', gameView({
    sessionId: 'selfpaced',
    leaderboardId: '',
    evalSetId: '',
    isTutor: false,
    entryMode: false,
    replayOnly: false
  }));
});

app.get('/game/:id', async function(req, res) {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).render('errors/404');
  }
  const entryMode = req.query.entry === '1';
  if (entryMode && !isTeacher(req)) {
    return res.redirect('/login');
  }
  try {
    const data = await dbo.getDb().collection('Sessions').findOne({ _id: new ObjectId(req.params.id) });
    if (!data) {
      return res.status(404).render('errors/404');
    }
    const school = await sessionSchoolActive(data);
    if (!school) {
      return schoolExpired(res);
    }
    if (entryMode) {
      const account = currentAccount(req);
      if (!schools.canUseSchool(account, school)) {
        return unauthorised(res);
      }
    }
    return renderGame(req, res, data, {
      entryMode: entryMode,
      isTutor: isTeacher(req),
      teamName: req.query.team || ''
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send('Could not load game');
  }
});

app.get('/game/:id/result', async function(req, res) {
  if (!isTeacher(req)) {
    return res.status(401).json({ error: 'Sign in as a teacher required' });
  }
  const playerName = req.query.userId;
  if (!req.query.userId) {
    res.locals.pageTitle = '400 Bad request';
    return res.status(400).render('errors/400');
  }
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const sessionDoc = await dbo.getDb().collection('Sessions').findOne({ _id: new ObjectId(req.params.id) });
  if (!sessionDoc) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const school = await loadUsableSchool(currentAccount(req), schools.sessionSchoolId(sessionDoc));
  if (!school) {
    return res.status(403).json({ error: schools.EXPIRED_MESSAGE });
  }
  const data = await dbo.getDb().collection('Results').findOne({
    sessionId: req.params.id,
    attempt: 1,
    playerName: playerName
  });
  return res.json(data);
});

app.get('/browse', function(req, res) {
  res.render('pages/browse');
});

app.get('/schools/:id/public-results', async function(req, res) {
  if (!isTeacher(req)) {
    return res.status(401).json({ error: 'Sign in as a teacher required' });
  }
  const school = await loadUsableSchool(currentAccount(req), req.params.id);
  if (!school) {
    return res.status(403).json({ error: schools.EXPIRED_MESSAGE });
  }
  const sessions = await dbo.getDb().collection('Sessions').find({
    $or: [{ schoolId: String(req.params.id) }, { leaderboardId: String(req.params.id) }],
    hidePublic: 'off'
  }).toArray();
  const sessionIds = sessions.map(function(row) { return String(row._id); });
  const results = await dbo.getDb().collection('Results').find({
    sessionId: { $in: sessionIds }
  }).project({
    id: 1, score: 1, _id: 0, confidences: 1, result: 1, vsHybrid: 1, vsMachine: 1, attempt: 1, playerName: 1
  }).sort({ score: -1 }).toArray();
  return res.json(results);
});

/* Legacy leaderboard URLs → schools */
app.get('/leaderboards', function(req, res) {
  return res.redirect('/schools');
});
app.get('/leaderboard/create', function(req, res) {
  return res.redirect('/schools/new');
});
app.get('/leaderboard/all/results', function(req, res) {
  const account = currentAccount(req);
  if (account && account.schoolId) {
    return res.redirect(307, '/schools/' + account.schoolId + '/public-results');
  }
  return res.status(404).json({ error: 'No school context' });
});
app.get('/leaderboard/:id/results', function(req, res) {
  return res.redirect(307, '/schools/' + req.params.id + '/results');
});
app.get('/leaderboard/:id/:sessionId/results', function(req, res) {
  return res.redirect(307, '/schools/' + req.params.id + '/sessions/' + req.params.sessionId + '/results');
});
app.get('/leaderboard/:id/sessions', function(req, res) {
  return res.redirect('/schools/' + req.params.id + '/sessions');
});
app.get('/leaderboard/:id/session/create', function(req, res) {
  return res.redirect('/schools/' + req.params.id + '/sessions/new');
});
app.get('/leaderboard/:id/:sessionId/board', function(req, res) {
  return res.redirect('/schools/' + req.params.id + '/sessions/' + req.params.sessionId + '/board');
});
app.get('/leaderboard/:id/:sessionId/edit', function(req, res) {
  return res.redirect('/schools/' + req.params.id + '/sessions/' + req.params.sessionId + '/edit');
});
app.get('/leaderboard/:id/:sessionId', function(req, res) {
  return res.redirect('/schools/' + req.params.id + '/sessions/' + req.params.sessionId);
});
app.get('/leaderboard/:id/edit', function(req, res) {
  return res.redirect('/schools/' + req.params.id + '/edit');
});
app.get('/leaderboard/:id', function(req, res) {
  return res.redirect('/schools/' + req.params.id);
});

app.get('/result/:resultId', function(req, res) {
  if (!isTeacher(req)) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  } else {
    var dbConnect = dbo.getDb();
    dbConnect
      .collection('Results')
      .findOne({"id" : req.params.resultId}, function(err,data) {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 4));
      });
  }
});

app.get('/result/:resultId/tree', function(req, res) {
  if (!isTeacher(req)) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  } else {
    var dbConnect = dbo.getDb();
    dbConnect
      .collection('Results')
      .findOne({"id" : req.params.resultId}, function(err,data) {
        if (!data) {
          res.locals.pageTitle = "404 Not Found";
          return res.status(404).render("errors/404");
        }
        function renderReplay(lbdata) {
          res.render('pages/game', gameView({
            sessionId: data.sessionId,
            leaderboardId: lbdata ? schools.sessionSchoolId(lbdata) : '',
            evalSetId: data.evalSetId || (lbdata && lbdata.evalSetId) || '',
            resultId: req.params.resultId,
            isTutor: true,
            requireEvaluationPin: false,
            entryMode: false,
            replayOnly: true,
            teamName: data.playerName || ''
          }));
        }
        if (!data.sessionId || !ObjectId.isValid(data.sessionId)) {
          return renderReplay(null);
        }
        dbConnect
          .collection('Sessions')
          .findOne({"_id": new ObjectId(data.sessionId)}, function(err, lbdata) {
            renderReplay(lbdata);
          });
      });
  }
});

app.get('/evaluationPin', function(req, res) {
  if (!isTeacher(req)) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  } else {
    res.locals.pageTitle ="Evaluation pin";
    res.render('pages/pin', {})
  }
});


app.post('/result', async function(req, res) {
  const account = currentAccount(req);
  const body = req.body || {};
  if (typeof body.score !== 'number' || !body.playerName || !body.tree) {
    return res.status(400).send("Result not accepted");
  }
  const selfPaced = body.sessionId === 'selfpaced';
  if (selfPaced) {
    if (!account) {
      return res.status(401).send("Sign in required");
    }
    if (account.schoolId && account.type !== 'admin') {
      const school = await schools.findById(dbo, account.schoolId);
      if (!school || schools.isSchoolExpired(school)) {
        return res.status(403).send(schools.EXPIRED_MESSAGE);
      }
    }
  } else {
    if (!ObjectId.isValid(String(body.sessionId || ''))) {
      return res.status(403).send("Result not accepted");
    }
    const sessionDoc = await dbo.getDb().collection('Sessions').findOne({ _id: new ObjectId(body.sessionId) });
    if (!sessionDoc) {
      return res.status(403).send("Result not accepted");
    }
    const school = await sessionSchoolActive(sessionDoc);
    if (!school) {
      return res.status(403).send(schools.EXPIRED_MESSAGE);
    }
  }
  const result = {
    id: String(body.id || ''),
    playerName: String(body.playerName).slice(0, 80),
    date: Date.now(),
    cardSet: 'group1',
    sessionId: selfPaced ? 'selfpaced' : String(body.sessionId || ''),
    evalSetId: body.evalSetId || null,
    tree: body.tree,
    confidences: body.confidences || {},
    result: body.result || {},
    score: body.score,
    vsHybrid: body.vsHybrid || {},
    vsMachine: body.vsMachine || {},
    attempt: Number(body.attempt) || 1,
    writtenConfidence: body.writtenConfidence === null || body.writtenConfidence === undefined ? null : Number(body.writtenConfidence),
    accountId: account ? String(account.id) : null
  };
  if (!result.id || result.id.length > 80) {
    return res.status(400).send("Result not accepted");
  }
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Results')
    .updateOne({"id": result.id}, { $set: result }, { upsert: true },
    function(err) {
      if (err) {
        return res.status(500).send("Result not accepted");
      }
      return res.status(201).json({ ok: true });
    });
});

app.get('/profile', function(req, res) {
  if (!currentAccount(req)) {
    return res.redirect('/login');
  }
  res.locals.pageTitle = 'Profile';
  res.render('pages/profile');
});

app.get('/help', function(req, res) {
  res.locals.pageTitle = 'Help';
  res.render('pages/help');
});

app.get('*', function(req, res) {
  res.locals.pageTitle = '404 Not Found';
  return res.status(404).render('errors/404');
});

dbo.connectToServer(function(err) {
  if (err) {
    console.error(err);
    process.exit();
  }

  schools.ensureIndexes(dbo).catch(function(error) {
    console.error(error);
  });
  accounts.ensureAdmin(dbo).catch(function(error) {
    console.error(error);
  });
  accounts.expireOldResults(dbo).catch(function(error) {
    console.error(error);
  });

  const port = process.env.PORT || 80;
  var httpServer = http.createServer(app);
  httpServer.listen(port, function() {
    console.log('Server is running on port: ' + port);
  });
  if (process.env.SSLKEY) {
    const securePort = process.env.SECUREPORT || 443;
    var httpsServer = https.createServer(credentials, app);
    httpsServer.listen(securePort, function() {
      console.log('Server is running on port: ' + securePort);
    });
  }
});
