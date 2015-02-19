Template.logo.helpers({
  circles: function () {
    return [
      { x: 24, y: 15, r: 11 },
      { x: 16, y: 24, r: 8 },
      { x: 10, y: 30, r: 6 }
    ];
  }
});

Template.navbar.helpers({
  fullpermalink: function () {
    return "http://githubble.meteor.com" + compileLink();
  },
  smallpermalink: function () {
    return compileLink();
  }
});

compileLink = function () {
  var url = "";
  if (States.findOne({ selected: true })) {
    var selected = States.find({ selected: true }).fetch();
    var statesStr = _.pluck(selected, "tag").join("&");
    url += "/states/" + statesStr;
  }
  if (Session.get("labelFilter")) {
    url += "/filter/" + Session.get("labelFilter");
  }
  return url;
};
