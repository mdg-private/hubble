// -----------
// MONGO SETUP
// -----------

Issues = P.newCollection('issues');
Issues._ensureIndex({
  repoOwner: 1,
  repoName: 1
});
// XXX more indices?

P.issueMongoId = function (repoOwner, repoName, number) {
  check(repoOwner, String);
  check(repoName, String);
  check(number, Match.Integer);
  return repoOwner + '/' + repoName + '#' + number;
};


// id eg 'meteor/meteor#comments'
// only relevant field is lastDate (String)
var SyncedTo = P.newCollection('syncedTo');
var syncedToMongoId = function (repoOwner, repoName, which) {
  check(repoOwner, String);
  check(repoName, String);
  check(which, String);
  return repoOwner + '/' + repoName + '#' + which;
};


// -------------------------------------------
// CONVERTING FROM GITHUB SCHEMA TO OUR SCHEMA
// -------------------------------------------

var userResponseToObject = function (userResponse) {
  check(userResponse, P.Match.User);
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
    issueResponse: P.Match.Issue
  });

  var i = options.issueResponse;

  var mod = {
    $set: {
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      'issueDocument.id': i.id,
      'issueDocument.url': i.url,
      'issueDocument.htmlUrl': i.html_url,
      'issueDocument.number': i.number,
      'issueDocument.open': (i.state === 'open'),
      'issueDocument.title': i.title,
      'issueDocument.body': i.body,
      'issueDocument.user': userResponseToObject(i.user),
      'issueDocument.labels': _.map(i.labels, function (l) {
        return _.pick(l, 'url', 'name', 'color');
      }),
      'issueDocument.hasProjectLabel': _.any(i.labels, function (l) {
        return /^Project:/.test(l.name);
      }),
      'issueDocument.assignee': (
        i.assignee ? userResponseToObject(i.assignee) : null),
      'issueDocument.commentCount': i.comments,
      'issueDocument.milestone': (
        i.milestone ? {
          url: i.milestone.url,
          number: i.milestone.number,
          open: (i.milestone.state === 'open'),
          title: i.milestone.title,
          description: i.milestone.description
        } : null),
      'issueDocument.pullRequest': (
        i.pull_request ? {
          url: i.pull_request.url,
          diffUrl: i.pull_request.diff_url,
          htmlUrl: i.pull_request.html_url,
          patchUrl: i.pull_request.patch_url
        } : null),
      'issueDocument.createdAt': new Date(i.created_at),
      'issueDocument.closedAt': i.closed_at ? new Date(i.closed_at) : null,
      'issueDocument.updatedAt': new Date(i.updated_at)
    }
  };

  // Only set closedBy if we were actually given one (null or not).
  if (_.has(i, 'closed_by')) {
    mod.$set['issueDocument.closedBy'] =
      i.closed_by ? userResponseToObject(i.closed_by) : null;
  }

  return mod;
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
    commentResponse: P.Match.Comment
  });

  var c = options.commentResponse;

  var key = commentKey(c);
  var mod = { $set: {} };
  mod.$set['comments.' + key] = {
    id: c.id,
    url: c.url,
    htmlUrl: c.html_url,
    body: c.body,
    bodyHtml: c.body_html,
    user: userResponseToObject(c.user),
    createdAt: new Date(c.created_at),
    updatedAt: new Date(c.updated_at)
  };
  return mod;
};


// -------------------------------------------
// FUNCTIONS THAT ACTUALLY MODIFY THE DATABASE
// -------------------------------------------

// We can't ever suggest more than this, sadly.
var MAX_PER_PAGE = 100;

