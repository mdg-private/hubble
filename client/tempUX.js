Template.currentIssues.helpers({
  issues: function () {
    return Issues.find({"issueDocument.closedAt": null});
  }
});
