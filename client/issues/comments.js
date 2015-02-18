Template.comments.helpers({
  comments: function () {
    return [ {text: "foobar foobar foobar"}, {text: "foobar \n\nfoobar foobar"} ];
  }
});

Template.commentText.helpers({
  commentHtml: function () {
    return this.text;
  },
});