var saveIssue = function (options, cb) {
  if (P.asyncErrorCheck(options, {
    repoOwner: String,
    repoName: String,
    issueResponse: P.Match.Issue
  }, cb)) return;

  var id = P.issueMongoId(options.repoOwner,
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
    if (! (existing
           && existing.issueDocument
           && _.has(existing.issueDocument, 'closedBy')
           && existing.issueDocument.closedAt
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

  P.async.waterfall([
    function (cb) {
      // Specifying _id explicitly means we avoid fake upsert.  fullResult lets
      // us check nModified.
      Issues.update(id, mod, { upsert: true, fullResult: true }, cb);
    },
    function (result, cb) {
      // If nothing changed, do nothing.
      if (! (result.nModified || result.upserted)) {
        cb();
      } else {
        P.needsClassification(id, cb);
      }
    }
  ], cb);
};

// Saves a page of issues.
var saveOnePageOfIssues = function (options, cb) {
  if (P.asyncErrorCheck(options, {
    repoOwner: String,
    repoName: String,
    issueResponses: [P.Match.Issue]
  }, cb)) return;

  var issues = options.issueResponses;

  if (! issues.length) {
     throw Error("empty page?");
  }

  console.log("Saving " + issues.length + " issues for " +
              options.repoOwner + "/" + options.repoName + ": " +
              JSON.stringify(_.pluck(issues, 'number')));
  P.async.each(issues, function (issueResponse, cb) {
    saveIssue({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      issueResponse: issueResponse
    }, cb);
  }, cb);
};

var resyncOneIssue = function (options, cb) {
  if (P.asyncErrorCheck(options, {
    repoOwner: String,
    repoName: String,
    number: Match.Integer
  }, cb)) return;

  P.github.issues.getRepoIssue({
    user: options.repoOwner,
    repo: options.repoName,
    number: options.number
  }, P.githubify(function (err, issue) {
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

var resyncOneComment = function (options, cb) {
  if (P.asyncErrorCheck(options, {
    repoOwner: String,
    repoName: String,
    id: Match.Integer
  }, cb)) return;

  P.github.issues.getComment({
    user: options.repoOwner,
    repo: options.repoName,
    id: options.id,
    headers: {
      // Include body and body_html.  (We don't trust our own Markdown generator
      // to be safe.)
      Accept: 'application/vnd.github.VERSION.full+json'
    }
  }, P.githubify(function (err, comment) {
    if (err) {
      cb(err);
      return;
    }
    saveComment({
      repoOwner: options.repoOwner,
      repoName: options.repoName,
      commentResponse: comment
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
  if (P.asyncErrorCheck(options, {
    repoOwner: String,
    repoName: String
  }, cb)) return;

  console.log("Resyncing issues for " +
              options.repoOwner + "/" + options.repoName);

  var receivePageOfIssues = P.githubify(function (err, issues) {
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
      } else if (P.github.hasNextPage(issues)) {
        P.github.getNextPage(issues, receivePageOfIssues);
      } else {
        cb();
      }
    });
  });

  P.github.issues.repoIssues({
    user: options.repoOwner,
    repo: options.repoName,
    per_page: MAX_PER_PAGE,
    state: 'all',
    sort: 'updated'   // get newest in first, just because that's useful
  }, receivePageOfIssues);
};

var saveComment = function (options, cb) {
  if (P.asyncErrorCheck(options, {
    repoOwner: String,
    repoName: String,
    commentResponse: P.Match.Comment
  }, cb)) return;

  var comment = options.commentResponse;

  // Ugh.  Comments don't actually have an issue number!
  var issueUrlMatch = comment.issue_url.match(/\/issues\/(\d+)$/);
  if (! issueUrlMatch) {
    cb(Error("Bad issue URL: " + comment.issue_url));
    return;
  }
  var issueNumber = +issueUrlMatch[1];

  var issueId = P.issueMongoId(
    options.repoOwner, options.repoName, issueNumber);

  var mod = commentResponseToModifier(
    _.pick(options, 'repoOwner', 'repoName', 'commentResponse'));

  P.async.waterfall([
    function (cb) {
      Issues.update({
        // Specifying _id explicitly means we avoid fake upsert.
        _id: issueId,
        repoOwner: options.repoOwner,  // so upserts sets it (good for index)
        repoName: options.repoName  // ditto
      }, mod, { upsert: true, fullResult: true }, cb);
    },
    function (result, cb) {
      // If nothing changed, do nothing.
      if (! (result.nModified || result.upsert)) {
        cb();
      } else {
        P.needsClassification(issueId, cb);
      }
    }
  ], cb);
};

// Saves a page of comments.
var saveOnePageOfComments = function (options, cb) {
  if (P.asyncErrorCheck(options, {
    repoOwner: String,
    repoName: String,
    commentResponses: [P.Match.Comment]
  }, cb)) return;

  var comments = options.commentResponses;

  if (! comments.length) {
    throw Error("empty page?");
  }

  P.async.each(comments, function (commentResponse, cb) {
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
  if (P.asyncErrorCheck(options, {
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
    per_page: MAX_PER_PAGE,
    headers: {
      // Include body and body_html.  (We don't trust our own Markdown generator
      // to be safe.)
      Accept: 'application/vnd.github.VERSION.full+json'
    }
  };
  if (syncedToDoc) {
    query.since = syncedToDoc.lastDate;
  }

  console.log('Syncing ' + syncedToId +
              (syncedToDoc ? ' since ' + syncedToDoc.lastDate : ''));

  var receivePageOfComments = P.githubify(function (err, comments) {
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

          if (P.github.hasNextPage(comments)) {
            P.github.getNextPage(comments, receivePageOfComments);
          } else {
            cb();
          }
        }
      );
    });
  });

  P.github.issues.repoComments(query, receivePageOfComments);
};


// --------
// WEBHOOKS
// --------

var webhookComplain = function (err) {
  if (err) {
    console.error("Error in webhook:", err);
  }
};

P.webhook.on('error', webhookComplain);

P.webhook.on('issues', Meteor.bindEnvironment(function (event) {
  if (P.asyncErrorCheck(event.payload, Match.ObjectIncluding({
    issue: P.Match.Issue,
    repository: P.Match.Repository
  }), webhookComplain)) return;

  saveIssue({
    repoOwner: event.payload.repository.owner.login,
    repoName: event.payload.repository.name,
    issueResponse: event.payload.issue
  }, webhookComplain);
}));

P.webhook.on('pull_request', Meteor.bindEnvironment(function (event) {
  if (P.asyncErrorCheck(event.payload, Match.ObjectIncluding({
    pull_request: Match.ObjectIncluding({
      number: Match.Integer
    }),
    repository: P.Match.Repository
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

P.webhook.on('issue_comment', Meteor.bindEnvironment(function (event) {
  if (P.asyncErrorCheck(event.payload, Match.ObjectIncluding({
    comment: Match.ObjectIncluding({
      id: Match.Integer
    }),
    repository: P.Match.Repository
  }), webhookComplain)) return;

  // Unfortunately, the comment event only contains markdown and not HTML. We
  // have to go back and ask nicely for HTML.
  resyncOneComment({
    repoOwner: event.payload.repository.owner.login,
    repoName: event.payload.repository.name,
    id: event.payload.comment.id
  }, webhookComplain);
}));


// --------
// CRONJOBS
// --------

// When running locally, sync hubble by default. Note that this is just about
// the cronjob; anything you set up with webhooks will be accepted.
var REPO_TO_SYNC = Meteor.settings.sync
      ? _.pick(Meteor.settings.sync, 'repoOwner', 'repoName')
      : { repoOwner: 'meteor', repoName: 'hubble' };


// XXX rewrite to allow multiple repos
var issueCronjob = function () {
  resyncAllIssues(REPO_TO_SYNC, function (err) {
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
  syncAllComments(REPO_TO_SYNC, function (err) {
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
