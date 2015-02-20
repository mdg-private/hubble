Template.issue.helpers({
  "statusColor" : function () {
    var mytag = this.status || "active";
    return States.findOne({ tag: mytag }).color;
  },
  "status": function () {
    var mytag = this.status || "active";
    return States.findOne({ tag: mytag }).name;
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
    return self.recentCommentsCount;
  },
  displayRecentComments: function () {
    return Session.get(displayId(this));
  }
});

var startsWithProject = function (label) {
  return label.name.match(/^Project:/);
};


Template.issue.events({
  'click .issue-comments': function () {
    Session.set(displayId(this), ! Session.get(displayId(this)));
  }

});
