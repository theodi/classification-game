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
var ObjectId = require('mongodb').ObjectID;

if (process.env.SSLKEY) {
  var privateKey  = fs.readFileSync(process.env.SSLKEY, 'utf8');
  var certificate = fs.readFileSync(process.env.SSLCERT, 'utf8');
  var credentials = {key: privateKey, cert: certificate};
}

app.set('view engine', 'ejs');

app.use(session({
  resave: false,
  saveUninitialized: true,
  secret: 'SECRET'
}));

app.use(express.urlencoded());
app.use(express.json());

//Put the user object in a global veriable so it can be accessed from templates
app.use(function(req, res, next) {
  try {
    res.locals.user = req.session.passport.user;
    next();
  } catch (error) {
    res.locals.user = req.session.user;
    next();
  }
});

/* Setup public directory
 * Everything in her does not require authentication */

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {
  if (req.session.passport) {
    res.redirect("/profile");
  } else {
    res.locals.pageTitle ="ODI Template (NodeJS + Express + OAuth)";
    res.render('pages/auth');
  }
});

/*  PASSPORT SETUP  */

const passport = require('passport');

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');

app.post('/logout', function(req, res, next){
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

app.get('/error', (req, res) => res.send("error logging in"));

passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});

/*  Google AUTH  */

const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = "http://" + process.env.HOST + "/auth/google/callback";

passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
        return done(null, profile);
  }
));

app.get('/auth/google',
  passport.authenticate('google', { scope : ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/error' }),
  function(req, res) {
    //console.log(req.user);
    // Successful authentication, redirect success.
    // Redirects to the profile page, CHANGE THIS to redirect to another page, e.g. a tool that is protected
    res.redirect('/profile');
  });


/* Setup function to handle authentications */

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated())
    return next();
  else
    unauthorised(res);
}

function unauthorised(res) {
  res.locals.pageTitle ="401 Unauthorised";
  return res.status(401).render("errors/401");
}

function badRequest(res,start,end) {
  res.locals.pageTitle ="400 Bad Request";
  return res.status(400).render("errors/400",{start: start, end: end});
}

function renderGame(req,res,data) {
  var sessionId = data._id;
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Leaderboards')
    .findOne({"_id": new ObjectId(data.leaderboardId)},function(err,data2) {
      var chosenSet = data2.cardset[Math.floor(Math.random() * data2.cardset.length)];

      /*
      delete data["leaderboardId"];
      data.leaderboard = data2;
      res.set('Content-Type', 'application/json');
      res.send(JSON.stringify(data, null, 4));
      */

      res.render('pages/game',{session: sessionId, leaderboardId: data.leaderboardId, set: chosenSet, resultId: null, isTutor: data.isTutor});
  });
}

/* Setup private directory, everything in here requires authentication */

app.use('/private', ensureAuthenticated);
app.use('/private', express.static(__dirname + '/private'));

/**
 * Methods to allow users to play the game
 *
 */

app.get('/game/:id', function(req,res) {
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Sessions')
    .findOne({"_id": new ObjectId(req.params.id)},function(err,data) {
      console.log(data);
      if (req.isAuthenticated()) {
        data.isTutor = true;
        renderGame(req,res,data);
      } else {
        if (data.startTime) {
          var now = new Date().getTime();
          var start = new Date(data.startTime).getTime();
          if (now >= start) {
            if (data.endTime) {
              var end = new Date(data.endTime).getTime();
              if (now <= end) {
                renderGame(req,res,data);
              } else {
                badRequest(res,data.startTime,data.endTime);
              }
            } else {
              renderGame(req,res,data);
            }
          } else {
            badRequest(res,data.startTime,data.endTime);
          }
        } else {
          renderGame(req,res,data);
        }
      }
    });
});

app.get('/browse', function(req,res) {
  res.render('pages/browse');
});

/**
 * Methods to get leaderboard results
 */

app.get('/leaderboard/all/results', function(req, res) {
  type = req.headers.accept.split(',')[0];
  if (req.isAuthenticated()) {
     if (type=="application/json") {
      var dbConnect = dbo.getDb();
      dbConnect
        .collection("Results")
        .find()
        .sort( {"score": -1} )
        .toArray(function(err,output) {
          res.set('Content-Type', 'application/json');
          res.send(JSON.stringify(output, null, 4));
        });
     } else {
      res.render('pages/leaderboard');
     }
  } else {
    if (type=="application/json") {
      var dbConnect = dbo.getDb();
      dbConnect
        .collection("Results")
        .find()
        .project({"id":1,"score":1,"_id":0,"confidences":1,"result":1,"vsHybrid":1,"vsMachine":1,"attempt":1})
        .sort( {"score": -1} )
        .toArray(function(err,output) {
          res.set('Content-Type', 'application/json');
          res.send(JSON.stringify(output, null, 4));
        });
    } else {
      res.locals.pageTitle ="Leaderboard";
      res.render('pages/leaderboard');
    }
  }
});

