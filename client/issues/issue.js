Template.issue.helpers({
  "statusColor" : function () {
    return "33aa55";
  },
  "status": function () {
    return "Triaged";
  },
  // XXX: I wish there was an easier way to filter this w/o doing extra work.
  "nonProjectLabels": function () {
    var self = this;
    return _.filter(self.issueDocument.labels, function (l) {
      return ! startsWithProject(l);
    });
  },
  "projectLabels": function () {
    var self = this;
    return _.filter(self.issueDocument.labels, function (l) {
      return startsWithProject(l);
    });
  },
  "numRecentComments": function () {
    var self = this;
    return self.comments && _.keys(self.comments).length;
  },
  displayRecentComments: function () {
    return Session.get(displayId(this));
  }
});

var startsWithProject = function (label) {
  return label.name.match(/^Project:/g);
};


Template.issue.events({
  'click .issue-comments': function () {
    Session.set(displayId(this), ! Session.get(displayId(this)));
  }

});
