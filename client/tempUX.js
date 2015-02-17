Template.currentIssues.helpers({
  issues: function () {
    return Issues.find({
        "issueDocument.open": true,
        "issueDocument.hasProjectLabel": false
    }, { $sort: { "issueDocument.updatedAt": -1 } });
  }
});

Template.labeledIssues.helpers({
  issues: function () {
    return Issues.find({
        "issueDocument.open": true,
        "issueDocument.hasProjectLabel": true
    }, { $sort: { "issueDocument.updatedAt": -1 } });
  }
});
