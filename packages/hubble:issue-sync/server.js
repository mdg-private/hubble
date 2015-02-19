var Future = Npm.require('fibers/future');
var githubModule = Npm.require('github');
var githubError = Npm.require('github/error');
var githubWebhookHandler = Npm.require('github-webhook-handler');
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
//   if (asyncCheck(v, p, cb)) return;
var asyncCheck = function (value, pattern, cb) {
  try {
    check(value, pattern);
  } catch (e) {
    if (! (e instanceof Match.Error))
      throw e;
    console.log("FAILED CHECK", value)
    cb(e);
    return true;
  }
  return false;
}

Issues = new Mongo.Collection('issues', { _driver: driver });
Issues._ensureIndex({
  repoOwner: 1,
  repoName: 1
});
// XXX more indices?


// id eg 'meteor/meteor#comments'
// only relevant field is lastDate (String)
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

var githubify = function (callback) {
  return Meteor.bindEnvironment(function (err, result) {
    if (err) {
      callback(fixGithubError(err));
    } else {
      callback(null, result);
    }
  });
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

var timestampMatcher = Match.Where(function (ts) {
  check(ts, String);
  return ts.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

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
  // closed_by does not appear at all in bulk issue lists, only in individual
  // issue gets. dunno why.  Also it is null if the closing user is a deleted
  // user.
  closed_by: Match.Optional(maybeNull(userResponseMatcher)),
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
  created_at: timestampMatcher,
  closed_at: maybeNull(timestampMatcher),
  updated_at: timestampMatcher
});

var commentResponseMatcher = Match.ObjectIncluding({
  id: Match.Integer,
  url: String,
  html_url: String,
  issue_url: String,  // we parse this but don't save it
  body: String,
  user: userResponseMatcher,
  created_at: timestampMatcher,
  updated_at: timestampMatcher
});

var repositoryResponseMatcher = Match.ObjectIncluding({
  owner: Match.ObjectIncluding({
    login: String
  }),
  name: String
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
        closedBy: i.closed_by ? userResponseToObject(i.closed_by) : null,
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

// With this key, comments in the comments map will be sorted in chronological
// order if you sort by key.
var commentKey = function (commentResponse) {
  return commentResponse.created_at + '!' + commentResponse.id;
};

var commentResponseToModifier = function (options) {
  check(options, {
    repoOwner: String,
    repoName: String,
    commentResponse: commentResponseMatcher
  });

  var c = options.commentResponse;

  var key = commentKey(c);
  var mod = { $set: {} };
  mod.$set['comments.' + key] = {
    id: c.id,
    url: c.url,
    htmlUrl: c.html_url,
    body: c.body,
    user: userResponseToObject(c.user),
    createdAt: new Date(c.created_at),
    updatedAt: new Date(c.updated_at)
  };
  return mod;
};

var saveIssue = function (options, cb) {
  if (asyncCheck(options, {
    repoOwner: String,
    repoName: String,
    issueResponse: issueResponseMatcher
  }, cb)) return;

  var id = issueMongoId(options.repoOwner,
                        options.repoName,
                        options.issueResponse.number);

  // When we get the issues from repoIssues, they don't contain closed_by. When
  // we get them from getRepoIssue (used by resyncOneIssue), they do. So if
  // we're syncing a closed issue and don't already have its closed_by, we go
  // use resyncOneIssue instead.
  //
  // (Note that sometimes closed_by exists and is null, if the closing user is a
  // deleted ("ghost") user. See eg #1976.)
  if (options.issueResponse.closed_at &&
      ! _.has(options.issueResponse, 'closed_by')) {
    var existing = Issues.findOne(id);
    var closedAtTimestamp = +(new Date(options.issueResponse.closed_at));
    if (! (existing && existing.issueDocument && existing.issueDocument.closedAt
           && (+existing.issueDocument.closedAt) === closedAtTimestamp)) {
      console.log("Fetching closed_by for " + id);
      resyncOneIssue({
        repoOwner: options.repoOwner,
        repoName: options.repoName,
        number: options.issueResponse.number
      }, cb);
      return;
    }
  }

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
  if (asyncCheck(options, {
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
  async.each(issues, function (issueResponse, cb) {
    saveIssue({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      issueResponse: issueResponse
    }, cb);
  }, cb);
};

var resyncOneIssue = function (options, cb) {
  if (asyncCheck(options, {
    repoOwner: String,
    repoName: String,
    number: Match.Integer
  }, cb)) return;

  github.issues.getRepoIssue({
    user: options.repoOwner,
    repo: options.repoName,
    number: options.number
  }, githubify(function (err, issue) {
    if (err) {
      cb(err);
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
  if (asyncCheck(options, {
    repoOwner: String,
    repoName: String
  }, cb)) return;

  console.log("Resyncing issues for " +
              options.repoOwner + "/" + options.repoName);

  var receivePageOfIssues = githubify(function (err, issues) {
    if (err) {
      cb(err);
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

var saveComment = function (options, cb) {
  if (asyncCheck(options, {
    repoOwner: String,
    repoName: String,
    commentResponse: commentResponseMatcher
  }, cb)) return;

  var comment = options.commentResponse;

  // Ugh.  Comments don't actually have an issue number!
  var issueUrlMatch = comment.issue_url.match(/\/issues\/(\d+)$/);
  if (! issueUrlMatch) {
    cb(Error("Bad issue URL: " + comment.issue_url));
    return;
  }
  var issueNumber = +issueUrlMatch[1];

  var issueId = issueMongoId(options.repoOwner, options.repoName, issueNumber);

  var mod = commentResponseToModifier(
    _.pick(options, 'repoOwner', 'repoName', 'commentResponse'));

  Issues.update(
    {
      // Specifying _id explicitly means we avoid fake upsert, which is good
      // because minimongo doesn't do $max yet.
      _id: issueId,
      repoOwner: options.repoOwner,  // so upserts sets it (good for index)
      repoName: options.repoName  // ditto
    },
    mod,
    { upsert: true },
    cb
  );
};

// Saves a page of comments.
var saveOnePageOfComments = function (options, cb) {
  if (asyncCheck(options, {
    repoOwner: String,
    repoName: String,
    commentResponses: [commentResponseMatcher]
  }, cb)) return;

  var comments = options.commentResponses;

  if (! comments.length) {
    throw Error("empty page?");
  }

  async.each(comments, function (commentResponse, cb) {
    saveComment({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      commentResponse: commentResponse
    }, cb);
  }, cb);
};

// Syncs all comments. Unlike with issues, we can use a 'since' and not go back
// to the beginning of time, because all changes we care about update the
// updated_at date.
var syncAllComments = function (options, cb) {
  if (asyncCheck(options, {
    repoOwner: String,
    repoName: String
  }, cb)) return;

  var syncedToId = syncedToMongoId(
    options.repoOwner, options.repoName, 'comments');
  var syncedToDoc = SyncedTo.findOne(syncedToId);
  var query = {
    user: options.repoOwner,
    repo: options.repoName,
    sort: 'updated',
    direction: 'asc',
    per_page: 100
  };
  if (syncedToDoc) {
    query.since = syncedToDoc.lastDate;
  }

  console.log('Syncing ' + syncedToId +
              (syncedToDoc ? ' since ' + syncedToDoc.lastDate : ''));

  var receivePageOfComments = githubify(function (err, comments) {
    if (err) {
      cb(err);
      return;
    }
    if (! comments.length) {
      cb();
      return;
    }

    var newLastDate = _.last(comments).updated_at;
    console.log(
      "Saving " + comments.length + " comments for " +
        options.repoOwner + "/" + options.repoName + " up to " + newLastDate);

    saveOnePageOfComments({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      commentResponses: comments
    }, function (err) {
      if (err) {
        cb(err);
        return;
      }
      // Save the last one we've successfully saved. (Note that the next call to
      // syncAllComments will resync this comment; seems better than trying to
      // add 1 and maybe missing a second comment from the same second.)
      SyncedTo.update(
        syncedToId,
        { $set: { lastDate: newLastDate } },
        { upsert: true },
        function (err) {
          if (err) {
            cb(err);
            return;
          }

          if (github.hasNextPage(comments)) {
            github.getNextPage(comments, receivePageOfComments);
          } else {
            cb();
          }
        }
      );
    });
  });

  github.issues.repoComments(query, receivePageOfComments);
};

// The secret is a random string that you generate (eg, `openssl rand -hex 20`)
// and set when you set up the webhook. Always set it in production (via
// settings in lastpass), and generally set it while testing too --- otherwise
// random people on the internet can insert stuff into your database!
var webhook = githubWebhookHandler({
  secret: (Meteor.settings.githubWebhookSecret ||
           process.env.GITHUB_WEBHOOK_SECRET)
});

WebApp.connectHandlers.use('/webhook', Meteor.bindEnvironment(function (req, res, next) {
  if (req.method.toLowerCase() !== 'post') {
    next();
    return;
  }

  webhook(req, res);
}));

var webhookComplain = function (err) {
  if (err) {
    console.error("Error in webhook:", err);
  }
};

webhook.on('error', webhookComplain);

webhook.on('issues', Meteor.bindEnvironment(function (event) {
  if (asyncCheck(event.payload, Match.ObjectIncluding({
    issue: issueResponseMatcher,
    repository: repositoryResponseMatcher
  }), webhookComplain)) return;

  saveIssue({
    repoOwner: event.payload.repository.owner.login,
    repoName: event.payload.repository.name,
    issueResponse: event.payload.issue
  }, webhookComplain);
}));

webhook.on('pull_request', Meteor.bindEnvironment(function (event) {
  if (asyncCheck(event.payload, Match.ObjectIncluding({
    pull_request: Match.ObjectIncluding({
      number: Match.Integer
    }),
    repository: repositoryResponseMatcher
  }), webhookComplain)) return;

  // Unfortunately, the pull_request event inexplicably does not
  // contain labels, so we can't trust what we hear over the wire.
  // Do a full resync instead.
  resyncOneIssue({
    repoOwner: event.payload.repository.owner.login,
    repoName: event.payload.repository.name,
    number: event.payload.pull_request.number
  }, webhookComplain);
}));

webhook.on('issue_comment', Meteor.bindEnvironment(function (event) {
  if (asyncCheck(event.payload, Match.ObjectIncluding({
    comment: commentResponseMatcher,
    repository: repositoryResponseMatcher
  }), webhookComplain)) return;

  saveComment({
    repoOwner: event.payload.repository.owner.login,
    repoName: event.payload.repository.name,
    commentResponse: event.payload.comment
  }, webhookComplain);
}));

// XXX rewrite to allow multiple repos
var issueCronjob = function () {
  resyncAllIssues({
    repoOwner: 'meteor',
    repoName: 'meteor'
  }, function (err) {
    if (err) {
      console.error("Error in issue cronjob: " + err.stack);
    }
    console.log("Done issue cronjob");
    // Full resync every 20 minutes, and on startup.  (Webhook does the trick
    // otherwise.)
    Meteor.setTimeout(issueCronjob, 1000 * 60 * 20);
  });
};
Meteor.startup(issueCronjob);

// XXX rewrite to allow multiple repos
var commentCronjob = function () {
  syncAllComments({
    repoOwner: 'meteor',
    repoName: 'meteor'
  }, function (err) {
    if (err) {
      console.error("Error in comment cronjob: " + err.stack);
    }
    console.log("Done comment cronjob");
    // Sync every minute, and on startup.  (Webhook does the trick otherwise.)
    //
    // Because this one actually works incrementally (unlike the issue cronjob)
    // it's OK to make it once a minute.
    Meteor.setTimeout(commentCronjob, 1000 * 60);
  });
};
Meteor.startup(commentCronjob);
