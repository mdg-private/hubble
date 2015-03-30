// Usage:
//   if (P.asyncCheck(v, p, cb)) return;
// It does not call cb on success.
P.asyncErrorCheck = function (value, pattern, cb) {
  try {
    check(value, pattern);
  } catch (e) {
    if (! (e instanceof Match.Error))
      throw e;
    console.log("FAILED CHECK", value)
    cb(e);
    return true;
  }
  return false;
};

// Always calls cb, either with error or with value. Good for a step in
// async.waterfall.
P.asyncCheck = function (value, pattern, cb) {
  try {
    check(value, pattern);
  } catch (e) {
    if (! (e instanceof Match.Error))
      throw e;
    console.log("FAILED CHECK", value)
    cb(e);
    return;
  }
  cb(null, value);
};

var maybeNull = function (pattern) {
  return Match.OneOf(null, pattern);
};

var timestampMatcher = Match.Where(function (ts) {
  check(ts, String);
  return ts.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

P.Match = {};

// Matcher for User coming from GitHub's API (slightly different from our
// internal schema!)
P.Match.User = Match.ObjectIncluding({
  login: String,
  id: Match.Integer,
  url: String,
  avatar_url: String,
  html_url: String
});

// Matcher for Issue coming from GitHub's API (slightly different from our
// internal schema!)
P.Match.Issue = Match.ObjectIncluding({
  id: Match.Integer,
  url: String,
  html_url: String,
  number: Match.Integer,
  state: Match.OneOf('open', 'closed'),
  title: String,
  body: String,
  user: P.Match.User,
  labels: [
    Match.ObjectIncluding({
      url: String,
      name: String,
      color: String
    })
  ],
  assignee: maybeNull(P.Match.User),
  // closed_by does not appear at all in bulk issue lists, only in individual
  // issue gets. dunno why.  Also it is null if the closing user is a deleted
  // user.
  closed_by: Match.Optional(maybeNull(P.Match.User)),
  comments: Match.Integer,
  milestone: maybeNull(Match.ObjectIncluding({
    url: String,
    number: Number,
    state: Match.OneOf('open', 'closed'),
    title: String,
    description: maybeNull(String)
  })),
  pull_request: Match.Optional({  // not maybeNull!
    url: String,
    diff_url: String,
    html_url: String,
    patch_url: String
  }),
  created_at: timestampMatcher,
  closed_at: maybeNull(timestampMatcher),
  updated_at: timestampMatcher
});

// Matcher for Comment coming from GitHub's API (slightly different from our
// internal schema!)
P.Match.Comment = Match.ObjectIncluding({
  id: Match.Integer,
  url: String,
  html_url: String,
  issue_url: String,  // we parse this but don't save it
  body: String,
  body_html: String,
  user: P.Match.User,
  created_at: timestampMatcher,
  updated_at: timestampMatcher
});

// Matcher for Repository coming from GitHub's API (different from our internal
// schema!)
P.Match.Repository = Match.ObjectIncluding({
  owner: Match.ObjectIncluding({
    login: String
  }),
  name: String
});
