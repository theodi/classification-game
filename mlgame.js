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
const access = require('./routes/access');

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
  next();
});

app.use(express.static(__dirname + '/public'));

function ensureAuthenticated(req, res, next) {
  if (currentAccount(req)) {
    return next();
  }
  return unauthorised(res);
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
  return unauthorised(res);
}

function unauthorised(res) {
  res.locals.pageTitle = "401 Unauthorised";
  return res.status(401).render("errors/401");
}

function badRequest(res, start, end) {
  res.locals.pageTitle = "400 Bad Request";
  return res.status(400).render("errors/400", { start: start, end: end });
}

const EVAL_SET_IDS = Array.from({ length: 20 }, function(_, index) {
  return 'E' + String(index + 1).padStart(2, '0');
});

function gameView(options) {
  return {
    session: options.sessionId,
    leaderboardId: options.leaderboardId || '',
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

function renderGame(req, res, data) {
  const entryMode = req.query.entry === '1';
  res.render('pages/game', gameView({
    sessionId: data._id,
    leaderboardId: data.leaderboardId,
    evalSetId: data.evalSetId || '',
    isTutor: true,
    requireEvaluationPin: false,
    entryMode: entryMode,
    teamName: req.query.team || ''
  }));
}

app.get('/', function(req, res) {
  const account = currentAccount(req);
  if (!account) {
    return res.redirect('/login');
  }
  if (account.type === 'admin') {
    return res.redirect('/accounts');
  }
  if (account.type === 'teacher') {
    return res.redirect('/leaderboards');
  }
  return res.redirect('/play');
});

access.register(app, { dbo: dbo, ObjectId: ObjectId, currentAccount: currentAccount, wantsJson: wantsJson });

app.use('/private', ensureAuthenticated);
app.use('/private', express.static(__dirname + '/private'));

/**
 * Methods to allow users to play the game
 *
 */

app.get('/play', function(req, res) {
  const account = currentAccount(req);
  if (!account) {
    return res.redirect('/login');
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

app.get('/game/:id', function(req, res) {
  if (!isTeacher(req)) {
    return res.redirect('/login');
  }
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Sessions')
    .findOne({"_id": new ObjectId(req.params.id)}, function(err, data) {
      if (!data) {
        return res.status(404).render('errors/404');
      }
      renderGame(req, res, data);
    });
});

app.get('/game/:id/result', function(req,res) {
  if (!isTeacher(req)) {
    return res.status(401).json({ error: 'Sign in as a teacher required' });
  }
  const playerName = req.query.userId;
  if (!req.query.userId) {
    res.locals.pageTitle ="400 Bad request";
    return res.status(400).render("errors/400");
  } else {
    var dbConnect = dbo.getDb();
    dbConnect
      .collection('Results')
      .findOne({"sessionId" : req.params.id, "attempt" : 1, "playerName" : playerName}, function(err,data) {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 4));
      });
  }
});

app.get('/browse', function(req,res) {
  res.render('pages/browse');
});

/**
 * Methods to get leaderboard results
 */

app.get('/leaderboard/all/results', async function(req, res) {
  type = req.headers.accept.split(',')[0];

  if (isTeacher(req)) {
    if (type == "application/json") {
      try {
        const dbConnect = dbo.getDb();

        // Fetch sessions with hidePublic set to false
        const sessions = await dbConnect
          .collection("Sessions")
          .find({ hidePublic: "off" })
          .toArray();

        // Extract session IDs
        const sessionIds = sessions.map(session => session._id);
        const query = { sessionId: { $in: sessionIds.map(id => id.toString()) } };
        const results = await dbConnect
          .collection("Results")
          .find(query)
          .project({"id":1,"score":1,"_id":0,"confidences":1,"result":1,"vsHybrid":1,"vsMachine":1,"attempt":1})
          .sort({"score": -1})
          .toArray();

        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(results, null, 4));
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    } else {
      res.render('pages/leaderboard');
    }
  } else if (type == "application/json") {
    return res.status(401).json({ error: 'Sign in as a teacher required' });
  } else {
    return res.redirect('/login');
  }
});


app.get('/leaderboard/:id/results', function(req, res) {
  res.locals.pageTitle ="Leaderboard for " + req.params.id;
  res.locals.id = req.params.id;
  type = req.headers.accept.split(',')[0];
  if (isTeacher(req)) {
     if (type=="application/json") {
      var dbConnect = dbo.getDb();
      dbConnect
        .collection('Sessions')
        .find({"leaderboardId" : req.params.id})
        .toArray(function(err,data) {
          var sessions = [];
          for(i=0;i<data.length;i++) {
            sessions.push(data[i]._id.toString());
          }
          dbConnect
            .collection("Results")
            .find({ sessionId: { $in: sessions} } )
            .sort( {"score": -1} )
            .toArray(function(err,output) {
              res.set('Content-Type', 'application/json');
              res.send(JSON.stringify(output, null, 4));
            });
        });
     } else {
      res.render('pages/leaderboard/view', {})
     }
  } else if (type=="application/json") {
    return res.status(401).json({ error: 'Sign in as a teacher required' });
  } else {
    return res.redirect('/login');
  }
});

app.get('/leaderboard/:id/:sessionId/results', function(req, res) {
  if (!isTeacher(req)) {
    if (wantsJson(req)) {
      return res.status(401).json({ error: 'Sign in as a teacher required' });
    }
    res.locals.pageTitle = "401 Unauthorised";
    return res.status(401).render("errors/401");
  }
  if (wantsJson(req)) {
    var dbConnect = dbo.getDb();
    dbConnect
      .collection('Results')
      .find({"sessionId" : req.params.sessionId})
      .sort( {"score": -1} )
      .toArray(function(err, data) {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 4));
      });
  } else {
    res.locals.pageTitle = "View single session leaderboard";
    res.locals.id = req.params.id;
    res.locals.sessionId = req.params.sessionId;
    res.render('pages/session/view', {});
  }
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
            leaderboardId: lbdata ? lbdata.leaderboardId : '',
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
  if (!account) {
    return res.status(401).send("Sign in required");
  }
  const body = req.body || {};
  if (typeof body.score !== 'number' || !body.playerName || !body.tree) {
    return res.status(400).send("Result not accepted");
  }
  const selfPaced = body.sessionId === 'selfpaced';
  if (!selfPaced && !isTeacher(req)) {
    return res.status(403).send("Result not accepted");
  }
  if (!selfPaced) {
    if (!ObjectId.isValid(String(body.sessionId || ''))) {
      return res.status(403).send("Result not accepted");
    }
    const sessionDoc = await dbo.getDb().collection('Sessions').findOne({ _id: new ObjectId(body.sessionId) });
    if (!sessionDoc) {
      return res.status(403).send("Result not accepted");
    }
    if (sessionDoc.createdBy && sessionDoc.createdBy !== String(account.id) && account.type !== 'admin') {
      return res.status(403).send("Result not accepted");
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
    accountId: String(account.id)
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

/**
 * Methods to crete, view and edit leaderboards
 *
 */

app.get('/leaderboard/create', function(req, res) {
  if (!isTeacher(req)) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  }
  res.locals.pageTitle ="Create leaderboard";
  res.render('pages/leaderboard/create', {})
});

app.get('/leaderboard/:id/edit', function(req, res) {
  if (!isTeacher(req)) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  }
  res.locals.pageTitle ="Edit leaderboard";
  res.locals.id = req.params.id;
  res.render('pages/leaderboard/edit', {})
});

app.get('/leaderboards', function(req, res) {
  if (!isTeacher(req)) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  }
  type = req.headers.accept.split(',')[0];
  if (type=="application/json") {
    var dbConnect = dbo.getDb();
    dbConnect
      .collection('Leaderboards')
      .find({})
      .toArray(function(err,data) {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 4));
      });
  } else {
    res.locals.pageTitle ="View leaderboards";
    res.render('pages/leaderboard/list', {msg: ""})
  }
});

