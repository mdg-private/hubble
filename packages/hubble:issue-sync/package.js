Package.describe({
  name: 'hubble:issue-sync',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Npm.depends({
  github: '0.2.3',
  async: '0.9.0',
  'github-webhook-handler': 'https://github.com/meteor/github-webhook-handler/tarball/76879a0f2e5eaaa0ba3cbc54715de23a0b3f9984'
});

Package.onUse(function(api) {
  api.use(['check', 'mongo', 'webapp', 'underscore']);
  api.addFiles('server.js', 'server');
  api.addFiles('hubble:issue-sync.js');
  api.export('Issues');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('hubble:issue-sync');
  api.addFiles('hubble:issue-sync-tests.js');
});
