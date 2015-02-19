// Manage a list of team members.

var Future = Npm.require('fibers/future');
var async = Npm.require('async');

// Need this to enable async.waterfall.
var savedAsyncSetImmediate = async.setImmediate;
async.setImmediate = function (fn) {
  savedAsyncSetImmediate(Meteor.bindEnvironment(fn));
};


// Documents are of the form:
// - _id: Stringified numerical id
// - login: String
// - active: bool (active means "can log in and use this site",
//   inactive just means "their comments count as team member comments";
//   in the future this could be extended to date ranges of comments counting)
var TeamMembers = P.newCollection('teamMembers');

Meteor.methods({
  addTeamMember: function (login, active) {
    // You need to be logged in (which requires you to be one of these users)
    // unless you are trying to add the first user;
    if (! this.userId && TeamMembers.findOne()) {
      throw new Meteor.Error("Not allowed");
    }

    check(login, String);
    check(active, Boolean);
    var f = new Future;
    addTeamMember(login, active, f.resolver());
    f.wait();
  },
  removeTeamMember: function (login) {
    if (! this.userId) {
      throw new Meteor.Error("Not allowed");
    }

    check(login, String);
    var f = new Future;
    async.series([
      function (cb) {
        TeamMembers.remove({ login: login }, cb);
      },
      P.reclassifyAllIssues
    ], f.resolver());
    f.wait();
  }
});

var addTeamMember = function (login, active, cb) {
  async.waterfall([
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
