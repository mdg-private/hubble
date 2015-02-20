Template.issueNav.helpers({
  states: function () {
    return States.find({}, { sort: { urgency: -1 }});
   },
  numIssues: function () {
    // We don't want to know the number of closed issues.
//    if (this.tag === "closed") return 0;
    // Otherwise, return how many issues we have.
    return Counts.findOne(this.tag) && Counts.findOne(this.tag).count;
  },
  filter: function () {
   var me =  document.getElementById("tag-search");
   return (me && me.value) || Session.get("labelFilter");
  }
});

Template.viewIssues.helpers({
  issues: function () {
    var selectedStates = _.pluck(States.find({ selected: true }).fetch(), 'tag');
    var finder = { };
    if (! _.isEmpty(selectedStates)) {
      _.extend(finder, { "status": {$in: selectedStates }});
    }
    if (Session.get("labelFilter")) {
      _.extend(finder,
        { "issueDocument.labels.name":
          { $regex: ".*" + Session.get("labelFilter") + ".*" }
        });
    }
    return Issues.find(finder, { $sort: { "issueDocument.updatedAt": -1 } });
  }
});


Template.issueNav.events({
  'click .state-button' : function () {
    States.update(this._id, { $set: { selected: !this.selected }});
    Router.go(compileLink());
  },
  'click .search-button' : function () {
    filterByTag(document.getElementById("tag-search").value);
    Router.go(compileLink());
  },
  'keyup #tag-search': function (evt, template) {
    // We were going to filter on enter (we need to check that evt.which ===
    // 13), but then, this is kind of cool?
    filterByTag(document.getElementById("tag-search").value);
    Router.go(compileLink());
  },
});

filterByTag = function (tag) {
  Session.set("labelFilter", tag);
};

Counts = new Mongo.Collection("counts");
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

Template.subscribe.onCreated( function () {
  this.subscribe('issues-by-status', this.data.tag);
});

Tracker.autorun(function () {
  var label = Session.get("labelFilter") || "";
  Meteor.subscribe("status-counts", label);
});
