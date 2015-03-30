// Classify issues by status.

// --------------------------------------
// ACTIONS THAT CAN AFFECT CLASSIFICATION
// --------------------------------------

P.asyncMethod('snooze', function (options, cb) {
  recordAction('snoozes', options, cb);
});

P.asyncMethod('needsResponse', function (options, cb) {
  recordAction('needsResponses', options, cb);
});

var recordAction = function (actionField, options, cb) {
  var mongoId;

  P.asyncVoidSeries([
    P.requireLoggedIn,
    _.partial(P.asyncCheck, options, Match.ObjectIncluding({
      repoOwner: String,
      repoName: String,
      number: Match.Integer
    })),
    function (cb) {
      mongoId = P.issueMongoId(
        options.repoOwner, options.repoName, options.number);
      if (! Issues.findOne(mongoId)) {
        cb(new Meteor.Error(404, "No such issue"));
        return;
      }
      var user = new Meteor.user();
      if (P.asyncErrorCheck(user, Match.ObjectIncluding({
        services: Match.ObjectIncluding({
          github: Match.ObjectIncluding({
            id: Match.Integer,
            username: String
          })
        })
      }))) return;

      var update = { $push: {} };
      update.$push[actionField] = {
        when: new Date,
        login: user.services.github.username,
        id: user.services.github.id
      };
      Issues.update(mongoId, update, cb);
    },
    function (cb) {
      P.needsClassification(mongoId, cb);
    }
  ], cb);
};

P.asyncMethod('setHighlyActive', function (options, cb) {
  var mongoId;

  P.asyncVoidSeries([
    P.requireLoggedIn,
    _.partial(P.asyncCheck, options, Match.ObjectIncluding({
      repoOwner: String,
      repoName: String,
      number: Match.Integer,
      highlyActive: Boolean
    })),
    function (cb) {
      mongoId = P.issueMongoId(
        options.repoOwner, options.repoName, options.number);
      if (! Issues.findOne(mongoId)) {
        cb(new Meteor.Error(404, "No such issue"));
        return;
      }
      var user = new Meteor.user();
      if (P.asyncErrorCheck(user, Match.ObjectIncluding({
        services: Match.ObjectIncluding({
          github: Match.ObjectIncluding({
            id: Match.Integer,
            username: String
          })
        })
      }))) return;

      Issues.update(mongoId, {
        $set: {
          highlyActive: options.highlyActive
        },
        $push: {
          // This is just a log that we could use in the future to display who
          // set something highly active and to determine historical status
          // values.
          highlyActiveLog: {
            when: new Date,
            login: user.services.github.username,
            id: user.services.github.id,
            setTo: options.highlyActive
          }
        }
      }, cb);
    },
    function (cb) {
      P.needsClassification(mongoId, cb);
    }
  ], cb);
});



// ------------------------
// CLASSIFICATION ALGORITHM
// ------------------------

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

