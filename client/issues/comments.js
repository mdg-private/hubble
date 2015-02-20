Template.comments.helpers({
  comments: function () {
    return _.values(this.comments);
  },
  url: function () {
    return this.issueDocument.htmlUrl;
  }
});

Template.commentText.helpers({
  commentMarkdown: function () {
    return this.body;
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
    // XXX: SNOOZE BUTTON
    Session.set(displayId(this), false);
  },
  "click .highly-active": function () {
    // XXX: HIGH_ACTIVE_BUTTON
    Session.set(displayId(this), false);
  }
});

var nextColor = 0;
// Get alternating colors for comments.
var getCommentColor = function (seed) {
  var colors =
    ["F8F4C3", "F8F9DF"];
  nextColor = (nextColor + 1) % colors.length;
  return colors[nextColor];
};
