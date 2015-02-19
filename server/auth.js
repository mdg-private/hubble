Accounts.validateLoginAttempt(function (info) {
  check(info.user, Match.ObjectIncluding({
    services: Match.ObjectIncluding({
      github: Match.ObjectIncluding({
        id: Match.Integer
      })
    })
  }));

  if (! IsActiveTeamMember(info.user.services.github.id)) {
    throw new Meteor.Error(400, "Only active team members may log in");
  }

  return true;
});
