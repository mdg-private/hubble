P.asyncMethod('claim', function (options, cb) {
  var mongoId, githubUsername;
  P.asyncVoidSeries([
    P.requireLoggedIn,
    _.partial(P.asyncCheck, options, {
      repoOwner: String,
      repoName: String,
      number: Match.Integer
    }),
    function (cb) {
      mongoId = P.issueMongoId(
        options.repoOwner, options.repoName, options.number);
      if (! Issues.findOne(mongoId)) {
        cb(new Meteor.Error(404, "No such issue"));
        return;
      }
      var user = Meteor.user();
      if (P.asyncErrorCheck(user, Match.ObjectIncluding({
        services: Match.ObjectIncluding({
          github: Match.ObjectIncluding({
            username: String
          })
        })
      }), cb)) return;
      githubUsername = user.services.github.username;

      // Unclaim everything.
      Issues.update({claimedBy: githubUsername},
                    {$unset: {claimedBy: 1}},
                    {multi: true},
                    cb);
    },
    function (cb) {
      // Claim this one.
      Issues.update(mongoId, {$set: {claimedBy: githubUsername}}, cb);
    }
  ], cb);
});
P.asyncMethod('unclaim', function (options, cb) {
  P.asyncVoidSeries([
    P.requireLoggedIn,
    _.partial(P.asyncCheck, options, {
      repoOwner: String,
      repoName: String,
      number: Match.Integer
    }),
    function (cb) {
      var mongoId = P.issueMongoId(
        options.repoOwner, options.repoName, options.number);
      if (! Issues.findOne(mongoId)) {
        cb(new Meteor.Error(404, "No such issue"));
        return;
      }
      Issues.update(mongoId, {
        $set: {
          claimedBy: null
        }
      }, cb);
    }
  ], cb);
});