var classificationModifier = function (doc) {
  if (! doc.issueDocument) {
    // We don't actually have issue metadata (eg, we have comments but no
    // issue?) Just mark it as Mystery and move on.
    return {
      $set: {
        status: 'mystery',
        recentComments: {},
        recentCommentsCount: 0,
        msSpentInNew: null,
        canBeSnoozed: false
      }
    };
  }

  // When was the last snooze (or null if none)?
  var lastSnoozeDate =
        _.isEmpty(doc.snoozes) ? null : _.max(_.pluck(doc.snoozes, 'when'));
  // When was the last needsResponse (or null if none)?
  var lastNeedsResponseDate =
        _.isEmpty(doc.needsResponses) ? null
        : _.max(_.pluck(doc.needsResponses, 'when'));

  // "recent" means "since last team member commented or snoozed"
  var recentComments = {};
  var comments = [];
  var teamComments = [];
  _.each(_.keys(doc.comments || {}).sort(), function (key) {
    var comment = doc.comments[key];
    comments.push(comment);
    if (IsTeamMember(comment.user.id)) {
      recentComments = {};
      teamComments.push(comment);
    } else if (! lastSnoozeDate || comment.createdAt > lastSnoozeDate) {
      recentComments[key] = comment;
    }
  });

  // Was the issued opened by a team member?
  var teamOpener = IsTeamMember(doc.issueDocument.user.id);

  // Did a team member comment on it at all?
  var firstTeamComment = _.first(teamComments);
  var lastTeamComment = _.last(teamComments);
  var teamCommented = !! firstTeamComment;
  // Special case for pre-2015 unresponded issues.
  var manuallyMarkedAsResponded = !! doc.manuallyMarkedAsResponded;

  // Has the issue been explicitly marked as highly active?
  var highlyActive = !! doc.highlyActive;

  // What was the last comment (or null)?
  var lastComment = _.isEmpty(comments) ? null : _.last(comments);

  // Was the last comment by a team member?
  var lastCommentWasTeam = lastComment && IsTeamMember(lastComment.user.id);

  // Was the last publicly visible action by a team member?
  var lastPublicActionWasTeam = lastCommentWasTeam ||
        (teamOpener && _.isEmpty(comments));

  // Was the last action (including snooze) by a team member?  (This only gets
  // you out of 'new' if it was a public action, but it can get you out of
  // active/stirring into triaged/closed.)
  var lastActionWasTeam = (
    lastPublicActionWasTeam ||
      (lastSnoozeDate &&
       (! lastComment || lastSnoozeDate > lastComment.createdAt)));

  // Has a team member indicated that this issue needs a response, and there has
  // not been a team member comment or snooze since then?
  var noResponseSinceNeedsReponse = (
    lastNeedsResponseDate &&
      (! (lastSnoozeDate &&
          lastNeedsResponseDate < lastSnoozeDate)) &&
      (! (lastTeamComment &&
          lastNeedsResponseDate < lastTeamComment.createdAt)));

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
  if (noResponseSinceNeedsReponse) {
    // If we've explicitly put it in the "needs response" category, then it
    // stays there until we take it out of there.
    status = 'unresponded';
  } else if (! teamOpener && ! teamCommented && ! fastClose &&
             ! manuallyMarkedAsResponded) {
    // The only way to get out of unresponded is a publicly visible action by a
    // team member, or the special "fast close" case (or manually marking it
    // in the database, which we did once for legacy issues).
    status = 'unresponded';
  } else if (highlyActive) {
    // Anything not unresponded with the highlyActive bit is HIGHLY-ACTIVE.
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

  // Calculate a statistic which tracks the first time that we responded to an
  // issue.
  var msSpentInNew = null;
  if (teamOpener) {
    msSpentInNew = 0;
  } else if (fastClose) {
    msSpentInNew = doc.issueDocument.closedAt - doc.issueDocument.createdAt;
  } else if (firstTeamComment) {
    msSpentInNew = firstTeamComment.createdAt - doc.issueDocument.createdAt;
  }

  var updates = _.pluck(doc.comments, 'updatedAt');
  updates.push(doc.issueDocument.updatedAt);

  // Can we snooze this?  We can't if it's in one of the two categories that
  // means we've already said everything we could say, and we also can't if
  // we've never made a public action.
  var canBeSnoozed = (
    (teamOpener || teamCommented || fastClose) &&
      status !== 'closed' && status !== 'triaged');

  return {
    $set: {
      status: status,
      recentComments: recentComments,
      recentCommentsCount: _.size(recentComments),
      msSpentInNew: msSpentInNew,
      lastUpdateOrComment: _.max(updates),
      canBeSnoozed: canBeSnoozed
    }
  };
};


// --------------------
// CLASSIFICATION QUEUE
// --------------------

// Schema:
//  - _id: same id as Issues
//  - enqueued: Number (millis) enqueued (upsert with $max)
var ClassificationQueue = P.newCollection('classificationQueue');

P.needsClassification = function (id, cb) {
  if (P.asyncErrorCheck(id, String, cb)) return;

  console.log("Needs classification:", id);

  ClassificationQueue.update(
    id, { $max: { enqueued: +(new Date) } }, { upsert: true }, cb);
};

P.reclassifyAllIssues = function (cb) {
  console.log("Reclassifying all issues!");
  var ids = Issues.find({}, { fields: { _id: 1 } }).fetch();
  // XXX bulk insert!!!
  var when = +(new Date);
  P.async.each(ids, function (doc, cb) {
    ClassificationQueue.insert({_id: doc._id, enqueued: when}, cb);
  }, cb);
};

P.asyncMethod('reclassifyAllIssues', function (cb) {
  var self = this;
  P.asyncVoidSeries([
    P.requireLoggedIn,
    P.reclassifyAllIssues
  ], cb);
});

// Classifies everything currently in the queue. Result is a bool saying whether
// anything was seen.
var classifyCurrentQueue = function (cb) {
  console.log("Starting to classify");
  var queue = ClassificationQueue.find().fetch();
  P.async.each(queue, function (queued, cb) {
    P.asyncVoidSeries([
      function (cb) {
        classifyIssueById(queued._id, cb);
      },
      function (cb) {
        // Only remove it if it hasn't already been updated with a newer
        // enqueued number!
        ClassificationQueue.remove(_.pick(queued, '_id', 'enqueued'), cb);
      }
    ], cb);
  }, function (err) {
    if (err) {
      cb(err);
      return;
    }
    cb(null, !! queue.length);
  });
};

var classifyForever = function () {
  classifyCurrentQueue(function (err, accomplished) {
    if (err) {
      console.error("Error classifying: " + err);
      // Try again in 10 seconds
      Meteor.setTimeout(classifyForever, 1000 * 10);
      return;
    }
    if (accomplished) {
      // If we managed to do something, try again immediately.
      Meteor.defer(classifyForever);
      return;
    }

    console.log("Waiting for classification queue");

    var inInitialAdds = true;
    var stopInInitialAdds = false;
    var handle = ClassificationQueue.find().observeChanges({
      added: function () {
        if (inInitialAdds) {
          // we don't have a handle yet during initial adds to stop it
          stopInInitialAdds = true;
        } else {
          handle.stop();
          Meteor.defer(classifyForever);
        }
      }
    });
    inInitialAdds = false;
    if (stopInInitialAdds) {
      handle.stop();
      Meteor.defer(classifyForever);
    }
  });
};

Meteor.startup(classifyForever);
