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

passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3080/auth/google/callback"
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

function renderPlay(req,res,data) {
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Leaderboards')
    .findOne({"_id": new ObjectId(data.leaderboardId)},function(err,data2) {
      delete data["leaderboardId"];
      data.leaderboard = data2;
      res.set('Content-Type', 'application/json');
      res.send(JSON.stringify(data, null, 4));
  });
}

/* Setup private directory, everything in here requires authentication */

app.use('/private', ensureAuthenticated);
app.use('/private', express.static(__dirname + '/private'));

/* Define all the pages */

/* Do not require login */

app.get('/leaderboard', function(req, res) {
  res.locals.pageTitle ="Leaderboard";
  res.render('pages/leaderboard')
});


app.get('/play/:id', function(req,res) {
  var dbConnect = dbo.getDb();
  dbConnect
    .collection('Sessions')
    .findOne({"_id": new ObjectId(req.params.id)},function(err,data) {
      if (data.startTime) {
        var now = new Date().getTime();
        var start = new Date(data.startTime).getTime();
        if (now >= start) {
          if (data.endTime) {
            var end = new Date(data.endTime).getTime();
            if (now <= end) {
              console.log("Valid both");
              renderPlay(req,res,data);
            } else {
              console.log("Too late");
              badRequest(res,data.startTime,data.endTime);
            }
          } else {
            console.log("Valid (no end)");
            renderPlay(req,res,data);
          }
        } else {
          console.log("Too early");
          badRequest(res,data.startTime,data.endTime);
        }
      } else {
        console.log("Valid (no start or end)");
        renderPlay(req,res,data);
      }
    });
});
/* Require login */

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
    res.render('pages/leaderboard', {})
  }
});

/* Require user to be logged in */

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

app.get('/leaderboard/:id/:sessionId', function(req, res) {
  res.locals.pageTitle ="View session for leaderboard";
  res.locals.id = req.params.id;
  res.locals.sessionId = req.params.sessionId;
  res.render('pages/session/view', {})
});

/* Post methods */

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

app.delete('/leaderboard/:id/:sessionId', function(req, res) {
  console.log('in delete method');
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

app.delete('/leaderboard/:id', function(req, res) {
  console.log('in delete method');
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