app.get('/leaderboard/:id', function(req, res) {
  res.locals.pageTitle ="Leaderboard for " + req.params.id;
  res.locals.id = req.params.id;
  if (isTeacher(req)) {
     type = req.headers.accept.split(',')[0];
     if (type=="application/json") {
      var dbConnect = dbo.getDb();
      dbConnect
      .collection('Leaderboards')
      .findOne({"_id": new ObjectId(req.params.id)},function(err,data) {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 4));
      });
     } else {
      res.render('pages/leaderboard/view', {})
     }
  } else {
    return res.redirect('/login');
  }
});

app.post('/leaderboard', function(req, res) {
  if (!isTeacher(req)) {
    return res.redirect('/login');
  }
  var dbConnect = dbo.getDb();
  var data = {
    name: req.body.name,
    type: req.body.type,
    cardset: ['1'],
    createdBy: currentAccount(req).id
  };
  dbConnect
    .collection('Leaderboards')
    .insertOne(data,
    function(err, result) {
      var msg = err ? "Error inserting leaderboard" : "Leaderboard inserted";
      res.locals.pageTitle = "Dashboards";
      res.render('pages/leaderboard/list', { msg: msg });
    });
});

app.post('/leaderboard/:id', function(req, res) {
  if (!isTeacher(req)) {
    return res.redirect('/login');
  }
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Leaderboards')
    .updateOne({"_id":new ObjectId(req.params.id)},{ $set: req.body},{upset:false},
    function(err,result) {
      var msg = "Leaderboard updated";
      if (err) {
        var msg = "Error updating leaderboard";
      }
      res.redirect("/leaderboards");
    });
});

