// Manage a list of team members.


// Documents are of the form:
// - _id: Stringified numerical id
// - login: String
// - active: bool (active means "can log in and use this site",
//   inactive just means "their comments count as team member comments";
//   in the future this could be extended to date ranges of comments counting)
var TeamMembers = P.newCollection('teamMembers');

P.asyncMethod('addTeamMember', function (login, active, cb) {
  var self = this;
  P.asyncVoidSeries([
    function (cb) {
      // You need to be logged in (which requires you to be one of these users)
      // unless you are trying to add the first user;
      if (! self.userId && TeamMembers.findOne()) {
        cb(new Meteor.Error("Not allowed"));
      } else {
        cb();
      }
    },
    _.partial(P.asyncCheck, login, String),
    _.partial(P.asyncCheck, active, Boolean),
    _.partial(addTeamMember, login, active)
  ], cb);
});

P.asyncMethod('removeTeamMember', function (login, cb) {
  var self = this;
  P.asyncVoidSeries([
    function (cb) {
      cb(self.userId ? null : new Meteor.Error("Not allowed"));
    },
    _.partial(P.asyncCheck, login, String),
    function (cb) {
      TeamMembers.remove({ login: login }, cb);
    },
    P.reclassifyAllIssues
  ], cb);
});

var addTeamMember = function (login, active, cb) {
  P.async.waterfall([
    function (cb) {
      P.github.user.getFrom({ user: login }, P.githubify(cb));
    },
    function (user, cb) {
      P.asyncCheck(user, P.Match.User, cb);
    },
    function (user, cb) {
      // If the user already is in the database with an old username, replace
      // it.
      TeamMembers.update(
        { _id: ""+user.id },
        {  // this is a replace, not a modify!
          login: login,
          active: active,
          avatarUrl: user.avatar_url,
          htmlUrl: user.html_url
        },
        { upsert: true },
        cb);
    },
    function (result, cb) {
      P.reclassifyAllIssues(cb);
    }
  ], cb);
};

// map id -> active
var MEMBERS_BY_ID = {};

TeamMembers.find().observe({
  added: function (doc) {
    MEMBERS_BY_ID[doc._id] = doc.active;
  },
  changed: function (doc) {
    MEMBERS_BY_ID[doc._id] = doc.active;
  },
  removed: function (oldDoc) {
    delete MEMBERS_BY_ID[oldDoc._id];
  }
});

IsTeamMember = function (id) {
  return _.has(MEMBERS_BY_ID, ""+id);
};

IsActiveTeamMember = function (id) {
  return _.has(MEMBERS_BY_ID, ""+id) && MEMBERS_BY_ID[""+id];
};
