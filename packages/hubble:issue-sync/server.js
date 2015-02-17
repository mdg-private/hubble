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

var githubModule = Npm.require('github');

var github = new githubModule({
  version: '3.0.0',
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

  github.issues.getRepoIssue({
    user: options.repoOwner,
    repo: options.repoName,
    number: options.number
  }, Meteor.bindEnvironment(function (err, issue) {
    if (err) {
      return cb(err);
    }
    var mod = issueResponseToModifier({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      issueResponse: issue
    });
    var id = issueMongoId(options.repoOwner, options.repoName, options.number);
    try {
      Issues.update(
        // Specifying _id explicitly means we avoid fake upsert, which is good
        // because minimongo doesn't do $max yet.
        id,
        mod,
        { upsert: true },
        function (err) {
          console.log("X");
          if (err) {
            return cb(err);
          }
          cb();
        }
      );
    } catch (err) {
      cb(err);
    }
  }));
};

global.S = {
  syncIssue: syncIssue
};
