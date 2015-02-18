Template.comments.helpers({
  comments: function () {
    return [ {text: "foobar foobar foobar"}, {text: "foobar \n\nfoobar foobar"} ];
  }
});

Template.commentText.helpers({
  commentMarkdown: function () {
    return this.text;
  },
});


Template.comments.events({
  "click .snooze": function () {
    // snooze this;
    Session.set(displayId(this), false);
  },
  "click .mute": function () {
    // mute this;
    Session.set(displayId(this), false);
  }
});
