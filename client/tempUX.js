Template.currentIssues.helpers({
  issues: function () {
    return Issues.find({
        "issueDocument.open": true,
        "issueDocument.hasProjectLabel": false
    }, { $sort: { "lastMessage.timestamp": 1 } });
  }
});

Template.labeledIssues.helpers({
  issues: function () {
    return Issues.find({
        "issueDocument.open": true,
        "issueDocument.hasProjectLabel": true
    }, { $sort: { "lastMessage.timestamp": 1 } });
  }
});
