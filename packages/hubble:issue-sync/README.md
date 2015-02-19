# hubble:issue-sync

Syncs GitHub issues into MongoDB database.

## Schema

User always looks like an object with:
  - login: String
  - id: Number
  - avatarUrl: String
  - url: String
  - htmlUrl: String

Issue:
- repoOwner: String `meteor`
- repoName: String `meteor`
- issueDocument: (from GitHub)
  - id: Number
  - url: String
  - htmlUrl: String
  - number: Number
  - open: Boolean (from String (open/closed))
  - title: String
  - body: String (Markdown)
  - user: User
  - labels: Array of Objects
    - url: String
    - name: String
    - color: String
  - hasProjectLabel: Boolean (from labels)
  - assignee: optional User
  - commentCount: Number
  - milestone: optional Object
    - url: String
    - number: Number
    - open: Boolean (from String open/closed)
    - title: String
    - description: String
  - pullRequest: optional Object
    - url: String
    - diffUrl: String
    - htmlUrl: String
    - patchUrl: String
  - closedBy: optional User
  - createdAt: Date (from String)
  - closedAt: Date (from String)
  - updatedAt: Date (from String)
- snoozes: Array of Object
  - when: Date
  - login: String
  - id: Number (github user id)
- highlyActive: Boolean
- highlyActiveToggleDates: [Date] (push when toggled)
- comments: Map
  - key: created_at STRING + '!' + id
  - value: Object
    - id: Number
    - url: String
    - htmlUrl: String
    - body: String
    - user: User
    - createdAt: Date (from String)
    - updatedAt: Date (from String)
- recentComments*: Map
  This is a subset of comments containing comments since the last
  MDG comment or snooze, for issues that have any response at all.
- recentCommentsCount*: Number
- msSpentInNew*: Number
- status*:
  - mystery -- we've recorded comments for this but we haven't recorded
    issue metadata. (Probably never publish these!)
  - new -- no MDG opener/commenter and not
    (closed-and-only-commented-on-by-original-user)
  - stirring -- exists at least one MDG opener/comment, closed, and last
    opener/comment/snooze is non-MDG, and not highlyActive
  - active -- exists at least one MDG opener/comment, open, and last
    opener/comment/snooze is non-MDG, and not highlyActive
  - highly-active -- exists at least one MDG opener/comment and has highlyActive set
  - triaged -- exists at least one MDG opener/comment, and last opener/comment/snooze
    is MDG, and open, and not highlyActive
  - closed -- closed and not highlyActive and either
    (closed-and-only-commented-on-by-original-user) or the last opener/comment/snooze is MDG

`*` means "derived deterministically from other values on the document (plus
list of MDG members)".
