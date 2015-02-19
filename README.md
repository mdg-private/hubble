# githubble

A tool for triaging GitHub issues.

## Dev setup

You can just run it with Meteor run... but you really want a GitHub access token
so that you can make 5000 API queries/hr instead of 60.  And if you want
immediate updates, you have to set up webhooks too.

### GitHub access token

Go to https://github.com/settings/applications and create a "personal access
token" with **NO SCOPES** (ie, *UNCHECK ALL THE SCOPE BOXES*). That will give
you a hex string which is your access token.  Put it in the `$GITHUB_TOKEN`
environment variable when running Meteor locally.  Note that GitHub will only
give you this token once; it's your job to remember it (or make a new one).

### GitHub webhook setup

First, you'll want to expose your local Meteor app to the internet (exciting!)

Download and install ngrok from https://ngrok.com/

Run it as `ngrok 3000`: this will create a tunnel from a subdomain of ngrok.com
to your localhost:3000, and print the link.  (You may want to make sure you have
a dark background for your terminal.)

Now set up a webhook that points to this URL. Go to https://github.com/meteor/meteor/settings/hooks and click "Add webhook".

- Set the payload URL to https://whateverngroksaid.ngrok.com/webhook"
- Keep Content type as `application/json`
- Set the secret to a random string (eg `openssl rand -hex 20`), which you should
  also set in `$GITHUB_WEBHOOK_SECRET` when you run it (this part is optional
  for local dev, but a good idea since otherwise anyone on the internet can
  send you webhooks and insert random stuff into your database)
- "Let me select individual events", and choose three events: Issues, Issue
  Comment, and Pull request
- "Add webhook"

## Production setup

Uses a Compose (formerly MongoHQ) MongoDB 2.6 installation, so that we get 2.6
and oplog access.  Log in to https://app.compose.io/ with the username/password
in LastPass (under mongohq). It's the githubble deployment. I created a database
called githubble, deleted the default user, and created another user in it with
a random password.

I generated a random string for the webhook secret and a personal access token
(for glasser) for the token.

The token, secret, and Mongo URLs are in a settings.json in LastPass (we use
settings instead of environment variables). So you don't need to specify
`--settings` on every deploy.

Note that the oplog URL needs to be on the `local` database (ie the URL path is
`local`) and specify `&authSource=githubble` (ie it gets its authentication from
the main `githubble` database).

