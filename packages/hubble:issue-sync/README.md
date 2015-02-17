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
  - createdAt: Date (from String)
  - closedAt: Date (from String)
  - updatedAt: Date (from String)
- issueEtag
- snoozes: Array of Object
  - when: Date
  - login
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
- lastMessage: Object
  - timestamp: created_at (for creation) or comment created_at (for comment) or githubble-generated timestamp (for snooze)
  - userId: Number
  - type: 'created'/'commented'/'snoozed'
