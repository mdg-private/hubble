var Future = Npm.require('fibers/future');
var githubModule = Npm.require('github');

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

Issues = new Mongo.Collection('issues', {
  _driver: driver
});
Issues._ensureIndex({
  repoOwner: 1,
  repoName: 1,
  number: 1
}, { unique: true });
// XXX more indices?

var github = new githubModule({
  version: '3.0.0',
  debug: !!process.env.GITHUB_API_DEBUG,
  headers: {
    "user-agent": "githubble.meteor.com"
  }
});

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
    description: String
  })),
  pull_request: Match.Optional({  // not maybeNull!
    url: String,
    diff_url: String,
    html_url: String,
    patch_url: String
  }),
  created_at: String,
  closed_at: maybeNull(String),
  updated_at: String,
  meta: Match.ObjectIncluding({
    etag: Match.Optional(String)
  })
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
        updatedAt: new Date(i.updatedAt)
      },
      issueEtag: i.meta.etag || null
    },
    $max: {
      lastMessage: {
        timestamp: i.created_at,
        userId: i.user.id,
        type: 'created'
      }
    }
  };
};

var syncIssue = function (options, cb) {
  check(options, {
    repoOwner: String,
    repoName: String,
    number: Match.Integer
  });

  var id = issueMongoId(options.repoOwner, options.repoName, options.number);
  var existing = Issues.findOne(id);

  var headers = {};
  if (existing && existing.issueEtag) {
    headers['If-None-Match'] = existing.issueEtag;
  }

  github.issues.getRepoIssue({
    user: options.repoOwner,
    repo: options.repoName,
    number: options.number,
    headers: headers
  }, Meteor.bindEnvironment(function (err, issue) {
    if (err) {
      return cb(err);
    }

    // Yay, etag matched! Nothing to do.
    if (issue.meta.status === '304 Not Modified') {
      return cb();
    }

    var mod = issueResponseToModifier({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      issueResponse: issue
    });
    Issues.update(
      // Specifying _id explicitly means we avoid fake upsert, which is good
      // because minimongo doesn't do $max yet.
      id,
      mod,
      { upsert: true },
      cb  // XXX then update state machine
    );
  }));
};

// XXX this is for testing, remove
Meteor.methods({
  syncIssue: function (options) {
    var f = new Future;
    syncIssue(options, f.resolver());
    return f.wait();
  }
});
