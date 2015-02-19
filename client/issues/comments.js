Template.comments.helpers({
  comments: function () {
console.log(this.comments);
    return _.values(this.comments);
  }
});

Template.commentText.helpers({
  commentMarkdown: function () {
    return this.body;
  },
  color: function () {
console.log(getCommentColor(this.id));
    return getCommentColor(this.id);
  }
});


Template.comments.events({
  "click .snooze": function () {
    // snooze this;
    Session.set(displayId(this), false);
  },
  "click .highly-active": function () {
    // mute this;
    Session.set(displayId(this), false);
  }
});

// Get a semi-random color for the comment. Surely there is a better way to do
// this!
var getCommentColor = function (seed) {
  var colors =
    ["F5F6D1", "F5F8CE", "F7F6CE",
     "F3F6CD", "F5F3CE", "F5F6CC"];

  return colors[seed % colors.length];
};
