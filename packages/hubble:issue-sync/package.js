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
  github: '0.2.3'
});

Package.onUse(function(api) {
  api.use('check');
  api.use('mongo');
  api.addFiles('server.js', 'server');
  api.addFiles('hubble:issue-sync.js');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('hubble:issue-sync');
  api.addFiles('hubble:issue-sync-tests.js');
});
