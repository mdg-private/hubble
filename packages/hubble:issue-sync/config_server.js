// -------------------
// MONGO CONFIGURATION
// -------------------

(function () {
  var driver;
  if (Meteor.settings.mongo) {
    driver = new MongoInternals.RemoteCollectionDriver(
      Meteor.settings.mongo.mongoUrl, {
        oplogUrl: Meteor.settings.mongo.oplogUrl
      }
    );
  } else {
    driver = MongoInternals.defaultRemoteCollectionDriver();
  }

  P.newCollection = function (name) {
    return new Mongo.Collection(name, { _driver: driver });
  };
})();


// ----------------
// GITHUB API SETUP
// ----------------

var githubModule = Npm.require('github');
var githubError = Npm.require('github/error');

P.github = new githubModule({
  version: '3.0.0',
  debug: !!process.env.GITHUB_API_DEBUG,
  headers: {
    "user-agent": "githubble.meteor.com"
  }
});

(function () {
  // This is a "personal access token" with NO SCOPES from
  // https://github.com/settings/applications.  When running locally,
  // create one through that interface (BUT UNCHECK ALL THE SCOPE BOXES)
  // and set it in $GITHUB_TOKEN. When running in production, we'll
  // share one that's in a settings file in lastpass.
  var token = Meteor.settings.githubToken || process.env.GITHUB_TOKEN;
  if (token) {
    P.github.authenticate({
      type: 'token',
      token: token
    });
  }
})();

// For some reason, the errors from the github module don't show up well.
var fixGithubError = function (e) {
  if (! (e instanceof githubError.HttpError))
    return e;
  // note that e.message is a string with JSON, from github
  return new Error(e.message);
};

// All callbacks passed to the GitHub API module should be passed through this,
// which Fiberizes them and fixes some errors to work better.
P.githubify = function (callback) {
  return Meteor.bindEnvironment(function (err, result) {
    if (err) {
      callback(fixGithubError(err));
    } else {
      callback(null, result);
    }
  });
};

// --------------
// WEBHOOK CONFIG
// --------------

var githubWebhookHandler = Npm.require('github-webhook-handler');

// The secret is a random string that you generate (eg, `openssl rand -hex 20`)
// and set when you set up the webhook. Always set it in production (via
// settings in lastpass), and generally set it while testing too --- otherwise
// random people on the internet can insert stuff into your database!
P.webhook = githubWebhookHandler({
  secret: (Meteor.settings.githubWebhookSecret ||
           process.env.GITHUB_WEBHOOK_SECRET)
});

WebApp.connectHandlers.use('/webhook', Meteor.bindEnvironment(function (req, res, next) {
  if (req.method.toLowerCase() !== 'post') {
    next();
    return;
  }

  P.webhook(req, res);
}));
