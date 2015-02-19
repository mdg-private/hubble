var Future = Npm.require('fibers/future');

P.async = Npm.require('async');

// Need this to enable async.waterfall.
var savedAsyncSetImmediate = P.async.setImmediate;
P.async.setImmediate = function (fn) {
  savedAsyncSetImmediate(Meteor.bindEnvironment(fn));
};

P.asyncMethod = function (name, body) {
  var m = {};
  m[name] = function () {
    var self = this;
    var f = new Future;
    var args = _.toArray(arguments);
    args.push(f.resolver());
    body.apply(self, args);
    return f.wait();
  };
  Meteor.methods(m);
};
