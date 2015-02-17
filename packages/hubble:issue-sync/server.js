var Future = Npm.require('fibers/future');
var githubModule = Npm.require('github');
var githubError = Npm.require('github/error');
var async = Npm.require('async');

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

// Usage:
//   if (! asyncCheck(v, p, cb)) return;
var asyncCheck = function (value, pattern, cb) {
  try {
    check(value, pattern);
  } catch (e) {
    if (! (e instanceof Match.Error))
      throw e;
    console.log("FAILED CHECK", value)
    cb(e);
    return false;
  }
  return true;
}

Issues = new Mongo.Collection('issues', { _driver: driver });
Issues._ensureIndex({
  repoOwner: 1,
  repoName: 1,
  'issueDocument.number': 1
}, { unique: true });
// XXX more indices?


// id eg 'meteor/meteor#comments'
// only relevant field is lastDate (String)
// XXX Turns out that this isn't actually helpful for issues (because
//     updated_at doesn't tell you about relabelings) but it is probably for
//     comments.
var SyncedTo = new Mongo.Collection('syncedTo', { _driver: driver });
var syncedToMongoId = function (repoOwner, repoName, which) {
  check(repoOwner, String);
  check(repoName, String);
  check(which, String);
  return repoOwner + '/' + repoName + '#' + which;
};

var github = new githubModule({
  version: '3.0.0',
  debug: !!process.env.GITHUB_API_DEBUG,
  headers: {
    "user-agent": "githubble.meteor.com"
  }
});

// For some reason, the errors from the github module don't show up well.
var fixGithubError = function (e) {
  if (! (e instanceof githubError.HttpError))
    return e;
  // note that e.message is a string with JSON, from github
  return new Error(e.message);
};

(function () {
  // This is a "personal access token" with NO SCOPES from
  // https://github.com/settings/applications.  When running locally,
  // create one through that interface (BUT UNCHECK ALL THE SCOPE BOXES)
  // and set it in $GITHUB_TOKEN. When running in production, we'll
  // share one that's in a settings file in lastpass.
  var token = Meteor.settings.githubToken || process.env.GITHUB_TOKEN;
  if (token) {
    github.authenticate({
      type: 'token',
      token: token
    });
  }
})();

var maybeNull = function (pattern) {
  return Match.OneOf(null, pattern);
};

var issueMongoId = function (repoOwner, repoName, number) {
  check(repoOwner, String);
  check(repoName, String);
  check(number, Match.Integer);
  return repoOwner + '/' + repoName + '#' + number;
};

var userResponseMatcher = Match.ObjectIncluding({
  login: String,
  id: Match.Integer,
  url: String,
  avatar_url: String,
  html_url: String
});

var issueResponseMatcher = Match.ObjectIncluding({
  id: Match.Integer,
  url: String,
  html_url: String,
  number: Match.Integer,
  state: Match.OneOf('open', 'closed'),
  title: String,
  body: String,
  user: userResponseMatcher,
  labels: [
    Match.ObjectIncluding({
      url: String,
      name: String,
      color: String
    })
  ],
  assignee: maybeNull(userResponseMatcher),
  comments: Match.Integer,
  milestone: maybeNull(Match.ObjectIncluding({
    url: String,
    number: Number,
    state: Match.OneOf('open', 'closed'),
    title: String,
    description: maybeNull(String)
  })),
  pull_request: Match.Optional({  // not maybeNull!
    url: String,
    diff_url: String,
    html_url: String,
    patch_url: String
  }),
  created_at: String,
  closed_at: maybeNull(String),
  updated_at: String
});

var userResponseToObject = function (userResponse) {
  check(userResponse, userResponseMatcher);
  return {
    login: userResponse.login,
    id: userResponse.id,
    avatarUrl: userResponse.avatar_url,
    url: userResponse.url,
    htmlUrl: userResponse.html_url
  };
};

var issueResponseToModifier = function (options) {
  check(options, {
    repoOwner: String,
    repoName: String,
    issueResponse: issueResponseMatcher
  });

  var i = options.issueResponse;

  return {
    $set: {
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      issueDocument: {
        id: i.id,
        url: i.url,
        htmlUrl: i.html_url,
        number: i.number,
        open: (i.state === 'open'),
        title: i.title,
        body: i.body,
        user: userResponseToObject(i.user),
        labels: _.map(i.labels, function (l) {
          return _.pick(l, 'url', 'name', 'color');
        }),
        hasProjectLabel: !!_.find(i.labels, function (l) {
          return /^Project:/.test(l.name);
        }),
        assignee: i.assignee ? userResponseToObject(i.assignee) : null,
        commentCount: i.comments,
        milestone: (
          i.milestone ? {
            url: i.milestone.url,
            number: i.milestone.number,
            open: (i.milestone.state === 'open'),
            title: i.milestone.title,
            description: i.milestone.description
          } : null),
        pullRequest: (
          i.pull_request ? {
            url: i.pull_request.url,
            diffUrl: i.pull_request.diff_url,
            htmlUrl: i.pull_request.html_url,
            patchUrl: i.pull_request.patch_url
          } : null),
        createdAt: new Date(i.created_at),
        closedAt: i.closed_at ? new Date(i.closed_at) : null,
        updatedAt: new Date(i.updated_at)
      }
    }
  };
};

