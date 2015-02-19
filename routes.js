Router.configure({
  layoutTemplate: "hello"
});

Router.route('/', function () {
  this.layout("hello");
  this.render("generic");
});

var setTag = function (tag) {
  Session.set("labelFilter", tag);
};

var setStates = function (states) {
  var selected = states.split("&");
  _.each(selected, function (state) {
      States.update({ tag: state }, {$set: { selected: true }});
   });
};

Router.route('/states/:_states', function () {
  this.layout("hello");
  setStates(this.params._states);
  this.render("generic");
}, 'client');


Router.route('/filter/:_tag', function () {
  this.layout("hello");
  setTag(this.params._tag);
  this.render("generic");
}, 'client');


Router.route('/states/:_states/filter/:_tag', function () {
  this.layout("hello");
  setStates(this.params._states);
  setTag(this.params._tag);
  this.render("generic");
}, 'client');
