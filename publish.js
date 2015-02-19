// XXX this is temporary
if (Meteor.isClient) {
  Meteor.subscribe('unlabeled-open', 'meteor', 'meteor');
} else {
  Meteor.publish('unlabeled-open', function (repoOwner, repoName) {
    check(repoOwner, String);
    check(repoName, String);
    return Issues.find({
      repoOwner: repoOwner,
      repoName: repoName,
      'issueDocument.open': true,
      'issueDocument.hasProjectLabel': false
    }, { limit: 100 });
  });
}
