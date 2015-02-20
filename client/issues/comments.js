Template.comments.helpers({
  comments: function () {
    var self = this;
    return _.map(_.keys(self.recentComments || {}).sort(), function (key) {
      return self.recentComments[key];
    });
  },
  url: function () {
    return this.issueDocument.htmlUrl;
  }
});

Template.commentText.helpers({
  // We're pretty sure we can trust GitHub's HTML here! If not, switch back from
  // {{{bodyHtml}}} to <pre>{{body}}</pre>
  trustedCommentHtml: function () {
    return this.bodyHtml;
  },
  color: function () {
    return getCommentColor(this.id);
  },
  url: function () {
    return this.htmlUrl;
  },
});


Template.comments.events({
  "click .snooze": function () {
    Meteor.call('snooze', {
      repoOwner: this.repoOwner,
      repoName: this.repoName,
      number: this.issueDocument.number
    });
    Session.set(displayId(this), false);
  },
  "click .highly-active": function () {
    Meteor.call('setHighlyActive', {
      repoOwner: this.repoOwner,
      repoName: this.repoName,
      number: this.issueDocument.number,
      highlyActive: ! this.highlyActive
    });
    Session.set(displayId(this), false);
  }
});

Template.comments.onCreated(function () {
  this.subscribe('issue-recent-comments', this.data._id);
});

var nextColor = 0;
// Get alternating colors for comments.
var getCommentColor = function (seed) {
  var colors =
    ["F8F4C3", "F8F9DF"];
  nextColor = (nextColor + 1) % colors.length;
  return colors[nextColor];
};