app.get('/leaderboard/:id/results', function(req, res) {
  res.locals.pageTitle ="Leaderboard for " + req.params.id;
  res.locals.id = req.params.id;
  type = req.headers.accept.split(',')[0];
  if (req.isAuthenticated()) {
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
  } else {
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
            .project({"id":1,"score":1,"attempt":1,"_id":0})
            .sort( {"score": -1} )
            .toArray(function(err,output) {
              res.set('Content-Type', 'application/json');
              res.send(JSON.stringify(output, null, 4));
            });
        });
    } else {
      res.locals.pageTitle ="401 Unauthorised";
      return res.status(401).render("errors/401");
    }
  }
});

app.get('/leaderboard/:id/:sessionId/results', function(req, res) {
  type = req.headers.accept.split(',')[0];
   if (!req.isAuthenticated()) {
    if (type=="application/json") {
      var dbConnect = dbo.getDb();
      dbConnect
        .collection('Results')
        .find({"sessionId" : req.params.sessionId})
        .project({"id":1,"playerName": 1,"attempt":1,"score":1,"_id":0})
        .sort( {"score": -1} )
        .toArray(function(err,data) {
          res.set('Content-Type', 'application/json');
          res.send(JSON.stringify(data, null, 4));
        });
    } else {
      res.locals.pageTitle ="401 Unauthorised";
      return res.status(401).render("errors/401");
    }
  } else {
    if (type=="application/json") {
      var dbConnect = dbo.getDb();
      dbConnect
        .collection('Results')
        .find({"sessionId" : req.params.sessionId})
        .sort( {"score": -1} )
        .toArray(function(err,data) {
          res.set('Content-Type', 'application/json');
          res.send(JSON.stringify(data, null, 4));
        });
    } else {
      res.locals.pageTitle ="View single session leaderboard";
      res.locals.id = req.params.id;
      res.locals.sessionId = req.params.sessionId;
      res.render('pages/session/view', {})
    }
  }
});

app.get('/result/:resultId', function(req, res) {
  if (!req.isAuthenticated()) {
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
  if (!req.isAuthenticated()) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  } else {
    var dbConnect = dbo.getDb();
    dbConnect
      .collection('Results')
      .findOne({"id" : req.params.resultId}, function(err,data) {
        dbConnect
          .collection('Sessions')
          .findOne({"_id": new ObjectId(data.sessionId)},function(err,lbdata) {
            res.render('pages/game',{session: data.sessionId, leaderboardId: lbdata.leaderboardId, set: data.cardSet, resultId: req.params.resultId,  isTutor: true});
          });
      });
  }
});

app.post('/result', function(req, res) {
  if (!req.body.score) {
    return res.status(400).send("Result not accepted");
  }
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Results')
    .updateOne({"id":req.body.id},{ $set: req.body},{upsert:true},
    function(err,result) {
      if (err) {
        return res.status(500).send("Result not accepted");
      }
      return res.status(201).send("Result accepted");
    });
});

/**
 * Methods to crete, view and edit leaderboards
 *
 */

app.get('/leaderboard/create', function(req, res) {
  if (!req.isAuthenticated()) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  }
  res.locals.pageTitle ="Create leaderboard";
  res.render('pages/leaderboard/create', {})
});

app.get('/leaderboard/:id/edit', function(req, res) {
  if (!req.isAuthenticated()) {
    res.locals.pageTitle ="401 Unauthorised";
    return res.status(401).render("errors/401");
  }
  res.locals.pageTitle ="Edit leaderboard";
  res.locals.id = req.params.id;
  res.render('pages/leaderboard/edit', {})
});

app.get('/leaderboards', function(req, res) {
  if (!req.isAuthenticated()) {
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
  if (req.isAuthenticated()) {
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
    res.render('pages/leaderboard/view', {})
  }
});

app.post('/leaderboard', function(req, res) {
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Leaderboards')
    .insertOne(req.body,
    function(err,result) {
      var msg = "Leaderboard inserted";
      if (err) {
        var msg = "Error inserting leaderboard";
      }
      res.locals.pageTitle = "Dashboards";
      res.render('pages/leaderboard/list', { msg: msg });
    });
});

app.post('/leaderboard/:id', function(req, res) {
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
  if (!req.isAuthenticated()) {
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
  res.locals.pageTitle ="Create session for leaderboard";
  res.locals.id = req.params.id;
  res.render('pages/session/create', {})
});

app.post('/leaderboard/:id/createSession', function(req, res) {
  var dbConnect = dbo.getDb();
  var data = req.body;
  data.leaderboardId = req.params.id;
  res.locals.id = req.params.id;
  dbConnect
    .collection('Sessions')
    .insertOne(data,
    function(err,result) {
      var msg = "Session created";
      if (err) {
        var msg = "Error creating session";
      }
      res.redirect("/leaderboard/"+ req.params.id + "/sessions");
    });
});

app.get('/leaderboard/:id/:sessionId', function(req, res) {
  res.locals.pageTitle ="Leaderboard for session " + req.params.sessionId;
  res.locals.id = req.params.id;
  res.locals.sessionId = req.params.sessionId;
  if (req.isAuthenticated()) {
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
    res.render('pages/session/view', {})
  }
});

app.delete('/leaderboard/:id/:sessionId', function(req, res) {
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

app.get('/profile', function(req, res) {
  res.locals.pageTitle ="Profile page";
  res.render('pages/profile')
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
