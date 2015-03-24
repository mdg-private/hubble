Template.registerHelper('showTimestamp', function (then) {
  // From glasser:reactive-fromnow.
  return ReactiveFromNow(then, {
    // Show absolute dates for things more than 10 days ago.
    maxRelativeMs: 1000*60*60*24*10,
    // We don't care about time for old things, just date.
    absoluteFormat: 'YYYY-MMM-DD'
  });
});
