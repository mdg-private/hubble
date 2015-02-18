// Figure out the right font color for this label. For darker backgrounds, we
// want to use white, but otherwise use black.
var highContrastFontColor = function (color) {
  if (! color.match(/00/g)) {
    return "002";
  }
  return "fff";
};

Template.label.helpers({
  fontColor: function () {
    return highContrastFontColor(this.color);
  }
});