var saveIssue = function (options, cb) {
  if (! asyncCheck(options, {
    repoOwner: String,
    repoName: String,
    issueResponse: issueResponseMatcher
  }, cb)) return;

  var id = issueMongoId(options.repoOwner,
                        options.repoName,
                        options.issueResponse.number);
  var mod = issueResponseToModifier(
    _.pick(options, 'repoOwner', 'repoName', 'issueResponse'));

  Issues.update(
    // Specifying _id explicitly means we avoid fake upsert, which is good
    // because minimongo doesn't do $max yet.
    id,
    mod,
    { upsert: true },
    cb
  );
};

var ISSUES_PER_PAGE = 100;

// Saves a page of issues.
var saveOnePageOfIssues = function (options, cb) {
  if (! asyncCheck(options, {
    repoOwner: String,
    repoName: String,
    issueResponses: [issueResponseMatcher]
  }, cb)) return;

  var issues = options.issueResponses;

  if (! issues.length) {
    throw Error("empty page?");
  }

  console.log("Saving " + issues.length + " issues for " +
              options.repoOwner + "/" + options.repoName + ": " +
              JSON.stringify(_.pluck(issues, 'number')));
  async.map(issues, function (issueResponse, cb) {
    saveIssue({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      issueResponse: issueResponse
    }, cb);
  }, cb);
};

var resyncOneIssue = function (options, cb) {
  if (! asyncCheck(options, {
    repoOwner: String,
    repoName: String,
    number: Match.Integer
  }, cb)) return;

  github.issues.getRepoIssue({
    user: options.repoOwner,
    repo: options.repoName,
    number: options.number
  }, Meteor.bindEnvironment(function (err, issue) {
    if (err) {
      cb(fixGithubError(err));
      return;
    }
    saveIssue({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      issueResponse: issue
    }, cb);
  }));
};

// Every so often, we resync all issues for a repo.  This is good for a few
// things:
//  - Filling in a newly added repo
//  - Adding things we made have missed if webhook events happened while we
//    were not deployed
// Ideally, we would just save a "last updated" timestamp and use the "get all
// repo issues sorted by updated_at since X" API. Unfortunately, label changes
// don't appear to change the updated_at timestamp, so they won't get detected
// by this.  Ah well.
var resyncAllIssues = function (options, cb) {
  if (! asyncCheck(options, {
    repoOwner: String,
    repoName: String
  }, cb)) return;

  console.log("Resyncing issues for " +
              options.repoOwner + "/" + options.repoName);

  var receivePageOfIssues = Meteor.bindEnvironment(function (err, issues) {
    if (err) {
      cb(fixGithubError(err));
      return;
    }
    if (! issues.length) {
      cb();
      return;
    }

    saveOnePageOfIssues({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      issueResponses: issues
    }, function (err) {
      if (err) {
        cb(err);
      } else if (github.hasNextPage(issues)) {
        github.getNextPage(issues, receivePageOfIssues);
      } else {
        cb();
      }
    });
  });

  github.issues.repoIssues({
    user: options.repoOwner,
    repo: options.repoName,
    per_page: ISSUES_PER_PAGE,
    state: 'all',
    sort: 'updated'   // get newest in first, just because that's useful
  }, receivePageOfIssues);
};


// Unfortunately can't get this from WebAppInternals.
var myPersonalConnect = Npm.require('connect');
WebApp.connectHandlers.use('/webhook', myPersonalConnect.json());
// Register this event on GitHub for issue and pull_request.
// XXX docs
WebApp.connectHandlers.use('/webhook/issues', Meteor.bindEnvironment(function (req, res, next) {
  if (req.method.toLowerCase() !== 'post') {
    next();
    return;
  }

  var respond = function (err) {
    if (err) {
      console.error("Error in issue webhook", err);
      res.writeHead(500);
      res.end();
      return;
    }
    res.writeHead(200);
    res.end();
  };

  // XXX check hash (eg just use the existing module for this)
  // XXX error checking (esp on repo owner/name)
  var issueResponse = null;
  if (req.body.pull_request) {
    // Unfortunately, the pull_request event inexplicably does not
    // contain labels, so we can't trust what we hear over the wire.
    resyncOneIssue({
      repoOwner: req.body.repository.owner.login,
      repoName: req.body.repository.name,
      number: req.body.pull_request.number
    }, respond);
    return;
  } else if (! req.body.issue) {
    respond(Error("Missing issue from issue webhook?"));
    return;
  }

  saveIssue({
    repoOwner: req.body.repository.owner.login,
    repoName: req.body.repository.name,
    issueResponse: req.body.issue
  }, respond);
}));

// XXX this is for testing, remove
Meteor.methods({
  resyncAllIssues: function (options) {
    var f = new Future;
    resyncAllIssues(options, f.resolver());
    return f.wait();
  }
});