app.delete('/leaderboard/:id', function(req, res) {
  if (!isTeacher(req)) {
    return res.redirect('/login');
  }
  res.locals.id = req.params.id;
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Leaderboards')
    .deleteOne({"_id": new ObjectId(req.params.id)},
    function(err,result) {
      var msg = "Leaderboard deleted";
      if (err) {
        var msg = "Error deleting leaderboard";
      }
      res.locals.pageTitle = "Sessions";
      res.render('pages/session/list', { msg: msg });
    });
  });

/**
 * Methods to crete, view and edit sessions
 *
 */

app.get('/leaderboard/:id/sessions', function(req, res) {
  if (!isTeacher(req)) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  }
  type = req.headers.accept.split(',')[0];
  if (type=="application/json") {
    var dbConnect = dbo.getDb();
    dbConnect
      .collection('Sessions')
      .find({"leaderboardId" : req.params.id})
      .toArray(function(err,data) {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 4));
      });
  } else {
    res.locals.pageTitle ="View sessions for leaderboard";
    res.locals.id = req.params.id;
    res.render('pages/session/list', {msg: ""})
  }
});

app.get('/leaderboard/:id/session/create', function(req, res) {
  if (!isTeacher(req)) {
    return res.redirect('/login');
  }
  res.locals.pageTitle = "Create session for leaderboard";
  res.locals.id = req.params.id;
  res.locals.evalSetIds = EVAL_SET_IDS;
  res.render('pages/session/create', {})
});

app.post('/leaderboard/:id/createSession', async function(req, res) {
  if (!isTeacher(req)) {
    return res.redirect('/login');
  }
  var dbConnect = dbo.getDb();
  var requested = req.body.evalSetId;
  var evalSetId = EVAL_SET_IDS.indexOf(requested) >= 0 ? requested : await accounts.nextEvalSetId(dbo, EVAL_SET_IDS);
  var data = {
    name: req.body.name,
    leaderboardId: req.params.id,
    tutorMode: req.body.tutorMode || 'off',
    startTime: req.body.startTime || '',
    endTime: req.body.endTime || '',
    hidePublic: req.body.hidePublic || 'off',
    evalSetId: evalSetId,
    packId: 'group1',
    createdBy: currentAccount(req).id
  };
  dbConnect
    .collection('Sessions')
    .insertOne(data, function(err) {
      res.redirect("/leaderboard/" + req.params.id + "/sessions");
    });
});

