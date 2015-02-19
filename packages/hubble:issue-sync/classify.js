// Classify issues by status.

var classifyIssue = function (options, cb) {
  if (P.asyncErrorCheck(options, {
    repoOwner: String,
    repoName: String,
    number: Match.Integer
  }, cb)) return;

  var id = P.issueMongoId(options.repoOwner, options.repoName, options.number);
  classifyIssueById(id, cb);
};

var classifyIssueById = function (id, cb) {
  if (P.asyncErrorCheck(id, String, cb)) return;
  var doc = Issues.findOne(id);

  if (! doc) {
    cb(Error("Unknown issue: " + id));
    return;
  }

  var mod = classificationModifier(doc);
  Issues.update(id, mod, cb);
};

// XXX temporary
var classifyAllIssues = function (cb) {
  var ids = Issues.find({}, { fields: { _id: 1 } }).fetch();
  var async = Npm.require('async');
  async.each(ids, function (doc, cb) {
    classifyIssueById(doc._id, cb);
  }, cb);
};

// XXX implement msSpentInNew #18
var classificationModifier = function (doc) {
  if (! doc.issueDocument) {
    // We don't actually have issue metadata (eg, we have comments but no
    // issue?) Just mark it as Mystery and move on.
    return {
      $set: {
        status: 'mystery',
        recentComments: {},
        recentCommentsCount: 0
      }
    };
  }

  // "recent" means "since last team member"
  var recentComments = {};
  var comments = [];
  _.each(_.keys(doc.comments || {}).sort(), function (key) {
    var comment = doc.comments[key];
    comments.push(comment);
    if (IsTeamMember(comment.user.id)) {
      recentComments = {};
    } else {
      recentComments[key] = comment;
    }
  });

  // Was the issued opened by a team member?
  var teamOpener = IsTeamMember(doc.issueDocument.user.id);

  // Did a team member comment on it at all?
  var teamCommented = _.any(comments, function (comment) {
    return IsTeamMember(comment.user.id);
  });

  // Has the issue been explicitly marked as highly active?
  var highlyActive = !! doc.highlyActive;

  // Was the last comment by a team member?
  var lastCommentWasTeam =
        ! _.isEmpty(comments) && IsTeamMember(_.last(comments).user.id);

  // Was the last publicly visible action by a team member?
  var lastPublicActionWasTeam = lastCommentWasTeam ||
        (teamOpener && _.isEmpty(comments));

  // Was the last action (including snooze) by a team member?
  // XXX implement snooze #19
  var lastActionWasTeam = lastPublicActionWasTeam;

  // Is it currently open?
  var open = doc.issueDocument.open;

  // Did the opener close it and nobody else commented?
  var fastClose = (
    ! open
      && doc.issueDocument.closedBy
      && doc.issueDocument.user.id === doc.issueDocument.closedBy.id
      && _.all(comments, function (comment) {
        return comment.user.id === doc.issueDocument.user.id;
      })
  );

  var status = null;
  if (! teamOpener && ! teamCommented && ! fastClose) {
    // The only way to get out of NEW is a publicly visible action by a team
    // member, or the special "fast close" case.
    status = 'new';
  } else if (highlyActive) {
    // Anything not NEW with the highlyActive bit is HIGHLY-ACTIVE.
    status = 'highly-active';
  } else if (open && lastActionWasTeam) {
    // It's open and we were the last to act (possibly by snoozing).
    status = 'triaged';
  } else if (! open && (lastActionWasTeam || fastClose)) {
    // It's closed and either we were the last to act, or the opener is the only
    // user to interact with this issue at all and closed it.
    status = 'closed';
  } else if (open) {
    // It's open, and the last action was not a team member.
    status = 'active';
  } else {
    // It's closed, and the last action was not a team member.
    status = 'stirring';
  }

  return {
    $set: {
      status: status,
      recentComments: recentComments,
      recentCommentsCount: _.size(recentComments)
    }
  };
};

// XXX remove temp method
Meteor.methods({
  classifyIssue: function (options) {
    var Future = Npm.require('fibers/future');
    var f = new Future;
    classifyIssue(options, f.resolver());
    f.wait();
  },
  classifyAllIssues: function () {
    var Future = Npm.require('fibers/future');
    var f = new Future;
    classifyAllIssues(f.resolver());
    f.wait();
  }
});
