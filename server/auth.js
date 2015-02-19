Accounts.validateLoginAttempt(function (info) {
  check(info.user, Match.ObjectIncluding({
    services: Match.ObjectIncluding({
      github: Match.ObjectIncluding({
        id: Match.Integer
      })
    })
  }));

  var teamMember = TeamMembers.findOne(""+info.user.services.github.id);
  if (! teamMember) {
    throw new Meteor.Error(400, "Only team members may log in");
  }
  if (! teamMember.active) {
    throw new Meteor.Error(400, "Only active team members may log in");
  }

  return true;
});