app.put('/leaderboard/:id/:sessionId', function(req, res) {
  if (!isTeacher(req)) {
    return res.status(401).json({ error: 'Sign in as a teacher required' });
  }
  var dbConnect = dbo.getDb();
  var data = req.body;

  // Extract the session ID from the URL parameters
  var sessionId = req.params.sessionId;

  // Update the session data
  dbConnect
    .collection('Sessions')
    .updateOne(
      { _id: ObjectId(sessionId) }, // Use ObjectId to convert sessionId to MongoDB ObjectId
      { $set: data },
      function(err, result) {
        if (err) {
          console.error('Error updating session:', err);
          res.status(500).json({ error: 'Internal Server Error' }); // Return a 500 error code to the front end
        } else {
          if (result.matchedCount === 0) {
            res.status(404).json({ error: 'Session not found' }); // Return a 404 error code if the session was not found
          } else {
            res.status(200).json({ message: 'Session updated' }); // Return a 200 success code to the front end
          }
        }
      }
    );
});

app.get('/leaderboard/:id/:sessionId', function(req, res) {
  res.locals.pageTitle ="Leaderboard for session " + req.params.sessionId;
  res.locals.id = req.params.id;
  res.locals.sessionId = req.params.sessionId;
  if (isTeacher(req)) {
     type = req.headers.accept.split(',')[0];
     if (type=="application/json") {
      var dbConnect = dbo.getDb();
      dbConnect
      .collection('Sessions')
      .findOne({"_id": new ObjectId(req.params.sessionId)},function(err,data) {
        res.set('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 4));
      });
     } else {
      res.render('pages/session/view', {})
     }
  } else {
    return res.redirect('/login');
  }
});

app.get('/leaderboard/:id/:sessionId/edit', function(req, res) {
  if (!isTeacher(req)) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  }
  res.locals.pageTitle ="Edit session";
  res.locals.id = req.params.id;
  res.locals.sessionId = req.params.sessionId;
  res.render('pages/session/edit', {})
});

app.delete('/leaderboard/:id/:sessionId', function(req, res) {
  if (!isTeacher(req)) {
    return res.redirect('/login');
  }
  res.locals.id = req.params.id;
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Sessions')
    .deleteOne({"leaderboardId": req.params.id, "_id": new ObjectId(req.params.sessionId)},
    function(err,result) {
      var msg = "Session deleted";
      if (err) {
        var msg = "Error deleting session";
      }
      res.locals.pageTitle = "Sessions";
      res.render('pages/session/list', { msg: msg });
    });
  });

/* Other methods */

app.get('/leaderboard/:id/:sessionId/board', function(req, res) {
  if (!isTeacher(req)) {
    return res.redirect('/login');
  }
  if (wantsJson(req)) {
    return res.redirect(307, '/leaderboard/' + req.params.id + '/' + req.params.sessionId + '/results');
  }
  res.locals.pageTitle = "Class board";
  res.locals.id = req.params.id;
  res.locals.sessionId = req.params.sessionId;
  res.render('pages/session/board', {});
});

app.get('/profile', function(req, res) {
  if (!currentAccount(req)) {
    return res.redirect('/login');
  }
  res.locals.pageTitle = "Profile page";
  res.render('pages/profile');
});

app.get('/help', function(req, res) {
  res.locals.pageTitle ="Video walkthrough";
  res.render('pages/help')
});

//Keep this at the END!

app.get('*', function(req, res){
  res.locals.pageTitle ="404 Not Found";
  return res.status(404).render("errors/404");
});

/* Run server */
dbo.connectToServer(function (err) {
  if (err) {
    console.error(err);
    process.exit();
  }

  accounts.ensureAdmin(dbo).catch(function(error) {
    console.error(error);
  });
  accounts.expireOldResults(dbo).catch(function(error) {
    console.error(error);
  });

  const port = process.env.PORT || 80;
  // start the Express server
  var httpServer = http.createServer(app);
  httpServer.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
  });
  if (process.env.SSLKEY) {
    const securePort = process.env.SECUREPORT || 443;
    var httpsServer = https.createServer(credentials,app);
    httpsServer.listen(securePort, () => {
      console.log(`Server is running on port: 443`);
    });
  }

});
