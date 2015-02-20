if (Meteor.isServer) {
  Meteor.publish('issues-by-status', function (status) {
    check(status, String);
    var defFields = {
      repoOwner: 1,
      repoName: 1,
      "issueDocument.id": 1,
      "issueDocument.htmlUrl": 1,
      "issueDocument.number" : 1,
      "issueDocument.open" : 1,
      "issueDocument.title" : 1,
      "issueDocument.body" : 1,
      "issueDocument.labels" : 1,
      "issueDocument.user" : 1,
      "issueDocument.hasProjectLabels" : 1,
      "recentCommentsCount" : 1,
      status: 1
    };
    return Issues.find({
      status: status
    }, { fields: defFields });
  });


  Meteor.publish('status-counts', function (tag) {
    check(tag, String);
    var self = this;
    var countsByStatus = {};

    // Increment a given status, or set it to 1 if it doesn't exist.
    var incrementStatus = function (status) {
      if (!_.has(countsByStatus, status)) {
        countsByStatus[status] = 1;
        if (initializing) return;
        self.added("counts", status, { count: 1 });
      } else {
        countsByStatus[status]++;
        if (initializing) return;
        self.changed("counts", status, { count: countsByStatus[status] });
      }
    };

    // Decrement a given status.
    var decrementStatus = function (status) {
      countsByStatus[status]--;
      self.changed("counts", status, { count: countsByStatus[status] });
    };

    var initializing = true;

    var finder = {};
    if (tag) {
      // XXX maybe case insensitive?
      finder['issueDocument.labels.name'] = { $regex: quotemeta(tag) };
    }

    var handle = Issues.find(finder, { fields: { status: 1 } }).observe({
      added: function (doc) {
        if (! doc.status) return;
        incrementStatus(doc.status);
      },
      changed: function (newDoc, oldDoc) {
        if (newDoc.status === oldDoc.status) return;
        oldDoc.status && decrementStatus(oldDoc.status);
        newDoc.status && incrementStatus(newDoc.status);
      },
      removed: function (oldDoc) {
        oldDoc.status && decrementStatus(oldDoc.status);
      }
    });

    initializing = false;

    _.each(countsByStatus, function (value, key) {
      self.added("counts", key, { count: value });
    });

    self.ready();
    self.onStop(function () {
      handle.stop();
    });
  });

  Meteor.publish('issue-recent-comments', function (id) {
    check(id, String);
    return Issues.find({ _id: id }, { fields: { recentComments: 1 } });
  });
}

quotemeta = function (str) {
  return String(str).replace(/(\W)/g, '\\$1');
};
