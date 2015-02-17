Template.currentIssues.helpers({
  issues: function () {
    return Issues.find({
        "issueDocument.closedAt": null,
        "issueDocument.hasProjectLabel": false
    }, { $sort: { "lastMessage.timestamp": 1 } });
  }
});

Template.labeledIssues.helpers({
  issues: function () {
    return Issues.find({
        "issueDocument.closedAt": null,
        "issueDocument.hasProjectLabel": true
    }, { $sort: { "lastMessage.timestamp": 1 } });
  }
});
