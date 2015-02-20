// An extra layer of protection, especially since we trust GitHub's HTML.
BrowserPolicy.content.disallowInlineScripts();

// ... but we should allow GitHub avatar images.
BrowserPolicy.content.allowImageOrigin(
  'https://avatars.githubusercontent.com/');

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
