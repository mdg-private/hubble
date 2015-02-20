Template.logo.helpers({
  circles: function () {
    return [
      { x: 24, y: 15, r: 11 },
      { x: 16, y: 24, r: 8 },
      { x: 10, y: 30, r: 6 }
    ];
  }
});

Template.navbar.helpers({
  labels: function () {
    return ! (Router.current().route.path() === "/unlabeled");
    return true;
  }
});

Template.navbar.events({
  'click .navbar-link': function () {
    Router.go("/unlabeled");
  }
});
