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
- needsResponses: Array of Object
  - when: Date
  - login: String
  - id: Number (github user id)
- highlyActive: Boolean
- highlyActiveLog: Array of Object
  - when: Date
  - login: String
  - id: Number (github user id)
  - setTo: Boolean
- comments: Map
  - key: created_at STRING + '!' + id
  - value: Object
    - id: Number
    - url: String
    - htmlUrl: String
    - body: String
    - bodyHtml: String,
    - user: User
    - createdAt: Date (from String)
    - updatedAt: Date (from String)
- manuallyMarkedAsResponded: Boolean
  Needs to be manually set on the database.  This allows an issue
  to transition out of 'unresponded' despite not actually being responded
  to.  In March 2015 it was added to all unresponded issues that had had
  no actions in 2015 (all of these issues were also closed). It's effectively
  equivalent to "opened by team member".
- recentComments*: Map
  This is a subset of comments containing comments since the last
  MDG comment or snooze, for issues that have any response at all.
- recentCommentsCount*: Number
- msSpentInNew*: Number
- canBeSnoozed*: Boolean
- lastUpdateOrComment*: Date
- status*:
  In the following, "Responded" means that the issue was opened by a team
  member, or there is comment by a team member, or the manuallyMarkedAsResponded
  flag is set.
  - mystery -- we've recorded comments for this but we haven't recorded
    issue metadata. (Probably never publish these!)
  - unresponded -- one of the following:
    - not Responded
    - there has been a "needs response" with no MDG comment or snooze since
      then
  - active -- *open* and Responded and not highlyActive and last
    opener/comment/snooze is non-MDG, and no overriding needsResponse
  - stirring -- *closed* and Responded and not highlyActive and last
    opener/comment/snooze is non-MDG, and no overriding needsResponse
  - triaged -- *open* and Responded and not highly Active and last
    opener/comment/snooze is MDG, and no overriding needsReponse
  - resolved -- *closed* and Responded and not highly Active and last
    opener/comment/snooze is MDG, and no overriding needsReponse
  - highly-active -- Responded and has highlyActive set

`*` means "derived deterministically from other values on the document (plus
list of MDG members)".
