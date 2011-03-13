/**
 * The range map activity.
 * 
 * @constructor
 */
mol.activity.RangeMapActivity = function(view) {
    if (!(this instanceof mol.activity.RangeMapActivity)) {
        return new mol.activity.RangeMapActivity(view);
    }
    var self = this;
    this.view = view;
    mol.eventBus.bind('gbif-points-event', 
                      function(json, id) {
                          self.view.renderPoints(json, id); 
                      });
    mol.eventBus.bind('rangemap-metadata-event', 
                      function(json, id) {
                          self.view.addRangeMap(json);
                      });                                          
    return this;
};

/**
 * Goes to a place that is provided by the controller.
 * 
 * @param place The place object to go to
 */
mol.activity.RangeMapActivity.prototype.go = function(place) {
    // NOOP
};
