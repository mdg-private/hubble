Template.issueNav.helpers({
  states: function () {
    return States.find({}, { sort: { urgency: -1 }});
   },
  selected: function () {
    return Session.get(selectedState(this.tag));
  },
  numIssues: function () {
    // We don't want to know the number of closed issues.
    if (this.tag === "closed") return 0;
    // Otherwise, return how many issues we have.
    return Issues.find({ state: this.tag }).count();
  },
});

Template.viewIssues.helpers({
  issues: function () {
    return Issues.find({
        "issueDocument.open": true
    }, { $sort: { "issueDocument.updatedAt": -1 } });
  }
});

Template.issueNav.events({
  'click .state-button' : function () {
    Session.set(selectedState(this.tag), ! Session.get(selectedState(this.tag)));
  }
});

var selectedState = function (tag) {
  return "selectedState:" + tag;
};

States = new Mongo.Collection(null);
Meteor.startup(function () {
  if (! States.findOne()) {
    // new
    States.insert({ tag: "new", name: "Unresponded", color: "D2B91B", urgency: 10 });

    // active
    States.insert({ tag: "active", name: "Active", color: "F22", urgency: 7  });

    // triaged
    States.insert({ tag: "triaged", name: "Triaged", color: "33aa55",  urgency: 3 });

    // closed
    States.insert({ tag: "closed", name: "Closed", color: "777", urgency: 0 });

    // stirring
    States.insert({ tag: "stirring", name: "Stirring", color: "FAAC58", urgency: 9 });

    // highly-active
    States.insert({ tag: "highly-active", name: "Highly-Active", color: "77F",  urgency: 5 });
  }
});
