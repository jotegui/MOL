function mol() {
    var args = Array.prototype.slice.call(arguments),
        callback = args.pop(),
        modules = (args[0] && typeof args[0] === "string") ? args : args[0],        
        i,
        m,
        mod,
        submod;

    if (!(this instanceof mol)) {
        return new mol(modules, callback);
    }
   
    if (!modules || modules === '*') {
        modules = [];
        for (i in mol.modules) {
            if (mol.modules.hasOwnProperty(i)) {
                modules.push(i);
            }
        }
    }

    for (i = 0; i < modules.length; i += 1) {
        m = modules[i];
        mol.modules[m](this);            
        if (this[m].hasOwnProperty('submodules')) {
             for (submod in this[m].submodules) {
                 mol.modules[m][this[m]['submodules'][submod]](this);
             }
         }
    }

    callback(this);
    return this;
};

mol.modules = {};

mol.modules.common = function(mol) {

    mol.common = {};
    
    mol.common.assert = function(pred, msg) {
        if (!pred) {
            throw("Assertion failed: {0}".format(msg));
        }
    };
};

/**
 * https://gist.github.com/1049426
 * 
 * Usage: 
 * 
 *   "{0} is a {1}".format("Tim", "programmer");
 * 
 */
String.prototype.format = function(i, safe, arg) {
  function format() {
      var str = this, 
          len = arguments.length+1;
      
      for (i=0; i < len; arg = arguments[i++]) {
          safe = typeof arg === 'object' ? JSON.stringify(arg) : arg;
          str = str.replace(RegExp('\\{'+(i-1)+'\\}', 'g'), safe);
      }
      return str;
  }
  format.native = String.prototype.format;
  return format;
}();
/**
 * This module provides core functions.
 */
mol.modules.core = function(mol) {

    mol.core = {};

    /**
     * Retunrs a layer id string given a layer {name, type, source, englishname}.
     */
    mol.core.getLayerId = function(layer) {
        var name = $.trim(layer.name.toLowerCase()).replace(/ /g, "_"),
            type = $.trim(layer.type.toLowerCase()).replace(/ /g, "_"),
            source = $.trim(layer.source.toLowerCase()).replace(/,/g, "").replace(/ /g, "_"),
            dataset_id = $.trim(layer.dataset_id).replace(/,/g, "").replace(/ /g, "_");

        return 'layer--{0}--{1}--{2}--{3}'.format(name, type, source, dataset_id);
    };
}
mol.modules.bus = function(mol) {

    mol.bus = {};
    
    mol.bus.Event = Class.extend(
        {
            init: function(type, params) {
                mol.common.assert(type);
                this.type = type;
                if (params) {
                    _.extend(this, params);   
                }
            }
        }
    );

    mol.bus.Bus = function() {

        if (!(this instanceof mol.bus.Bus)) {
            return new mol.bus.Bus();
        }
        _.extend(this, Backbone.Events);

        this.fireEvent = function(event) {
            this.trigger(event.type, event);
        };

        this.addHandler = function(type, handler) {
            this.bind(
                type, 
                function(event) {
                    handler(event);
                }
            );
        };
        return this;
    };
};
mol.modules.mvp = function(mol) {
    
    mol.mvp = {};

    mol.mvp.Model = Class.extend(
        {           
            init: function(props) {
                this.props = props;
            },

            get: function(name) {
                return this.props[name];
            },

            json: function() {
                return JSON.stringify(this.props);
            }
        }
    );
    
    mol.mvp.Engine = Class.extend(
        {
            start: function(container) {
            },
            
            go: function(place) {
            },
            
            state: function() {
            }
        }
    );

    mol.mvp.View = Class.extend(
        {
            init: function(element, parent) {
                if (!element) {
                    element = '<div>';
                }
                _.extend(this, $(element));
                this.element = this[0];
                if (parent) {
                    $(parent).append(this.element);
                }
            }
        }
    );

    mol.mvp.Display = mol.mvp.View.extend(
        {
            init: function(element, parent) {
                this._super(element, parent);
            },

            engine: function(engine) {
                this.engine = engine;
            }
        }
    );
};mol.modules.services = function(mol) {
  
    mol.services = {};

    mol.services.submodules = ['cartodb'];

    mol.services.Action = Class.extend(
        {
            init: function(type, params) {
                mol.common.assert(type);
                this.type = type;
                if (params) {
                    _.extend(this, params);   
                }
            }
        }
    );

    mol.services.Callback = Class.extend(
        {
            /**
             * The success callback function takes as parameters the result
             * object and the action.
             * 
             * The failure callback function takes as parameters the error
             * result object and the action.
             *
             * @param success a callback function handling success
             * @param failure a callback function handling failure
             */
            init: function(success, failure) {
                this.success = success;
                this.failure = failure;
            }
        }
    );

    mol.services.Proxy = Class.extend(
        {
            /**
             * @param bus mol.bus.Bus
             */
            init: function(bus) {
                this.bus = bus;
            },
            
            /**
             * The callback here takes the action and the response as parameters.
             * 
             * @param action the mol.services.Action
             * @param callback the mol.services.Callback
             */
            execute: function(action, callback) {
                var cartodb = mol.services.cartodb;

                switch (action.type) {
                    case 'cartodb-sql-query':
                    cartodb.query(action.key, action.sql, this.callback(action, callback));
                    break;
                }
            },

            /**
             * Returns a proxy callback clousure around the clients action and 
             * the clients callback. This gets executed by the service. The 
             * services are expected to pass the service response to the callback 
             * as a single parameter.
             * 
             * @param action the client mol.services.Action
             * @param callback the client mol.services.Callback
             */
            callback: function(action, callback) {
                var self = this;

                return new mol.services.Callback(
                    function(response) { // Success.
                        callback.success(action, response);
                        self.fireEvents(action, response);
                    },
                    function (response) { // Failure.
                        callback.failure(action, response);
                        self.fireEvents(action, response, true);
                    }
                );
            },

            fireEvents: function(action, response, error) {
                var params = {
                        action: action, 
                        response:response, 
                        error:  error ? true : false
                    },
                    event = new mol.bus.Event(action.type, params);
                                  
                this.bus.fireEvent(event);
            }                
        }
    );
};
mol.modules.services.cartodb = function(mol) {
    mol.services.cartodb = {};
    mol.services.cartodb.SqlApi = Class.extend(
        {
            init: function() {          
                this.jsonp_url = '' +
                    'http://d3dvrpov25vfw0.cloudfront.net/' +
                    'api/v2/sql?callback=?&q={0}';
            }
        }
    );
    mol.services.cartodb.TileApi = Class.extend(
        {
            init: function() {          
                this.host = '' +
                    'd3dvrpov25vfw0.cloudfront.net';
            }
        }
    );
    mol.services.cartodb.sqlApi = new mol.services.cartodb.SqlApi();
    mol.services.cartodb.tileApi = new mol.services.cartodb.TileApi();
};
mol.modules.map = function(mol) {

    mol.map = {};

    mol.map.submodules = [
            'search',
            'results',
            'layers',
            'tiles',
            'menu',
            'loading',
            'dashboard',
            'query',
            'basemap',
            'metadata',
            'splash',
            'styler',
            'help',
            'status',
            'images',
            'boot'
    ];

    mol.map.MapEngine = mol.mvp.Engine.extend(
        {
            init: function(api, bus) {
                this.api = api;
                this.bus = bus;
            },

            start: function(container) {
                this.display = new mol.map.MapDisplay('.map_container');
                this.addControls();
                this.addEventHandlers();
            },

            go: function(place) {
            },

            place: function() {
            },
            addControls: function() {
                var map = this.display.map,
                    controls = map.controls,
                    c = null,
                    ControlPosition = google.maps.ControlPosition,
                    ControlDisplay = mol.map.ControlDisplay;

                // Add top right map control.
                this.ctlRight = new ControlDisplay('RightControl');
                controls[ControlPosition.TOP_RIGHT].clear();
                controls[ControlPosition.TOP_RIGHT].push(this.ctlRight.element);

                // Add top center map control.
                this.ctlTop = new ControlDisplay('CenterTopControl');
                controls[ControlPosition.TOP_CENTER].clear();
                controls[ControlPosition.TOP_CENTER].push(this.ctlTop.element);

                // Add top left map control.
                this.ctlLeft = new ControlDisplay('TopLeftControl');
                controls[ControlPosition.TOP_LEFT].clear();
                controls[ControlPosition.TOP_LEFT].push(this.ctlLeft.element);

                // Add left center map control.
                this.ctlLeftCenter = new ControlDisplay('LeftCenterControl');
                controls[ControlPosition.LEFT_CENTER].clear();
                controls[ControlPosition.LEFT_CENTER].push(this.ctlLeftCenter.element);


                // Add bottom left map control.
                this.ctlLeftBottom = new ControlDisplay('LeftBottomControl');
                controls[ControlPosition.BOTTOM_LEFT].clear();
                controls[ControlPosition.BOTTOM_LEFT].push(this.ctlLeftBottom.element);

                // Add bottom center map control.
                this.ctlBottomCenter = new ControlDisplay('BottomCenterControl');
                controls[ControlPosition.BOTTOM_CENTER].clear();
                controls[ControlPosition.BOTTOM_CENTER].push(this.ctlBottomCenter.element);

                // Add bottom right map control.
                this.ctlRightBottom = new ControlDisplay('RightBottomControl');
                controls[ControlPosition.RIGHT_BOTTOM].clear();
                controls[ControlPosition.RIGHT_BOTTOM].push(this.ctlRightBottom.element);

            },
            /**
             * Gets the control display at a Google Map control position.
             *
             * @param position google.maps.ControlPosition
             * @return mol.map.ControlDisplay
             */
            getControl: function(position) {
                var ControlPosition = google.maps.ControlPosition,
                    control = null;

                switch (position) {
                case ControlPosition.TOP_RIGHT:
                    control = this.ctlRight;
                    break;
                case ControlPosition.TOP_CENTER:
                    control = this.ctlTop;
                    break;
                case ControlPosition.TOP_LEFT:
                    control = this.ctlLeft;
                    break;
                case ControlPosition.LEFT_CENTER:
                    control = this.ctlLeftCenter;
                    break;
                case ControlPosition.LEFT_BOTTOM:
                    control = this.ctlLeftBottom;
                    break;
                case ControlPosition.RIGHT_BOTTOM:
                    control = this.ctlRightBottom;
                    break;
                case ControlPosition.BOTTOM_CENTER:
                    control = this.ctlBottomCenter;
                    break;
                }

                return control;
            },

            addEventHandlers: function() {
                var self = this;

                google.maps.event.addListener(
                    self.display.map,
                    "zoom_changed",
                    function() {
                        self.bus.fireEvent(new mol.bus.Event('map-zoom-changed'));
                    }
                );
                google.maps.event.addListener(
                    self.display.map,
                    "center_changed",
                    function() {
                        self.bus.fireEvent(new mol.bus.Event('map-center-changed'));
                    }
                );
                google.maps.event.addListener(
                    self.display.map,
                    "idle",
                    function () {
                        self.bus.fireEvent(new mol.bus.Event('map-idle'));
                    }
                );
                /**
                 * The event.overlays contains an array of overlays for the map.
                 */
                this.bus.addHandler(
                    'add-map-overlays',
                    function(event) {
                        _.each(
                            event.overlays,
                            function(overlay) {
                                self.display.map.overlayMapTypes.push(overlay);
                             },
                            self
                        );
                    }
                );
                this.bus.addHandler(
                    'register-list-click',
                    function(event) {
                            google.maps.event.addListener(
                            self.display.map,
                            "click",
                            function(event) {
                                var params = {
                                    gmaps_event : event,
                                    map : self.display.map}
                                self.bus.fireEvent(
                                    new mol.bus.Event(
                                        'species-list-query-click',
                                        params));
                            }
                        );
                    }
                );
                /*
                 *  Turn on the loading indicator display when zooming
                 */
                this.bus.addHandler(
                        'map-zoom-changed',
                        function() {
                           self.bus.fireEvent(new mol.bus.Event('show-loading-indicator',{source : "map"}));
                        }
                );
                 /*
                 *  Turn on the loading indicator display when moving the map
                 */
                this.bus.addHandler(
                        'map-center-changed',
                        function() {
                           self.bus.fireEvent(new mol.bus.Event('show-loading-indicator',{source : "map"}));
                        }
                );
                /*
                 *  Turn off the loading indicator display if there are no overlays, otherwise tie handlers to map tile img elements.
                 */
                this.bus.addHandler(
                        'map-idle',
                        function() {
                            self.bus.fireEvent(new mol.bus.Event('hide-loading-indicator',{source : "map"}));
                            if (self.display.map.overlayMapTypes.length > 0) {
                                //self.bus.fireEvent(new mol.bus.Event('show-loading-indicator',{source : "overlays"}));
                                /*$("img",self.display.map.overlayMapTypes).imagesLoaded (
                                    function(images, proper, broken) {
                                        self.bus.fireEvent( new mol.bus.Event('hide-loading-indicator',{source : "overlays"}));
                                    }
                                 );*/
                            }
                        }
                );

                this.bus.addHandler(
                    'add-map-control',

                    /**
                     * Callback that adds a map control display in a specified
                     * slot. The event is expected to have the following
                     * properties:
                     *
                     *   event.display - mol.map.ControlDisplay
                     *   event.slot - mol.map.ControlDisplay.Slot
                     *   event.position - google.maps.ControlPosition
                     *
                     * @param event mol.bus.Event
                     */
                    function(event) {
                        var display = event.display,
                            slot = event.slot,
                            position = event.position,
                            control = self.getControl(position);

                        control.slot(display, slot);
                    }
                );
            }
        }
    );

    mol.map.MapDisplay = mol.mvp.View.extend(
        {
            init: function(element) {
                var mapOptions = null;

                this._super(element);

                mapOptions = {
                    zoom: 3,
                    maxZoom: 10,
                    minZoom: 2,
                    minLat: -85,
                    maxLat: 85,
                    mapTypeControl: false,
                    panControl: false,
                    zoomControl: true,
                    streetViewControl: false,
                    mapTypeId: google.maps.MapTypeId.ROADMAP,
                    styles:[ 
                        {
                            "stylers" : [{
                                "saturation" : -65
                            }, {
                                "gamma" : 1.52
                            }]
                        }, {
                            "featureType" : "administrative",
                            "stylers" : [{
                                "saturation" : -95
                            }, {
                                "gamma" : 2.26
                            }]
                        }, {
                            "featureType" : "water",
                            "elementType" : "labels",
                            "stylers" : [{
                                "visibility" : "off"
                            }]
                        }, {
                            "featureType" : "administrative.locality",
                            "stylers" : [{
                                "visibility" : "off"
                            }]
                        }, {
                            "featureType" : "road",
                            "stylers" : [{
                                "visibility" : "simplified"
                            }, {
                                "saturation" : -99
                            }, {
                                "gamma" : 2.22
                            }]
                        }, {
                            "featureType" : "poi",
                            "elementType" : "labels",
                            "stylers" : [{
                                "visibility" : "off"
                            }]
                        }, {
                            "featureType" : "road.arterial",
                            "stylers" : [{
                                "visibility" : "off"
                            }]
                        }, {
                            "featureType" : "road.local",
                            "elementType" : "labels",
                            "stylers" : [{
                                "visibility" : "off"
                            }]
                        }, {
                            "featureType" : "transit",
                            "stylers" : [{
                                "visibility" : "off"
                            }]
                        }, {
                            "featureType" : "road",
                            "elementType" : "labels",
                            "stylers" : [{
                                "visibility" : "off"
                            }]
                        }, {
                            "featureType" : "poi",
                            "stylers" : [{
                                "saturation" : -55
                            }]
                        }
                    ]
                };

                this.map = new google.maps.Map(this.element, mapOptions);
            }
        }
    );

    /**
     * This display is a container with support for adding composite displays in
     * a top, middle, and bottom slot. It gets attached to a map control positions.
     *
     */
    mol.map.ControlDisplay = mol.mvp.View.extend(
        {
            /**
             * @param name css class name for the display
             */
            init: function(name) {
                var Slot = mol.map.ControlDisplay.Slot,
                    className = 'mol-Map-' + name,
                    html = '' +
                    '<div class="' + className + '">' +
                        '<div class="TOP"></div>' +
                        '<div class="MIDDLE"></div>' +
                        '<div class="BOTTOM"></div>' +
                    '</div>';

                this._super(html);

                $(this).find(Slot.TOP).removeClass('ui-selectee');
                $(this).find(Slot.MIDDLE).removeClass('ui-selectee');
                $(this).find(Slot.BOTTOM).removeClass('ui-selectee');

            },

            /**
             * Puts a display in a slot.
             *
             * @param dislay mol.map.ControlDisplay
             * @param slot mol.map.ControlDisplay.Slot
             */
            slot: function(display, slot) {
                var Slot = mol.map.ControlDisplay.Slot,
                    slotDisplay = $(this).find(slot);

                switch (slot) {
                case Slot.FIRST :
                    this.prepend(display);
                    break;
                case Slot.LAST:
                    this.append(display);
                    break;
                default:
                    slotDisplay.append(display);
                }
            }
        }
    );

    mol.map.ControlDisplay.Slot = {
        FIRST: '.FIRST',
        TOP: '.TOP',
        MIDDLE: '.MIDDLE',
        BOTTOM: '.BOTTOM',
        LAST: '.LAST'
    };
};
mol.modules.map.loading = function(mol) {

    mol.map.loading = {};

    mol.map.loading.LoadingEngine = mol.mvp.Engine.extend(
    {
        init : function(proxy, bus) {
                this.proxy = proxy;
                this.bus = bus;
        },
        start : function() {
            this.addLoadingDisplay();
            this.addEventHandlers();
            this.cache = {};
        },
        /*
         *  Build the loading display and add it as a control to the top center of the map display.
         */
        addLoadingDisplay : function() {
            var event,
                params = {
                    display: null, // The loader gif display
                    slot: mol.map.ControlDisplay.Slot.TOP,
                    position: google.maps.ControlPosition.TOP_CENTER
                };
            
            this.loading = new mol.map.LoadingDisplay();
            params.display = this.loading;
            event = new mol.bus.Event('add-map-control', params);
            this.bus.fireEvent(event);
        },
        addEventHandlers : function () {
            var self = this;
           /*
            *  Turn off the loading indicator display
            */
            this.bus.addHandler(
                'hide-loading-indicator',
                function(event) {
                    var done = true;
                    self.cache[event.source] = "done";
                    _.each(
                        self.cache,
                        function(source) {
                             if(source === "loading") {
                                 done = false;
                             }
                        }
                    );
                    if (done === true) {
                        self.loading.hide();
                    }
                }
            );
           /*
            *  Turn on the loading indicator display
            */
            this.bus.addHandler(
                'show-loading-indicator',
                function(event) {
                    self.loading.show();
                    self.cache[event.source] = "loading";
                }
            );
        }
    }
    );

    /*
     *  Display for a loading indicator.
     *  Use jQuery hide() and show() to turn it off and on.
     */
    mol.map.LoadingDisplay = mol.mvp.View.extend(
    {
        init : function() {
            var className = 'mol-Map-LoadingWidget',
                html = '' +
                        '<div class="' + className + '">' +
                        '   <img src="static/loading.gif">' +
                        '</div>';
            this._super(html);
        }
    });
};
mol.modules.map.layers = function(mol) {

    mol.map.layers = {};

    mol.map.layers.LayerEngine = mol.mvp.Engine.extend({
        init: function(proxy, bus, map) {
            this.proxy = proxy;
            this.bus = bus;
            this.map = map;
            this.clickDisabled = false;
        },

        start: function() {
            this.display = new mol.map.layers.LayerListDisplay('.map_container');
            this.fireEvents();
            this.addEventHandlers();
            this.initSortable();
            this.display.toggle(false);
        },

        layersToggle: function(event) {
            var self = this,
                visible = event.visible;

            if (visible == this.display.expanded) {
                return;
            }
            if(this.display.expanded == true || visible == false) {
                $(self.display.styleAll).prop('disabled', false);
                $(self.display.styleAll).qtip('destroy');

                this.display.layersWrapper.animate(
                    {height: this.display.layersHeader.height()+18},
                    1000,
                      function() {
                        self.display.layersToggle.text('▼');
                        self.display.expanded = false;
                    }
                );


            } else {
                this.display.layersWrapper.animate(
                    {height:this.display.layersHeader.height()
                        +this.display.layersContainer.height()+35},
                    1000,
                    function() {
                        self.display.layersToggle.text('▲');
                        self.display.expanded = true;
                    }
                );

            }
        },

        addEventHandlers: function() {
            var self = this;

            this.display.removeAll.click (
                function(event) {
                    $(self.display.styleAll).prop('disabled', false);
                    $(self.display.styleAll).qtip('destroy');

                    $(self.display).find(".close").trigger("click");
                }
            );

            this.display.toggleAll.click (
                function(event) {
                    $(self.display.styleAll).prop('disabled', false);
                    $(self.display.styleAll).qtip('destroy');

                    _.each(
                        $(self.display).find(".toggle"),
                        function(checkbox){
                                checkbox.click({currentTarget : this})
                        }
                    );
                }
            );

            this.display.resetAll.click (
                function(event) {
                    $(self.display.styleAll).prop('disabled', false);
                    $(self.display.styleAll).qtip('destroy');

                    _.each(
                        self.display.layers,
                        function(layer) {
                            var l,
                                o;

                            //get original style
                            l = self.display.getLayer(layer);
                            o = self.parseLayerStyle(layer, "orig");

                            //update css
                            self.updateLegendCss(
                                $(l).find('.styler'),
                                o,
                                layer,
                                layer.orig_opacity
                            );

                            //update tiles
                            self.updateLayerStyle(
                                $(l).find('.styler'),
                                o,
                                layer,
                                layer.orig_opacity
                            );
                        }
                    );
                }
            );

            this.display.styleAll.click (
                function(event) {
                    var button = this,
                        baseHtml,
                        q;

                    baseHtml = '' +
                           '<div class="mol-LayerControl-Styler">' +
                           '  <div class="colorPickers">' +
                           '    <div class="colorPicker">' +
                           '      <span class="stylerLabel">Color:&nbsp</span>' +
                           '      <input type="text" id="allFill" />' +
                           '    </div>' +
                           '  </div>' +
                           '  <div class="buttonWrapper allStyler">' +
                           '    <button id="applyStyle">Apply</button>' +
                           '    <button id="cancelStyle">Cancel</button>' +
                           '  </div>' +
                           '</div>';

                    _.each(
                        self.display.layers,
                        function(layer) {
                            var l,
                                b;

                            l = self.display.getLayer(layer);
                            b = $(l).find('.styler');
                            $(b).qtip('destroy');
                        }
                    );

                    $(button).removeData('qtip');

                    q = $(button).qtip({
                        content: {
                            text: baseHtml,
                            title: {
                                text: 'Style All Layers',
                                button: false
                            }
                        },
                        position: {
                            at: 'left center',
                            my: 'right top'
                        },
                        show: {
                            event: 'click',
                            delay: 0,
                            ready: true,
                            solo: true
                        },
                        hide: false,
                        style: {
                            def: false,
                            classes: 'ui-tooltip-widgettheme'
                        },
                        events: {
                            render: function(event, api) {
                                var colors = ['black','white','red','yellow',
                                              'blue','green','orange','purple'],
                                    colors2 = ['#66C2A5','#FC8D62', '#8DA0CB',
                                               '#E78AC3', '#A6D854', '#FFD92F',
                                               '#E5C494'];

                                $("#allFill").spectrum({
                                      color: 'black',
                                      showPaletteOnly: true,
                                      palette: [colors, colors2]
                                });

                                $(api.elements.content)
                                    .find('#applyStyle').click(
                                        function(event) {
                                            var o = {},
                                                color;

                                            color = $('#allFill')
                                                        .spectrum("get")
                                                            .toHexString();

                                            o.fill = color;
                                            o.size = 1;
                                            o.border = color;
                                            o.s1 = color;
                                            o.s2 = color;
                                            o.s3 = color;
                                            o.s4 = color;
                                            o.s5 = color;

                                            _.each(
                                                self.display.layers,
                                                function(layer) {
                                                    var l;

                                                    l = self.display
                                                            .getLayer(layer);

                                                    //update css
                                                    self.updateLegendCss(
                                                        $(l).find('.styler'),
                                                        o,
                                                        layer,
                                                        0.5
                                                    );

                                                    //update tiles
                                                    self.updateLayerStyle(
                                                        $(l).find('.styler'),
                                                        o,
                                                        layer,
                                                        0.5
                                                    );
                                                }
                                            );

                                            $(button).prop('disabled', false);
                                            $(button).qtip('destroy');
                                        }
                                );

                                $(api.elements.content)
                                    .find('#cancelStyle').click(
                                        function(event) {
                                            $(button).prop('disabled', false);
                                            $(button).qtip('destroy');
                                        }
                                    );
                            },
                            show: function(event, api) {
                                $(button).prop('disabled', true);
                            }
                        }
                    });
                }
            );

            this.display.layersToggle.click(
                function(event) {
                    self.layersToggle(event);
                }
            );

            this.bus.addHandler(
                'layer-opacity',
                function(event) {
                    var layer = event.layer,
                        l = self.display.getLayer(layer),
                        opacity = event.opacity,
                        params = {},
                        e = null;

                    if (opacity === undefined) {
                        params = {
                            layer: layer,
                            opacity: parseFloat(l.find('.opacity')
                                .slider("value"))
                        },
                        e = new mol.bus.Event('layer-opacity', params);
                        self.bus.fireEvent(e);
                    }
                }
            );

            this.bus.addHandler(
                'add-layers',
                function(event) {
                    var bounds = null;
                    _.each(
                        event.layers,
                        function(layer) { // Removes duplicate layers.
                            if (self.display.getLayer(layer).length > 0) {
                                event.layers = _.without(event.layers, layer);
                            }
                        }
                    );
                    _.each(
                        event.layers,
                        function(layer) {
                            var extent,
                                layer_bounds;
                            try {
                                extent = $.parseJSON(layer.extent);
                                layer_bounds = new google.maps.LatLngBounds(
                                    new google.maps.LatLng(
                                        extent.sw.lat,extent.sw.lng
                                    ),
                                    new google.maps.LatLng(
                                        extent.ne.lat,extent.ne.lng
                                    )
                                );
                                if(!bounds) {
                                    bounds = layer_bounds;
                                } else {
                                    bounds.union(layer_bounds)
                                }

                            }
                            catch(e) {
                                //invalid extent
                            }
                        }
                    )
                    self.addLayers(event.layers);
                    if(bounds != null) {
                        self.map.fitBounds(bounds)
                    }
                }
            );

            this.bus.addHandler(
                'layer-display-toggle',
                function(event) {
                    var params = null,
                    e = null;

                    if (event.visible === undefined) {
                        self.display.toggle();
                        params = {visible: self.display.is(':visible')};
                    } else {
                        self.display.toggle(event.visible);
                    }
                }
            );

            this.bus.addHandler(
                'layers-toggle',
                function(event) {
                    self.layersToggle(event);
                }
            );

            this.bus.addHandler(
                'layer-click-toggle',
                function(event) {
                    self.clickDisabled = event.disable;

                    //true to disable
                    if(event.disable) {
                        self.map.overlayMapTypes.forEach(
                          function(mt) {
                              if(mt.interaction != undefined) {
                                  mt.interaction.remove();
                                  mt.interaction.clickAction = "";
                              }
                           }
                        );
                    } else {
                        _.any($(self.display.list).children(),
                            function(layer) {
                                if($(layer).find('.layer')
                                        .hasClass('selected')) {
                                    self.map.overlayMapTypes.forEach(
                                        function(mt) {
                                            if(mt.name == $(layer).attr('id')) {
                                                if(mt.interaction != undefined) {
                                                    mt.interaction.add();
                                                    mt.interaction.clickAction
                                                        = "full";
                                                }
                                            } else {
                                                if(mt.interaction != undefined) {
                                                    mt.interaction.remove();
                                                    mt.interaction.clickAction
                                                        = "";
                                                }
                                            }

                                        }
                                    );

                                    return true;
                                }
                            }
                        );
                    }
                }
            );
        },

        /**
         * Fires the 'add-map-control' event. The mol.map.MapEngine handles
         * this event and adds the display to the map.
         */
        fireEvents: function() {
            var params = {
                    display: this.display,
                    slot: mol.map.ControlDisplay.Slot.BOTTOM,
                    position: google.maps.ControlPosition.TOP_RIGHT
                },
                event = new mol.bus.Event('add-map-control', params);

            this.bus.fireEvent(event);
        },

        /**
         * Sorts layers so that they're grouped by name. Within each named
         * group, they are sorted by type_sort_order set in the types table.
         *
         * @layers array of layer objects {name, type, ...}
         */
        sortLayers: function(layers) {
            return _.flatten(
                _.groupBy(
                    _.sortBy(
                        layers,
                        function(layer) {
                            return layer.type_sort_order;
                        }
                    ),
                    function(group) {
                        return(group.name);
                    }
                 )
             );
        },

        /**
         * Adds layer widgets to the map. The layers parameter is an array
         * of layer objects {id, name, type, source}.
         */

        addLayers: function(layers) {
            var all = [],
                layerIds = [],
                sortedLayers = this.sortLayers(layers),
                wasSelected = this.display.find('.layer.selected'),
                o = {};

            _.each(
                sortedLayers,
                function(layer) {
                    var l = this.display.addLayer(layer),
                        self = this,
                        opacity = null;

                    self.bus.fireEvent(
                        new mol.bus.Event('show-layer-display-toggle')
                    );

                    //disable interactivity to start
                    self.map.overlayMapTypes.forEach(
                        function(mt) {
                            if(mt.interaction != undefined) {
                                mt.interaction.remove();
                                mt.interaction.clickAction = "";
                            }
                        }
                    );

                    //Hack so that at the end
                    //we can fire opacity event with all layers
                    all.push({layer:layer, l:l, opacity:opacity});

                    //style legends initially
                    o = self.parseLayerStyle(layer, "orig");

                    //initalize css
                    self.updateLegendCss(
                        $(l).find('.styler'),
                        o,
                        layer,
                        layer.orig_opacity
                    );

                    //Close handler for x button
                    //fires a 'remove-layers' event.
                    l.close.click(
                        function(event) {
                            var params = {
                                  layers: [layer]
                                },
                                e = new mol.bus.Event('remove-layers',  params);

                            self.bus.fireEvent(e);
                            l.remove();

                            //Hide the layer widget toggle in the main menu
                            //if no layers exist
                            if(self.map.overlayMapTypes.length == 0) {
                                self.bus.fireEvent(
                                    new mol.bus.Event(
                                        'hide-layer-display-toggle'));

                                $(self.display.styleAll)
                                    .prop('disabled', false);
                                $(self.display.styleAll).qtip('destroy');

                                self.display.toggle(false);
                            }
                            event.stopPropagation();
                            event.cancelBubble = true;
                        }
                    );
                    l.habitat.click(
                        function(event) {
                            self.displayHabitatClipping(this, layer);

                        }
                    )

                    //Click handler for zoom button
                    //fires 'layer-zoom-extent'
                    //and 'show-loading-indicator' events.
                    l.zoom.click(
                        function(event) {
                            var params = {
                                    layer: layer,
                                    auto_bound: true
                                },
                                extent = eval('({0})'.format(layer.extent)),
                                bounds = new google.maps.LatLngBounds(
                                            new google.maps.LatLng(
                                                extent.sw.lat,
                                                extent.sw.lng),
                                            new google.maps.LatLng(
                                                extent.ne.lat,
                                                extent.ne.lng));

                            if(!$(l.layer).hasClass('selected')){
                                l.layer.click();
                            }
                            self.map.fitBounds(bounds);

                            event.stopPropagation();
                            event.cancelBubble = true;
                        }
                    );

                    // Click handler for style toggle
                    l.styler.click(
                        function(event) {
                            _.each(
                                self.display.layers,
                                function(layer) {
                                    var l,
                                        b;

                                    l = self.display.getLayer(layer);
                                    b = $(l).find('.styler');
                                    $(b).prop('disabled', false);
                                    $(b).qtip('destroy');
                                }
                            );

                            self.displayLayerStyler(this, layer);

                            event.stopPropagation();
                            event.cancelBubble = true;
                        }
                    );

                    l.layer.click(
                        function(event) {
                            $(l.layer).focus();
                            if($(this).hasClass('selected')) {
                                $(this).removeClass('selected');

                                //unstyle previous layer
                                self.toggleLayerHighlight(layer,false);
                            } else {

                                if($(self.display)
                                        .find('.selected').length > 0) {
                                    //get a reference to this layer
                                    self.toggleLayerHighlight(
                                        self.display
                                            .getLayerById(
                                                $(self.display)
                                                    .find('.selected')
                                                        .parent()
                                                            .attr('id')),
                                                            false);
                                }

                                $(self.display).find('.selected')
                                    .removeClass('selected');

                                $(this).addClass('selected');

                                //style selected layer
                                self.toggleLayerHighlight(layer,true);
                            }

                            self.map.overlayMapTypes.forEach(
                                function(mt) {
                                    if(mt.name == layer.id &&
                                       $(l.layer).hasClass('selected')) {
                                        if(!self.clickDisabled) {
                                           mt.interaction.add();
                                           mt.interaction.clickAction = "full";
                                        } else {
                                           mt.interaction.remove();
                                           mt.interaction.clickAction = "";
                                        }
                                    } else {
                                        mt.interaction.remove();
                                        mt.interaction.clickAction = "";
                                    }
                                }
                            )
                            event.stopPropagation();
                            event.cancelBubble = true;
                        }
                    );
                    l.toggle.attr('checked', true);

                    // Click handler for the toggle button.
                    l.toggle.click(
                        function(event) {
                            var showing = $(event.currentTarget).is(':checked'),
                                params = {
                                    layer: layer,
                                    showing: showing
                                },
                                e = new mol.bus.Event('layer-toggle', params);

                            self.bus.fireEvent(e);
                            event.stopPropagation();
                            event.cancelBubble = true;
                        }
                    );
                    l.source.click(
                        function(event) {
                            self.bus.fireEvent(
                                new mol.bus.Event(
                                    'metadata-toggle',
                                    {params : {
                                        dataset_id: layer.dataset_id,
                                        title: layer.dataset_title
                                    }}
                                )
                            );
                            event.stopPropagation();
                            event.cancelBubble = true;
                        }
                    );
                    l.type.click(
                        function(event) {
                            self.bus.fireEvent(
                                new mol.bus.Event(
                                    'metadata-toggle',
                                    {params : {
                                        type: layer.type,
                                        title: layer.type_title
                                    }}
                                )
                            );
                            event.stopPropagation();
                            event.cancelBubble = true;
                        }
                    )
                    self.display.toggle(true);

                },
                this
            );

            // All of this stuff ensures layer orders are correct on map.
            layerIds = _.map(
                sortedLayers,
                function(layer) {
                    return layer.id;
                },
                this);

            this.bus.fireEvent(
                new mol.bus.Event(
                    'reorder-layers',
                    {layers:layerIds}
                )
            );

            if(sortedLayers.length == 1) {
                //if only one new layer is being added
                //select it
                this.display.list.find('.layer')
                    [this.display.list.find('.layer').length-1].click();
            } else if(sortedLayers.length > 1) {
                //if multiple layers are being added
                //layer clickability returned to the
                //previously selected layer
                if(wasSelected.length > 0) {
                    this.map.overlayMapTypes.forEach(
                        function(mt) {
                            if(mt.name == wasSelected.parent().attr("id")) {
                                mt.interaction.add();
                                mt.interaction.clickAction = "full";
                            } else {
                                mt.interaction.remove();
                                mt.interaction.clickAction = "";
                            }
                        }
                    );
                }
            }

            //done making widgets, toggle on if we have layers.
            if(layerIds.length>0) {
                this.layersToggle({visible:true});
            }
        },

        displayLayerStyler: function(button, layer) {
            var baseHtml,
                layer_curr_style,
                layer_orig_style,
                max,
                min,
                params = {
                    layer: layer,
                    style: null
                },
                q,
                self = this;

            layer_curr_style = self.parseLayerStyle(layer, "current");
            layer_orig_style = self.parseLayerStyle(layer, "orig");

            baseHtml = '' +
                   '<div class="mol-LayerControl-Styler ' +layer.source+ '">' +
                   '  <div class="colorPickers"></div>' +
                   '  <div class="sizerHolder"></div>' +
                   '  <div class="opacityHolder">' +
                   '    <span class="sliderLabel">Opacity:&nbsp</span>' +
                   '    <div class="sliderContainer">' +
                   '      <div class="opacity"></div>' +
                   '    </div>' +
                   '    <span id="opacityValue">50</span>' +
                   '  </div>' +
                   '  <div class="buttonWrapper">' +
                   '    <button id="applyStyle">Apply</button>' +
                   '    <button id="resetStyle">Reset</button>' +
                   '    <button id="cancelStyle">Cancel</button>' +
                   '  </div>' +
                   '</div>';

            $(button).removeData('qtip');

            q = $(button).qtip({
                content: {
                    text: baseHtml,
                    title: {
                        text: 'Layer Style',
                        button: false
                    }
                },
                position: {
                    at: 'left center',
                    my: 'right top'
                },
                show: {
                    event: 'click',
                    delay: 0,
                    ready: true,
                    solo: true
                },
                hide: false,
                style: {
                    def: false,
                    classes: 'ui-tooltip-widgettheme'
                },
                events: {
                    render: function(event, api) {
                        self.getStylerLayout(
                                $(api.elements.content)
                                    .find('.mol-LayerControl-Styler'),
                                layer);

                        self.setStylerProperties(
                                    api.elements.content,
                                    layer,
                                    layer_curr_style,
                                    layer_orig_style,
                                    false);

                        $(api.elements.content).find('#applyStyle').click(
                            function(event) {
                                var o = {};

                                if(layer.type == "range") {
                                    o.s1 = $('#showFill1Palette')
                                             .spectrum("get")
                                                .toHexString();
                                    o.s2 = $('#showFill2Palette')
                                             .spectrum("get")
                                                .toHexString();
                                    o.s3 = $('#showFill3Palette')
                                             .spectrum("get")
                                                .toHexString();
                                    o.s4 = $('#showFill4Palette')
                                             .spectrum("get")
                                                .toHexString();

                                    if(layer.source == "iucn") {
                                        o.s5 = $('#showFill5Palette')
                                             .spectrum("get")
                                                .toHexString();
                                    }
                                } else {
                                    o.fill = $('#showFillPalette')
                                            .spectrum("get")
                                                .toHexString();
                                }

                                o.border = $('#showBorderPalette')
                                                .spectrum("get")
                                                    .toHexString();
                                o.size = $(api.elements.content)
                                                .find('.sizer')
                                                    .slider('value');

                                self.updateLegendCss(
                                        button,
                                        o,
                                        layer,
                                        parseFloat($(api.elements.content)
                                            .find('.opacity')
                                                .slider("value")));

                                self.updateLayerStyle(
                                        button,
                                        o,
                                        layer,
                                        parseFloat($(api.elements.content)
                                            .find('.opacity')
                                                .slider("value"))
                                );

                                $(button).prop('disabled', false);
                                $(button).qtip('destroy');
                            }
                        );

                        $(api.elements.content)
                            .find('#resetStyle').click(
                                function(event) {
                                    self.setStylerProperties(
                                                    api.elements.content,
                                                    layer,
                                                    layer_orig_style,
                                                    layer_orig_style,
                                                    true);
                                }
                            );

                        $(api.elements.content)
                            .find('#cancelStyle').click(
                                function(event) {
                                    $(button).prop('disabled', false);
                                    $(button).qtip('destroy');
                                }
                            );
                    },
                    show: function(event, api) {
                        $(button).prop('disabled', true);
                    }
                }
            });
        },
        displayHabitatClipping: function(button, layer) {
            var baseHtml,
                params = {
                    layer: layer
                },
                q,
                self = this;


            baseHtml = '' +
                   '<div class="mol-LayerControl-Styler">' +
                        '<div class="habitats"></div>' +
                        '<br>' +
                        '<div>Choose source:' +
                            '<select class="mode">' +
                                '<option value="modis">MODIS MCD12Q1 V005</option>' +
                                '<option value="consensus">Consensus land cover</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="modis_year">Habitat from ' +
                            '<div>Choose Year' +
                                '<select class="year">' +
                                    '<option value="2001">2001</option>' +
                                    '<option value="2002">2002</option>' +
                                    '<option value="2003">2003</option>' +
                                    '<option value="2004">2004</option>' +
                                    '<option value="2005">2005</option>' +
                                    '<option value="2006">2006</option>' +
                                    '<option value="2007">2007</option>' +
                                 '</select>' +
                            '</div>' +
                        '</div>' +
                        '<div class="elevLabel">' +
                            'Elevation Range:<br>0m-10000m' +
                        '</div>' +
                        '<div class="elev"></div>' +
                        '<div class="buttonWrapper">' +
                            '<button class="apply">Apply</button>' +
                            '<button class="reset">Reset</button>' +
                            '<button class="cancel">Cancel</button>' +
                       '</div>' +
                   '</div>';

            $(button).removeData('qtip');

            q = $(button).qtip({
                content: {
                    text: baseHtml,
                    title: {
                        text: 'Habitat Preferences',
                        button: false
                    }
                },
                position: {
                    at: 'left center',
                    my: 'right top'
                },
                show: {
                    event: 'click',
                    delay: 0,
                    ready: true,
                    solo: true
                },
                hide: false,
                style: {
                    def: false,
                    classes: 'ui-tooltip-widgettheme'
                },
                events: {
                    render: function(event, api) {
                        self.setHabitatProperties(
                                    api.elements.content,
                                    layer,
                                    false);

                        $(api.elements.content).find('.apply').click(
                            function(event) {
                                var params = {
                                    layer: layer
                                };
                                params.layer.mode = 'ee';
                                params.layer.filter_mode =  $(api.elements.content).find('.mode').val();
                                self.bus.fireEvent(
                                    new mol.bus.Event('toggle-ee-filter',  params)
                                );
                            }
                        );

                        $(api.elements.content).find('.mode').change(
                            function(event) {
                                if($(this).val()=='modis') {
                                    $(api.elements.content).find('.modis_year')
                                        .show()
                                } else {
                                    $(api.elements.content).find('.modis_year')
                                        .hide()
                                }
                                self.setHabitatProperties(
                                    api.elements.content,
                                    layer,
                                    false);
                            }
                        );

                        $(api.elements.content)
                            .find('.reset').click(
                                function(event) {
                                    self.setHabitatProperties(
                                                    api.elements.content,
                                                    layer,
                                                    true);
                                }
                            );

                        $(api.elements.content)
                            .find('.cancel').click(
                                function(event) {
                                    $(button).prop('disabled', false);
                                    $(button).qtip('destroy');
                                }
                            );
                    },
                    show: function(event, api) {
                        $(button).prop('disabled', true);
                    }
                }
            });
        },
        setHabitatProperties: function(cont, layer,  reset) {
            var maxe, mine,
                mode = $(cont).find('.mode').val(),
                habitats= {
                    'modis' : {
                        1:'Evergreen Needleleaf Forests',
                        2:'Evergreen Broadleaf Forests',
                        3:'Deciduous Needleleaf Forests',
                        4:'Deciduous Broadleaf Forests',
                        5:'Mixed Forests',
                        6:'Closed Shrublands',
                        7:'Open Shrublands',
                        8:'Woody Savannas',
                        9:'Savannas',
                        10:'Grasslands',
                        11:'Permanent Wetlands',
                        12:'Cropland',
                        13:'Urban and Built-up',
                        14:'Cropland/Natural Vegetation Mosaics',
                        15:'Snow and Ice Barren',
                        16:'Barren',
                        17:'Water Bodies'},
                    'consensus' : {
                        1: 'Evergreen/deciduous needleleaf trees',
                        2: 'Evergreen broadleaf trees',
                        3: 'Deciduous broadleaf trees',
                        4: 'Mixed/other trees',
                        5: 'Shrubs',
                        6: 'Herbaceous vegetation',
                        7: 'Cultivated and managed vegetation',
                        8: 'Regularly flooded shrub/herbaceous vegetation',
                        9: 'Urban/built-up',
                        10: 'Snow/ice',
                        11: 'Barren lands/sparse vegetation',
                        12: 'Open water'
                    }
                },
                selectedHabitats ={
                    'modis' : [],
                    'consensus': []
                },
                self = this;
                //TODO make this more general ... probably going to have 
                // many different habitats pref types in future
                //if no modis habitat prefs, then select all.
                if(reset && (layer.modis_habitats == null)) {
                    selectedHabitats['modis'] = _.keys(habitats['modis']);
                } else if(reset || layer.selectedHabitats == undefined && layer.modis_habitats != null) {
                    selectedHabitats['modis'] = layer.modis_habitats.split(',');
                } else if(layer["selectedHabitats"]){
                    selectedHabitats['modis'] = layer.selectedHabitats['modis'];
                } else {
                    selectedHabitats['modis'] = _.keys(habitats['modis']);
                }

                //if no consensus prefs, then select all.
                if(reset && (layer.consensus_habitats == null)) {
                    selectedHabitats['consensus'] = _.keys(habitats['consensus']);
                } else if(reset || layer.selectedHabitats == undefined && layer.consensus_habitats != null) {
                    selectedHabitats['consensus'] = layer.consensus_habitats.split(',');
                } else if(layer["selectedHabitats"]){
                    selectedHabitats['consensus'] = layer.selectedHabitats['consensus'];
                } else {
                    selectedHabitats['consensus'] = _.keys(habitats['consensus']);
                }

                //attach habitat selection to the layer object
                layer.selectedHabitats = selectedHabitats;

                //if no elev prefs, then select all.
                if(reset && (layer.mine == null || layer.maxe == null)) {
                    selectedElev = [-500,9000];
                } else if(reset || layer.selectedElev == undefined && (layer.mine != null || layer.maxe != null) ) {
                    selectedElev = [layer.mine,layer.maxe];
                } else if(layer["selectedElev"]){
                    selectedElev = layer.selectedElev;
                } else {
                    selectedElev = [-500,9000];
                }
                layer.selectedElev = selectedElev;

                //Get the MODIS year.
                if(reset) {
                    selectedYear = '2001';
                } else if(layer["selectedYear"]){
                    selectedYear = layer.selectedYear;
                } else {
                    selectedYear = '2001';
                }
                layer.selectedYear = selectedYear;



                //add the habitats
                 $(cont).find('.habitats').empty();
                _.each(
                    habitats[mode],
                    function(habitat, habitat_code) {
                        var html = '' +
                            '<div class="habitat {0}" ' +
                                'data-habitat="{1}">{2}</div>',
                            display = $(html.format(
                                (_.indexOf(layer.selectedHabitats[mode],habitat_code)>=0) ?
                                    'selected' : '',
                                habitat_code,
                                habitat)
                            );
                        display.click(
                            function(event) {
                                if($(this).hasClass('selected')) {
                                    $(this).removeClass('selected');
                                    layer.selectedHabitats =
                                        _.without(
                                            layer.selectedHabitats[mode],
                                            [$(this).data('habitat').toString()]
                                        );
                                } else {
                                    $(this).addClass('selected');
                                    layer.selectedHabitats[mode].push(
                                        $(this).data('habitat').toString()
                                    );
                                }
                            }
                        );
                        $(cont).find('.habitats').append(display);
                    }.bind(layer)
                );

                //get elevation range
                $(cont).find('.elev').slider({
                    range: true,
                    min:-500,
                    max:9000,
                    values:layer.selectedElev,
                    slide: function(event, ui) {
                        $(cont).find('.elevLabel').html(
                            'Elevation Range:<br>{0}m-{1}m'.format(ui.values[0],ui.values[1])
                        );
                        layer.selectedElev=ui.values;
                    }.bind(layer)
                    }
                );

                $(cont).find('.elevLabel').html(
                    'Elevation Range:<br>{0}m-{1}m'.format(layer.selectedElev[0],layer.selectedElev[1])
                );

                $(cont).find('.year').val(selectedYear);
                $(cont).find('.year').change(
                    function(event) {
                        layer.selectedYear = $(this).val();
                    }
                );
        },
        getStylerLayout: function(element, layer) {
            var pickers,
                sizer;

            if(layer.style_table == "points_style") {
               pickers = '' +
                   '<div class="colorPicker">' +
                   '  <span class="stylerLabel">Fill:&nbsp</span>' +
                   '  <input type="text" id="showFillPalette" />' +
                   '</div>' +
                   '<div class="colorPicker">' +
                   '  <span class="stylerLabel">Border:&nbsp</span>' +
                   '  <input type="text" id="showBorderPalette" />' +
                   '</div>';

               sizer = '' +
                   '<span class="sliderLabel">Size:&nbsp</span>' +
                   '  <div class="sliderContainer">' +
                   '    <div class="sizer"></div>' +
                   '  </div>' +
                   '<span id="pointSizeValue">8px</span>';

               $(element).find('.colorPickers').prepend(pickers);
               $(element).find('.sizerHolder').prepend(sizer);
            } else {
                if(layer.type == "range") {
                   pickers = '' +
                       '<span class="seasonLabel">Breeding</span>' +
                       '<div class="colorPicker">' +
                       '  <span class="stylerLabel">Fill:&nbsp</span>' +
                       '  <input type="text" id="showFill2Palette" />' +
                       '</div>' +
                       '<span class="seasonLabel">Resident</span>' +
                       '<div class="colorPicker">' +
                       '  <span class="stylerLabel">Fill:&nbsp</span>' +
                       '  <input type="text" id="showFill1Palette" />' +
                       '</div>' +
                       '<span class="seasonLabel">Non-breeding</span>' +
                       '<div class="colorPicker">' +
                       '  <span class="stylerLabel">Fill:&nbsp</span>' +
                       '  <input type="text" id="showFill3Palette" />' +
                       '</div>' +
                       '<span class="seasonLabel">Passage</span>' +
                       '<div class="colorPicker">' +
                       '  <span class="stylerLabel">Fill:&nbsp</span>' +
                       '  <input type="text" id="showFill4Palette" />' +
                       '</div>';

                   if (layer.source == "iucn") {
                       pickers+=''+
                           '<span class="seasonLabel">' +
                               'Seasonality Uncertain</span>' +
                           '<div class="colorPicker">' +
                           '  <span class="stylerLabel">Fill:&nbsp</span>' +
                           '  <input type="text" id="showFill5Palette" />' +
                           '</div>';
                   }

                   pickers+=''+
                       '<span class="seasonLabel">All</span>' +
                       '<div class="colorPicker">' +
                       '  <span class="stylerLabel">Border:&nbsp</span>' +
                       '  <input type="text" id="showBorderPalette" />' +
                       '</div>';

                   sizer = '' +
                       '<span class="sliderLabel">Width:&nbsp</span>' +
                       '  <div class="sliderContainer">' +
                       '    <div class="sizer"></div>' +
                       '  </div>' +
                       '<span id="pointSizeValue">8px</span>';

                   $(element).find('.colorPickers').prepend(pickers);
                   $(element).find('.sizerHolder').prepend(sizer);
                } else {
                   pickers = '' +
                       '<div class="colorPicker">' +
                       '  <span class="stylerLabel">Fill:&nbsp</span>' +
                       '  <input type="text" id="showFillPalette" />' +
                       '</div>' +
                       '<div class="colorPicker">' +
                       '  <span class="stylerLabel">Border:&nbsp</span>' +
                       '  <input type="text" id="showBorderPalette" />' +
                       '</div>';

                   sizer = '' +
                       '<span class="sliderLabel">Width:&nbsp</span>' +
                       '  <div class="sliderContainer">' +
                       '    <div class="sizer"></div>' +
                       '  </div>' +
                       '<span id="pointSizeValue">8px</span>';

                   $(element).find('.colorPickers').prepend(pickers);
                   $(element).find('.sizerHolder').prepend(sizer);
                }
            }
        },

        setStylerProperties: function(cont, lay, currSty, origSty, reset) {
            var colors = ['black','white','red','yellow',
                          'blue','green','orange','purple'],
                colors2 = ['#66C2A5','#FC8D62', '#8DA0CB',
                           '#E78AC3', '#A6D854', '#FFD92F','#E5C494'],
                objs,
                max,
                min,
                layOpa;

                if(lay.type == "range") {
                   objs = [ {name: '#showFill1Palette',
                             color: currSty.s1,
                             def: origSty.s1},
                            {name: '#showFill2Palette',
                             color: currSty.s2,
                             def: origSty.s2},
                            {name: '#showFill3Palette',
                             color: currSty.s3,
                             def: origSty.s3},
                            {name: '#showFill4Palette',
                             color: currSty.s4,
                             def: origSty.s4},
                            {name: '#showBorderPalette',
                             color: currSty.border,
                             def: origSty.border}
                          ];

                   if(lay.source == "iucn") {
                       objs.push({name: '#showFill5Palette',
                                  color: currSty.s5,
                                  def: origSty.s5});
                   }
                } else {
                    objs = [ {name: '#showFillPalette',
                              color: currSty.fill,
                              def: origSty.fill},
                             {name: '#showBorderPalette',
                              color: currSty.border,
                              def: origSty.border}
                           ];
                }

                _.each(objs, function(obj) {
                    $(obj.name).spectrum({
                      color: obj.color,
                      showPaletteOnly: true,
                      palette: [
                          [obj.def],
                          colors, colors2
                      ]
                   });
                });

                //sizer
                if(lay.style_table == "points_style") {
                    max = 8;
                    min = 1;
                } else {
                    max = 3;
                    min = 0;
                }

                $(cont).find('.sizer').slider({
                    value: currSty.size,
                    min:min,
                    max:max,
                    step:1,
                    animate:"slow",
                    slide: function(event, ui) {
                        $(cont).find('#pointSizeValue').html(ui.value + "px");
                    }
                });

                $(cont).find('#pointSizeValue').html(
                    $(cont).find('.sizer').slider('value') + "px");

                layOpa = reset ? lay.orig_opacity : lay.opacity;

                //opacity
                $(cont).find('.opacity').slider({
                    value: layOpa,
                    min:0,
                    max:1,
                    step: 0.1,
                    animate:"slow",
                    slide: function(event, ui) {
                        $(cont).find('#opacityValue').html(
                            (ui.value)*100 + "&#37");
                    }}
                );

                $(cont).find('#opacityValue').html((layOpa)*100 + "&#37");
        },

        parseLayerStyle: function(layer, original) {
            var o,
                fillStyle, borderStyle, sizeStyle,
                style,
                s1Style, s2Style, s3Style, s4Style, s5Style,
                s1, s2, s3, s4, s5;

            if(original == "current") {
                style = layer.css;
            } else if(original == "orig") {
                style = layer.orig_style;
            } else {
                style = layer.tile_style;
            }

            if(layer.style_table == "points_style") {
                fillStyle = style.substring(
                                    style.indexOf('marker-fill'),
                                    style.length-1);

                borderStyle = style.substring(
                                    style.indexOf('marker-line-color'),
                                    style.length-1);

                sizeStyle = style.substring(
                                    style.indexOf('marker-width'),
                                    style.length-1);

                o = {fill: fillStyle.substring(
                                    fillStyle.indexOf('#'),
                                    fillStyle.indexOf(';')),
                     border: borderStyle.substring(
                                    borderStyle.indexOf('#'),
                                    borderStyle.indexOf(';')),
                     size: Number($.trim(sizeStyle.substring(
                                    sizeStyle.indexOf(':')+1,
                                    sizeStyle.indexOf(';'))))};
            } else {
                if(layer.type == "range") {
                    s1Style = style.substring(
                                    style.indexOf('seasonality=1'),
                                    style.length-1);

                    s1 = s1Style.substring(
                                    s1Style.indexOf('polygon-fill'),
                                    s1Style.length-1);

                    s2Style = style.substring(
                                    style.indexOf('seasonality=2'),
                                    style.length-1);

                    s2 = s2Style.substring(
                                    s2Style.indexOf('polygon-fill'),
                                    s2Style.length-1);

                    s3Style = style.substring(
                                    style.indexOf('seasonality=3'),
                                    style.length-1);

                    s3 = s3Style.substring(
                                    s3Style.indexOf('polygon-fill'),
                                    s3Style.length-1);

                    s4Style = style.substring(
                                    style.indexOf('seasonality=4'),
                                    style.length-1);

                    s4 = s4Style.substring(
                                    s4Style.indexOf('polygon-fill'),
                                    s4Style.length-1);

                    o = {s1: s1.substring(
                                    s1.indexOf('#'),
                                    s1.indexOf(';')),
                         s2: s2.substring(
                                    s2.indexOf('#'),
                                    s2.indexOf(';')),
                         s3: s3.substring(
                                    s3.indexOf('#'),
                                    s3.indexOf(';')),
                         s4: s4.substring(
                                    s4.indexOf('#'),
                                    s4.indexOf(';'))};

                    if(layer.source == "iucn") {
                        s5Style = style.substring(
                                    style.indexOf('seasonality=5'),
                                    style.length-1);

                        s5 = s5Style.substring(
                                    s5Style.indexOf('polygon-fill'),
                                    s5Style.length-1);

                        o.s5 = s5.substring(
                                    s5.indexOf('#'),
                                    s5.indexOf(';'));
                    }
                } else {
                    fillStyle = style.substring(
                                    style.indexOf('polygon-fill'),
                                    style.length-1);

                    o = {fill: fillStyle.substring(
                                    fillStyle.indexOf('#'),
                                    fillStyle.indexOf(';'))};
                }

                borderStyle = style.substring(
                                    style.indexOf('line-color'),
                                    style.length-1);

                sizeStyle = style.substring(
                                style.indexOf('line-width'),
                                style.length-1);

                o.border = borderStyle.substring(
                                borderStyle.indexOf('#'),
                                borderStyle.indexOf(';'));

                o.size = Number($.trim(sizeStyle.substring(
                                sizeStyle.indexOf(':')+1,
                                sizeStyle.indexOf(';'))));
            }

            return o;
        },

        changeStyleProperty: function(style, prop, newSty, isSeas, seasonProp) {
            var updatedStyle,
                subStyle,
                spreStyle,
                preStyle,
                smidStyle,
                midStyle,
                srestStyle;

            if(isSeas) {
                spreStyle = style.substring(
                                0,
                                style.indexOf("seasonality="+prop+"]")
                            );

                preStyle = style.substring(
                                style.indexOf("seasonality="+prop+"]"),
                                style.length
                           );

                smidStyle = preStyle.substring(
                                0,
                                preStyle.indexOf(seasonProp+":")
                            );

                midStyle = preStyle.substring(
                                preStyle.indexOf(seasonProp+":"),
                                preStyle.length
                           );

                srestStyle = midStyle.substring(
                                midStyle.indexOf(";"),
                                midStyle.length
                             );

                updatedStyle = spreStyle +
                              smidStyle +
                              seasonProp + ":" +
                              newSty +
                              srestStyle;
            } else {
                subStyle = style.substring(style.indexOf(prop), style.length);

                updatedStyle = style.substring(
                                    0,
                                    style.indexOf(prop + ":") +
                                    prop.length+1
                               ) +
                               newSty +
                               subStyle.substring(
                                    subStyle.indexOf(";"),
                                    subStyle.length
                               );
            }

            return updatedStyle;
        },

        updateStyle: function(layer, style, newStyle) {
            var updatedStyle,
                season;

            if(layer.style_table == "points_style") {
                style = this.changeStyleProperty(
                            style, 'marker-fill', newStyle.fill, false);
                style = this.changeStyleProperty(
                            style, 'marker-line-color', newStyle.border,
                                false);
                style = this.changeStyleProperty(
                            style, 'marker-width', newStyle.size, false);
            } else {
                if(layer.type == "range") {
                    style = this.changeStyleProperty(
                                style, '1', newStyle.s1, true, 'polygon-fill');
                    style = this.changeStyleProperty(
                                style, '2', newStyle.s2, true, 'polygon-fill');
                    style = this.changeStyleProperty(
                                style, '3', newStyle.s3, true, 'polygon-fill');
                    style = this.changeStyleProperty(
                                style, '4', newStyle.s4, true, 'polygon-fill');

                    if(layer.source == "iucn") {
                        style = this.changeStyleProperty(
                                style, '5', newStyle.s5, true, 'polygon-fill');
                    }
                } else {
                    style = this.changeStyleProperty(
                                style, 'polygon-fill', newStyle.fill,
                                    false);
                }

                style = this.changeStyleProperty(
                                style, 'line-color', newStyle.border, false);
                style = this.changeStyleProperty(
                                style, 'line-width', newStyle.size, false);
            }

            updatedStyle = style;

            return updatedStyle;
        },

        updateLegendCss: function(button, o, layer, opa) {
            if(layer.type == "range") {
                $(button).find('.s1').css({
                    'background-color':o.s2,
                    'opacity':opa});
                $(button).find('.s2').css({
                    'background-color':o.s1,
                    'opacity':opa});
                $(button).find('.s3').css({
                    'background-color':o.s3,
                    'opacity':opa});
                $(button).find('.s4').css({
                    'background-color':o.s4,
                    'opacity':opa});

                if(layer.source == "iucn") {
                    $(button).find('.s5').css({
                        'background-color':o.s5,
                        'opacity':opa});
                }

                $(button).find('.legend-seasonal')
                    .css({
                        'border-color':o.border,
                        'border-width':o.size+"px",
                        'opacity':opa
                    }
                );
            } else {
                if(layer.style_table == "points_style") {
                    $(button).find('.legend-point')
                        .css({
                            'background-color':o.fill,
                            'border-color':o.border,
                            'width':(o.size+3)+"px",
                            'height':(o.size+3)+"px",
                            'opacity':opa
                        }
                    );
                } else {
                    $(button).find('.legend-polygon')
                        .css({
                            'background-color':o.fill,
                            'border-color':o.border,
                            'border-width':o.size+"px",
                            'opacity':opa
                        }
                    );
                }
            }
        },

        updateLayerStyle: function(button, obj, lay, opa) {
            var o = obj,
                os = {},
                sel_style_desc,
                style_desc,
                params = {},
                oparams = {},
                self = this;

            $.extend(os, o);

            if($(button).parent().hasClass('selected')) {
                os.border = "#FF00FF";
            }

            sel_style_desc = self.updateStyle(lay, lay.tile_style, os);
            style_desc = self.updateStyle(lay, lay.tile_style, o);

            params.layer = lay;
            params.style = sel_style_desc;

            //keep the style around for later
            lay.style = style_desc;

            self.bus.fireEvent(new mol.bus.Event(
                'apply-layer-style', params));

            oparams = {
                layer: lay,
                opacity: opa
            };

            //store the opacity on the layer object
            lay.opacity = oparams.opacity;

            self.bus.fireEvent(new mol.bus.Event(
                'layer-opacity', oparams));
        },

        toggleLayerHighlight: function(layer, visible) {
            var o = {},
                style_desc,
                self = this,
                style = layer.tile_style,
                oldStyle,
                params = {
                    layer: layer,
                    style: null
                };

                oldStyle = self.parseLayerStyle(layer, "current");

                if(layer.style_table == "points_style") {
                    style = this.changeStyleProperty(
                                style,
                                'marker-line-color',
                                visible ? '#FF00FF' : oldStyle.border,
                                false
                            );
                } else {
                    style = this.changeStyleProperty(
                                style,
                                'line-color',
                                visible ? '#FF00FF' : oldStyle.border,
                                false
                            );

                    style = this.changeStyleProperty(
                                style,
                                'line-width',
                                visible ? 1 : oldStyle.size,
                                false
                            );
                }

                style_desc = style;

                params.style = style_desc;

                self.bus.fireEvent(
                    new mol.bus.Event(
                        'apply-layer-style',
                        params));
        },

        /**
        * Add sorting capability to LayerListDisplay, when a result is
        * drag-n-drop, and the order of the result list is changed,
        * then the map will re-render according to the result list's order.
        **/

        initSortable: function() {
            var self = this,
                display = this.display;

            display.list.sortable({
                update : function(event, ui) {
                    var layers = [],
                        params = {},
                        e = null;

                    $(display.list)
                        .find('.layerContainer')
                            .each(function(i, el) {
                                layers.push($(el).attr('id'));
                    });

                    params.layers = layers;
                    e = new mol.bus.Event('reorder-layers', params);
                    self.bus.fireEvent(e);
                }
            });
        }
    });

    mol.map.layers.LayerDisplay = mol.mvp.View.extend({
        init: function(layer) {
            var html = '' +
                '<div class="layerContainer">' +
                '  <div class="layer">' +
                '    <button title="Click to edit layer style." ' +
                            'class="styler">' +
                '      <div class="legend-point"></div> ' +
                '      <div class="legend-polygon"></div> ' +
                '      <div class="legend-seasonal">' +
                '        <div class="seasonal s1"></div>' +
                '        <div class="seasonal s2"></div>' +
                '        <div class="seasonal s3"></div>' +
                '        <div class="seasonal s4"></div>' +
                '        <div class="seasonal s5"></div>' +
                '      </div> ' +
                '    </button>' +
                '    <button class="source" title="Layer Source: {5}">' +
                '      <img src="/static/maps/search/{0}.png">' +
                '    </button>' +
                '    <button class="type" title="Layer Type: {6}">' +
                '      <img src="/static/maps/search/{1}.png">' +
                '    </button>' +
                '    <div class="layerName">' +
                '      <div class="layerRecords">{4}</div>' +
                '      <div title="{2}" class="layerNomial">{2}</div>' +
                '      <div title="{3}" class="layerEnglishName">{3}</div>'+
                '    </div>' +
                '    <button title="Remove layer." class="close buttons">' +
                       'x' +
                '    </button>' +
                '    <button title="Zoom to layer extent." class="zoom buttons">' +
                       'z' +
                '    </button>' +
                '    <label class="buttonContainer">' +
                '       <input class="toggle" type="checkbox">' +
                '       <span title="Toggle layer visibility." ' +
                        'class="customCheck"></span>' +
                '    </label>' +
                '    <button title="Apply habitat filters." class="habitat buttons">' +
                       '<img src="/static/maps/layers/habitat.png">' +
                '    </button>' +
                '   </div>' +
                '   <div class="break"></div>' +
                '</div>',
                self = this;

            this._super(
                html.format(
                    layer.source_type,
                    layer.type,
                    layer.name,
                    layer.names,
                    (layer.feature_count != null) ?
                        '{0} features'.format(layer.feature_count) : '',
                    layer.source_title,
                    layer.type_title
                )
            );

            this.attr('id', layer.id);
            this.toggle = $(this).find('.toggle').button();
            this.habitat = (this).find('.habitat');
            if(!layer.inft||layer.source!='jetz') {
                this.habitat.hide();
            }
            this.styler = $(this).find('.styler');
            this.zoom = $(this).find('.zoom');
            if(layer.extent == null) {
                this.zoom.css('visibility','hidden');
            }
            this.info = $(this).find('.info');
            this.close = $(this).find('.close');
            this.type = $(this).find('.type');
            this.source = $(this).find('.source');
            this.layer = $(this).find('.layer');
            this.layerObj = layer;

            //legend items
            this.pointLegend = $(this).find('.legend-point');
            this.polygonLegend = $(this).find('.legend-polygon');
            this.seasonalLegend = $(this).find('.legend-seasonal');

            if(layer.style_table == "points_style") {
                this.polygonLegend.hide();
                this.seasonalLegend.hide();

                this.pointLegend.addClass(layer.type);
            } else {
                this.pointLegend.hide();

                if(layer.source == "iucn" || layer.source == "jetz") {
                    this.polygonLegend.hide();
                    this.seasonalLegend.addClass(layer.source);

                    if(layer.source == "jetz") {
                        $(this.seasonalLegend).find('.s5').hide();
                    }
                } else {
                    this.seasonalLegend.hide();
                    this.polygonLegend.addClass(layer.type);
                }
            }
        }
    });

    mol.map.layers.LayerListDisplay = mol.mvp.View.extend({
        init: function() {
            var html = '' +
                '<div class="mol-LayerControl-Layers">' +
                    '<div class="layers widgetTheme">' +
                        '<div class="layersHeader">' +
                            '<button class="layersToggle button">▲</button>' +
                            'Layers' +
                        '</div>' +
                        '<div class="layersContainer">' +
                            '<div class="scrollContainer">' +
                                '<div id="sortable"></div>' +
                            '</div>' +
                            '<div class="pageNavigation">' +
                                '<button class="removeAll">' +
                                    'Remove All' +
                                '</button>' +
                                '<button class="toggleAll">' +
                                    'Toggle All' +
                                '</button>' +
                                '<button class="resetAll">' +
                                    'Reset All' +
                                '</button>' +
                                '<button class="styleAll">' +
                                    'Style All' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            this._super(html);
            this.list = $(this).find("#sortable");
            this.removeAll = $(this).find(".removeAll");
            this.toggleAll = $(this).find(".toggleAll");
            this.resetAll = $(this).find(".resetAll");
            this.styleAll = $(this).find(".styleAll");
            this.open = false;
            this.views = {};
            this.layers = [];
            this.layersToggle = $(this).find(".layersToggle");
            this.layersWrapper = $(this).find(".layers");
            this.layersContainer = $(this).find(".layersContainer");
            this.layersHeader = $(this).find(".layersHeader");
            this.expanded = true;
        },

        getLayer: function(layer) {
            return $(this).find('#{0}'.format(escape(layer.id)));
        },

        getLayerById: function(id) {
            return _.find(this.layers, function(layer){
                            return layer.id === id; });
        },

        addLayer: function(layer) {
            var ld = new mol.map.layers.LayerDisplay(layer);
            this.list.append(ld);
            this.layers.push(layer);
            return ld;
        },

        render: function(howmany, order) {
                var self = this;
            this.updateLayerNumber();
            return this;
        },

        updateLayerNumber: function() {
            var t = 0;
            _(this.layers).each(function(a) {
                if(a.enabled) t++;
            });
            $(this).find('.layer_number').html(t + " LAYER"+ (t>1?'S':''));
        },

        sortLayers: function() {
            var order = [];
            $(this).find('.layerContainer').each(function(i, el) {
                order.push($(el).attr('id'));
            });
            this.bus.emit("map:reorder_layers", order);
        },

        open: function(e) {
            if(e) e.preventDefault();
            this.el.addClass('open');
            this.el.css("z-index","100");
            this.open = true;
        },

        close: function(e) {
            this.el.removeClass('open');
            this.el.css("z-index","10");
            this.open = false;
        },

        sort_by: function(layers_order) {
            this.layers.sort(function(a, b) {
                                 return _(layers_order).indexOf(a.name) -
                                     _(layers_order).indexOf(b.name);
                             });
            this.open = true;
            this.hiding();
        },

        hiding: function(e) {
            var layers = null;

            if (!this.open) {
                return;
            }

            // put first what are showing
            this.layers.sort(
                function(a, b) {
                    if (a.enabled && !b.enabled) {
                        return -1;
                    } else if (!a.enabled && b.enabled) {
                        return 1;
                    }
                    return 0;
                }
            );
            layers = _(this.layers).pluck('name');
            this.bus.emit("map:reorder_layers", layers);
            this.order = layers;
            this.render(3);
            this.close();
        }
    });
};
mol.modules.map.menu = function(mol) {

    mol.map.menu = {};

    mol.map.menu.MenuEngine = mol.mvp.Engine.extend({
        init: function(proxy, bus) {
            this.proxy = proxy;
            this.bus = bus;
        },

        /**
         * Starts the MenuEngine. Note that the container parameter is
         * ignored.
         */
        start: function() {

            this.display = new mol.map.menu.BottomMenuDisplay();
            this.display.toggle(true);

            this.addEventHandlers();
            this.fireEvents();
        },

        /**
         * Adds a handler for the 'search-display-toggle' event which
         * controls display visibility. Also adds UI event handlers for the
         * display.
         */
        addEventHandlers: function() {
            var self = this;


            this.display.about.click(
                function(Event) {
                    window.open('/about/');
                }
            );

            this.display.help.click(
                function(Event) {
                    self.bus.fireEvent(
                        new mol.bus.Event('help-display-dialog')
                    );
                }
            );

            this.display.status.click(
                function(Event) {
                    self.bus.fireEvent(
                        new mol.bus.Event('status-display-dialog')
                    );
                }
            );

            this.display.feedback.click(
                function(Event) {
                    self.bus.fireEvent(
                        new mol.bus.Event('feedback-display-toggle')
                    );
                }
            );

            this.bus.addHandler(
                'add-dashboard-toggle-button',
                function(event) {
                    $(self.display).prepend(event.button);
                    self.display.dashboardItem =
                        $(self.display).find('#dashboard');

                    self.display.dashboardItem.click(
                        function(event) {
                            self.bus.fireEvent(
                                new mol.bus.Event('taxonomy-dashboard-toggle'));
                        }
                    );
                }
            );

            this.bus.addHandler(
                'menu-display-toggle',
                function(event) {
                    var params = null,
                    e = null;

                    if (event.visible === undefined) {
                        self.display.toggle();
                        params = {visible: self.display.is(':visible')};
                    } else {
                        self.display.toggle(event.visible);
                    }
                }
            );
        },

        /**
         * Fires the 'add-map-control' event. The mol.map.MapEngine handles
         * this event and adds the display to the map.
         */
        fireEvents: function() {
            var params = {
                    display: this.display,
                    slot: mol.map.ControlDisplay.Slot.BOTTOM,
                    position: google.maps.ControlPosition.RIGHT_BOTTOM
            };
            this.bus.fireEvent(new mol.bus.Event('add-map-control', params));
        }
    });


    mol.map.menu.BottomMenuDisplay = mol.mvp.View.extend({
        init: function() {
            var html = '' +
                '<div class="mol-BottomRightMenu">' +
                    '<div title="Current known issues." ' +
                    ' class="widgetTheme button status">Status</div>' +
                    '<div title="About the Map of Life Project." ' +
                        'class="widgetTheme button  about">About' +
                '    </div>' +
                    '<div title="Submit feedback." ' +
                        'class="widgetTheme button feedback">Feedback</div>' +
                    '<div title="Get help." ' +
                        'class="widgetTheme button help">Help</div>' +
                '</div>';

            this._super(html);
            this.about = $(this).find('.about');
            this.help = $(this).find('.help');
            this.feedback = $(this).find('.feedback');
            this.status = $(this).find('.status');
        }
    });
};

/**
 * This module provides support for rendering search results.
 */
mol.modules.map.results = function(mol) {

    mol.map.results = {};

    mol.map.results.ResultsEngine = mol.mvp.Engine.extend({
        /**
         * @param bus mol.bus.Bus
         */
        init: function(proxy, bus, map) {
            this.proxy = proxy;
            this.bus = bus;
            this.map = map;
            this.maxLayers = ($.browser.chrome) ? 6 : 100;
            this.filters = { 
                'name': {
                    title: 'Name', 
                    hasIcon: false, 
                    title_field : 'name', 
                    values: {}
                },
                'source_type':{ 
                    title: 'Source', 
                    hasIcon: true, 
                    title_field : 'source_type_title', 
                    values: {}
                },
                'type': {
                    title: 'Type',
                    hasIcon: true,
                    title_field : 'type_title',
                    values: {}
                }
            }
        },

        /**
         * Starts the SearchEngine. Note that the container parameter is
         * ignored.
         */
        start: function(container) {
            this.display = new mol.map.results.ResultsDisplay();
            this.display.toggle(false);
            this.addEventHandlers();
            this.fireEvents();
        },
        clearResults: function() {
            this.display.toggle(false);
            this.display.clearResults();
            this.display.clearFilters();
            delete(this.results);
        },
        /**
         * Adds a handler for the 'search-display-toggle' event which
         * controls display visibility. Also adds UI event handlers for the
         * display.
         */
        addEventHandlers: function() {
            var self = this;

            /**
             * Clicking the "select all" link checks all results.
             */
            this.display.selectAllLink.click(
                function(event) {
                    self.display.toggleSelections(true);
                }
            );
            this.bus.addHandler(
                'results-select-all',
                function(event) {
                    self.display.selectAllLink.click();
                }
            );
            this.bus.addHandler(
                'clear-results',
                function(event) {
                    self.clearResults();
                }
            );
            this.bus.addHandler(
                'results-map-selected',
                function(event) {
                    self.display.addAllButton.click();
                }
            );
            this.display.clearResultsButton.click(
                function(event) {
                    self.clearResults();
                }
            );
            /**
             * Clicking the 'map selected layers' button fires an 'add-layers'
             * event on the bus.
             */
            this.display.addAllButton.click(
                function(event) {
                    var layers = self.display.getChecked(), clearResults = false;
                    if(self.display.find('.result').filter(':visible').length == layers.length) {
                        clearResults = true;
                    } 
                    //remove layers that are already mapped
                    self.map.overlayMapTypes.forEach(
                          function(layer) {
                              _.each(
                                  layers,
                                  function(newLayer) {
                                      if(newLayer.id==layer.name) {
                                          layers = _.without(layers, newLayer);
                                      }
                                  }
                              )
                          }
                    );
                    if(self.map.overlayMapTypes.length + layers.length > self.maxLayers) {
                        if(!$.browser.chrome) {
                            alert(
                                'The map is currently limited to {0}'.format(self.maxLayers) +
                                ' layers at a time. Please remove some layers ' +
                                ' before adding more.'
                            );
                            
                        } else {
                            alert(
                                'An issue with Google Chrome currently limits the number '+
                                ' of active layers in Map of Life to {0}'.format(self.maxLayers) +
                                ' layers at a time. Other browsers may display up to 100 layers.'
                            )
                        }
                    } else {
                        self.bus.fireEvent(
                            new mol.bus.Event(
                                'add-layers',
                                {
                                    layers: layers
                                }
                            )
                        );
                        if(clearResults) {
                            self.clearResults();
                            
                        }
                    }
                }
            );
            /**
             * Clicking the "select none" link unchecks all results.
             */
            this.display.selectNoneLink.click(
                function(event) {
                    self.display.toggleSelections(false);
                }
            );

            /**
             * Callback that toggles the search display visibility. The
             * event is expected to have the following properties:
             *
             *   event.visible - true to show the display, false to hide it,
             *                   undefined to toggle.
             *
             * @param event mol.bus.Event
             */
            this.bus.addHandler(
                'results-display-toggle',
                function(event) {
                    if(self.results == undefined) {
                        self.display.toggle(false);
                    } else {
                        if (event.visible === undefined) {
                            self.display.toggle(
                                "slide",
                                {direction: "left"},
                                1000
                            );
                        } else if (event.visible && self.display.not(':visible')) {
                            self.display.show(
                                "slide",
                                {direction: "left"},
                                1000
                            );
                        } else if (self.display.is(':visible')){
                            self.display.hide(
                                "slide",
                                {direction: "left"},
                                1000
                            );
                        }
                    }
                }
            );

            /**
             * Callback that displays search results.
             */
            this.bus.addHandler(
                'search-results',
                function(event) {
                    var response= event.response;
                    self.bus.fireEvent(new mol.bus.Event('close-autocomplete'));
                    self.results = response.rows;

                    if (self.getLayersWithIds(self.results).length > 0) {
                        self.showFilters(self.results);
                        self.showLayers(self.results);
                    } else {
                        self.showNoResults();
                    }
                }
            );
        },

        /**
         * Fires the 'add-map-control' event. The mol.map.MapEngine handles
         * this event and adds the display to the map.
         */
        fireEvents: function() {
            var params = {
                display: this.display,
                slot: mol.map.ControlDisplay.Slot.BOTTOM,
                position: google.maps.ControlPosition.TOP_LEFT
            },
            event = new mol.bus.Event('add-map-control', params);

            this.bus.fireEvent(event);
        },

        /**
         * Handles layers (results) to display by updating the result list
         * and filters.
         *
         * layers:
         *    0:
         *      name: "Coturnix delegorguei"
         *      source: "eafr"
         *      type: "points"
         *
         * @param layers an array of layers
         */
        showLayers: function(layers) {
            var display = this.display;

            display.clearResults();

            // Set layer results in display.
             _.each(
                this.display.setResults(this.getLayersWithIds(layers)), 
                function(result) {
                    result.source.click(
                        function(event) {
                            self.bus.fireEvent(
                                new mol.bus.Event(
                                    'metadata-toggle',
                                    {params : { 
                                        dataset_id: $.data(result[0],'layer')
                                            .dataset_id,
                                        title: $.data(result[0],'layer')
                                            .dataset_title 
                                    }}
                                    
                                )
                            );
                            event.stopPropagation();
                            event.cancelBubble = true;
                        }
                    );
                    result.type.click(
                        function(event) {
                            self.bus.fireEvent(
                                new mol.bus.Event(
                                    'metadata-toggle', 
                                    {
                                        params : { 
                                            type: $.data(result[0],'layer')
                                                .type,
                                            title: $.data(result[0],'layer')
                                                .type_title,
                                        }
                                    }
                                )
                            );
                            event.stopPropagation();
                            event.cancelBubble = true;
                        }
                    );
                },
                this
              );
            this.display.noResults.hide();
            this.display.results.show();
            this.display.toggle(true);
        },
        /*
         * Displays a message when no results are returned 
         * from the search query.
         */
        showNoResults: function() {
            this.display.clearFilters();
            this.display.results.hide();
            this.display.noResults.show();
            this.display.toggle(true);
        },
        /**
         * Returns an array of layer objects {id, name, type, source}
         * with their id set given an array of layer objects
         * {name, type, source}.
         */
        getLayersWithIds: function(layers) {
            return  _.map(
                layers,
                function(layer) {
                    return _.extend(layer, {id: mol.core.getLayerId(layer)});
                }
            );
        },

        showFilters: function(results) {
            var display = this.display,
                filters = this.filters,
                self = this;
            
            
            
            //parse result to fill in the filter values
            _.each(
                _.keys(filters),
                //each filter runs on a layer property
                function(filter) {
                    //first clear out any old filter content
                    filters[filter].values ={};
                    _.each(
                        results,
                        //for each property, set a filter with a title
                        function(row) {    
                            if(row[filter]) {                 
                                filters[filter]
                                    .values[row[filter].replace(/ /g, '_')] 
                                    =  row[filters[filter].title_field];
                            }
                        }
                    );
                }     
            );
            
            display.clearFilters();

            // Set options in each filter.
            _.each(
                _.keys(filters),
                function(filter) {
                    _.each(
                        display.setOptions(
                            filters[filter].title, 
                            filter, 
                            filters[filter].values, 
                            filters[filter].hasIcon
                        ),
                        function(option) {
                            if(option.click) {
                                option.click(
                                    self.optionClickCallback(
                                        option, 
                                        filter
                                    )
                                );
                            }
                        }
                    );
                }
            );
        },

        /**
         * Returns a function that styles the option as selected and removes
         * the selected styles from all other items. This is what gets fired
         * when a filter option is clicked.
         *
         * @param filter mol.map.results.FilterDisplay
         * @param option the filter option display
         */
        optionClickCallback: function(option, filterName) {
            var self = this;

            return function(event) {
                self.updateFilters(option, filterName)
                self.updateResults();
            };
        },
        /*
         *  Creates an array of strings that define the current filter state.
         *  ['type-range,',]
         */
        getSelectedFilters: function() {
            var filters = [];
            _.each(
                $(this.display.filters).find('.filter'),
                function(group) {
                    var options= [];
                    _.each(
                        $(group).find('.selected'),
                        function(filter) {
                            _.each(
                                _.keys($(filter).data()),
                                function(key) {
                                    options.push(
                                        '.{0}-{1}'.format(
                                            key, 
                                            $(filter).data(key)
                                        )
                                    );
                                }
                            );
                        }
                    );
                    if(options.length>0) {
                        filters.push(options.join(', '));
                    }
                }
            );
            return filters;
        },
        /*
         *  Updates the result list based on the selected filters.
         */
        updateResults: function() {
            var filters = this.getSelectedFilters(),
                results = $(this.display).find('.resultContainer'),
                newResults = []; 
            
            if(filters.length > 0) {
                //hide it all
                results.hide()
                //apply the filters
                _.each(
                    filters,
                    function(filter) {
                        results = results.filter(filter);
                    }
                )
                results.show();
             } else {
                results.show();
            }
            
        },
        /*
         *  Keeps the 'All' filter toggle states current.
         */
        updateFilters: function(option, filterName) {
            if(option.hasClass('selected')&&$.trim(option.text())!='All') {
                option.removeClass('selected');
                if(this.display
                       .find('.filter .options .{0}'.format(filterName))
                       .not('.all')
                       .filter('.selected')
                       .length == 0
                  ) {
                        this.display
                            .find('.filter .options .{0}'.format(filterName))
                            .filter('.all')
                            .addClass('selected');
                }
            } else {
                if($.trim(option.text())=='All') {
                    $(this.display.filters)
                        .find('.{0}'.format(filterName))
                        .removeClass('selected'); 
                } else {
                    $(this.display.filters)
                        .find('.{0} .all'.format(filterName))
                        .removeClass('selected');
                }
                option.addClass('selected');
            }
        }
    });

    /**
     * The main display for search results. Contains a search box, a search
     * results list, and search result filters. This is the thing that gets
     * added to the map as a control.
     */
    mol.map.results.ResultsDisplay = mol.mvp.View.extend({
        init: function() {
            var html = '' +
                '<div class="mol-LayerControl-Results">' +
                    '<div class="filters"></div>' +
                    '<div class="searchResults widgetTheme">' +
                        '<div class="results">' +
                            '<div class="resultHeader">' +
                                'Results' +
                                '<a href="#" class="selectNone">none</a>' +
                                '<a href="#" class="selectAll">all</a>' +
                            '</div>' +
                            '<ol class="resultList"></ol>' +
                            '<div class="pageNavigation">' +
                                '<button class="addAll">' +
                                    'Map Selected Layers' +
                                '</button>' +
                                '<button class="clearResults">' +
                                    'Clear Results' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="noresults">' +
                            '<h3>No results found.</h3>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            this._super(html);
            this.resultList = $(this).find('.resultList');
            this.filters = $(this).find('.filters');
            this.selectAllLink = $(this).find('.selectAll');
            this.selectNoneLink = $(this).find('.selectNone');
            this.addAllButton = $(this).find('.addAll');
            this.clearResultsButton = $(this).find('.clearResults');
            this.results = $(this).find('.results');
            this.noResults = $(this).find('.noresults');
        },

        clearResults: function() {
            this.resultList.html('');
        },

        clearFilters: function() {
            this.filters.html('');
        },



        toggleSelections: function(showOrHide) {
            $(this).find('.checkbox').each(
                function() {
                    $(this).attr('checked', showOrHide);
                }
            );
        },

        /**
         * Returns an array of layer objects from results that are checked.
         */
        getChecked: function() {
            var checked = [];
            _.each(
                this.find('.resultContainer').filter(':visible'),
                function(result) {
                    if ($(result).find('.checkbox').attr('checked')) {
                        checked.push($(result).data('layer'));
                    } 
                }
            );
            return checked;
        },

        /**
         * Sets the results and returns them as an array of JQuery objects.
         *
         * @param layers An array of layer objects {id, name, type, source}
         */
        setResults: function(layers) {
            return _.map(
                layers,
                function(layer) {
                    var result = new mol.map.results.ResultDisplay(layer);
                    this.resultList.append(result);
                    return result;
                },
                this
            );
        },

        /**
         * Sets the options for a filter and returns an array of jQuery objects.
         */
        setOptions: function(filterName, filterType, optionNames, hasIcon) {
            var self = this,
                filter = new mol.map.results.FilterDisplay(
                    filterType, 
                    filterName
                ),
                options = [filter.find('.all')];
           
            _.each(
                _.keys(optionNames),
                function(name) {
                    var option = new mol.map.results.OptionDisplay(
                        name, filterType, optionNames[name], hasIcon);
                    filter.options.append(option);
                    options.push(option);
                }
            );
            
            filter.attr('id', filterName);
            this.filters.append(filter);
            return(options);
        },

 
    });
    /**
     * The display for a single search result that lives in the result list.
     *
     * @param parent the .resultList element in search display
     */
    mol.map.results.ResultDisplay = mol.mvp.View.extend(
        {
            init: function(layer) {
                var self=this, html = '' +
                     //add filtertype-value as a class for filtering
                    '<div class="' +
                    '   resultContainer name-{1} source_type-{3} type-{4}">' +
                    '   <ul id="{0}" class="result">' +
                    '       <div class="resultSource">' +
                    '          <button>' +
                    '              <img class="source" ' +
                    '                  title="Layer Source: {8}" ' +
                    '                  src="/static/maps/search/{3}.png">' +
                    '          </button>' +
                    '       </div>' +
                    '       <div class="resultType">' +
                    '           <button>'+
                    '               <img class="type" ' +
                    '               title="Layer Type: {7}" ' +
                    '               src="/static/maps/search/{4}.png">' +
                    '           </button>' +
                    '       </div>' +
                    '       <div class="resultName">' +
                    '           <div class="resultRecords">{6}</div>' +
                    '           <div class="resultNomial">{2}</div>' +
                    '           <div class="resultEnglishName" title="{5}">' +
                    '               {5}' +
                    '           </div>' +
                    '           <div class="resultAuthor"></div>' +
                    '       </div>' +
                    '       <label class="buttonContainer">' +
                    '           <input type="checkbox" checked="checked" class="checkbox" />' +
                    '           <span class="customCheck"></span>' +
                    '       </label> ' +
                    '       </ul>' +
                    '   <div class="break"></div>' +
                    '</div>';

                
                this._super(
                    html.format(
                        layer.id,
                        layer.name.replace(/ /g, '_'),
                        layer.name, 
                        layer.source_type, 
                        layer.type, 
                        layer.names, 
                        (layer.feature_count != null) ? 
                            '{0} features'.format(layer.feature_count) : '', 
                        layer.type_title, 
                        layer.source_title
                    )
                );
                $.data(this[0],'layer',layer);
                this.infoLink = $(this).find('.info');
                this.nameBox = $(this).find('.resultName');
                this.source = $(this).find('.source');
                this.type = $(this).find('.type');
                this.checkbox = $(this).find('.checkbox');
            }
        }
    );

    /**
     * The display for a single search result filter. Allows you to select
     * a name, source, or type and see only matching search results.
     */
    mol.map.results.FilterDisplay = mol.mvp.View.extend(
        {
            init: function(type, title) {
                var html = '' +
                    '<div class="filter widgetTheme {0}">' +
                    '    <div class="filterName">{1}</div>' +
                    '    <div class="options"></div>' +
                    '</div>';

                this._super(html.format(type, title));
                this.name = $(this).find('.filterName');
                this.options = $(this).find('.options');
                this.allOption = new mol.map.results.OptionDisplay(
                    'all',
                     type,
                    'All', 
                    false
                );
                this.allOption.addClass('selected');
                this.options.append(this.allOption);
            }
        }
    );


    mol.map.results.OptionDisplay = mol.mvp.View.extend({
        init: function(name, type, value, hasIcon) {
            var base_html = '' +
                '<div class="option {0}"></div>',
                button_html = '' +
                '<button>' +
                '   <img src="/static/maps/search/{0}.png">'+
                '</button>',
                label_html = '' +
                '   <span class="option_text">{0}</span>';
                
            if(name != undefined && value != undefined) {    
                this._super(base_html.format(type));
                if(name != 'all') {
                    this.data(type, name); 
                } else {
                    this.addClass('all')
                }
                if(hasIcon) {
                    this.append($(button_html.format(name)));
                }
                this.append($(label_html.format(value)));
            }
            
        }
    });
}
mol.modules.map.search = function(mol) {

    mol.map.search = {};

    mol.map.search.SearchEngine = mol.mvp.Engine.extend({
        /**
         * @param bus mol.bus.Bus
         */
        init: function(proxy, bus) {
            this.proxy = proxy;
            this.bus = bus;
            this.searching = {};
            this.names = [];
            this.ac_label_html = ''+
                '<div class="ac-item">' +
                    '<span class="sci">{0}</span>' +
                    '<span class="eng">{1}</span>' +
                '</div>';
            this.ac_sql = "" +
                "SELECT n,v FROM ac WHERE n~*'\\m{0}' OR v~*'\\m{0}'";
            this.search_sql = '' +
                'SELECT DISTINCT l.scientificname as name,'+
                    '\'cdb\' as mode, ' +
                    't.type as type,'+
                    "CASE d.style_table WHEN 'points_style' " +
                        'THEN t.carto_css_point ' +
                        "WHEN 'polygons_style' " +
                        'THEN t.carto_css_poly END as css,' +
                    't.sort_order as type_sort_order, ' +
                    't.title as type_title, '+
                    't.opacity as opacity, ' +
                    'CONCAT(l.provider,\'\') as source, '+
                    'CONCAT(p.title,\'\') as source_title,'+
                    's.source_type as source_type, ' +
                    's.title as source_type_title, ' +
                    'l.feature_count as feature_count, '+
                    'CONCAT(n.v,\'\') as names, ' +
                    'CASE WHEN l.extent is null THEN null ELSE ' +
                    'CONCAT(\'{' +
                        '"sw":{' +
                            '"lng":\',ST_XMin(l.extent),\', '+
                            '"lat":\',ST_YMin(l.extent),\' '+
                        '}, '+
                        '"ne":{' +
                        '"lng":\',ST_XMax(l.extent),\', ' +
                        '"lat":\',ST_YMax(l.extent),\' ' +
                        '}}\') ' +
                    'END as extent, ' +
                    'l.dataset_id as dataset_id, ' +
                    'd.dataset_title as dataset_title, ' +
                    'd.style_table as style_table, ' +
                    'e.finalmin as mine, ' +
                    'e.finalmax as maxe, ' +
                    'e.habitatprefs as modis_habitats, ' +
                    'c.consensusprefs as consensus_habitats, ' +
                    '(sl.latin is not Null and l.provider = \'jetz\') as inft ' +
                'FROM layer_metadata l ' +
                'LEFT JOIN consensus_prefs_join c ON ' +
                    'l.scientificname = c.binomial ' +
                'LEFT JOIN elevandhabitat e ON ' +
                    'l.scientificname = e.scientific ' +
                'LEFT JOIN specieslist sl ON ' +
                    'l.scientificname = sl.latin ' +
                'LEFT JOIN data_registry d ON ' +
                    'l.dataset_id = d.dataset_id ' +
                'LEFT JOIN types t ON ' +
                    'l.type = t.type ' +
                'LEFT JOIN providers p ON ' +
                    'l.provider = p.provider ' +
                'LEFT JOIN source_types s ON ' +
                    'p.source_type = s.source_type ' +
                'LEFT JOIN ac n ON ' +
                    'l.scientificname = n.n ' +
                'WHERE ' +
                     "n.n~*'\\m{0}' OR n.v~*'\\m{0}'" +
                'ORDER BY name, type_sort_order';
        },

        /**
         * Starts the SearchEngine. Note that the container parameter is
         * ignored.
         */
        start: function() {
            this.display = new mol.map.search.SearchDisplay();
            this.display.toggle(true);
            this.initAutocomplete();
            this.addEventHandlers();
            this.fireEvents();
        },
        /*
         * Initialize autocomplate functionality
         */
        initAutocomplete: function() {
            this.populateAutocomplete(null, null);

            //http://stackoverflow.com/questions/2435964/jqueryui-how-can-i-custom-format-the-autocomplete-plug-in-results
            $.ui.autocomplete.prototype._renderItem = function (ul, item) {

                item.label = item.label.replace(
                    new RegExp("(?![^&;]+;)(?!<[^<>]*)(" +
                       $.ui.autocomplete.escapeRegex(this.term) +
                       ")(?![^<>]*>)(?![^&;]+;)", "gi"),
                    "<strong>$1</strong>"
                );
                return $("<li></li>")
                    .data("item.autocomplete", item)
                    .append("<a>" + item.label + "</a>")
                    .appendTo(ul);
            };
        },

        /*
         * Populate autocomplete results list
         */
        populateAutocomplete : function(action, response) {
            var self = this;
            $(this.display.searchBox).autocomplete(
                {
                    minLength: 3,
                    source: function(request, response) {
                        $.getJSON(
                            mol.services.cartodb.sqlApi.jsonp_url.format(
                                    self.ac_sql.format(
                                        $.trim(request.term)
                                            .replace(/ /g, ' ')
                                    )
                            ),
                            function (json) {
                                var names = [],scinames=[];
                                _.each (
                                    json.rows,
                                    function(row) {
                                        var sci, eng;
                                        if(row.n != undefined){
                                            sci = row.n;
                                            eng = (row.v == null ||
                                                row.v == '') ?
                                                    '' :
                                                    ', {0}'.format(
                                                        row.v.replace(
                                                            /'S/g, "'s"
                                                        )
                                                    );
                                            names.push({
                                                label:self.ac_label_html
                                                    .format(sci, eng),
                                                value:sci
                                            });
                                            scinames.push(sci);
                                       }
                                   }
                                );
                                if(scinames.length>0) {
                                    self.names=scinames;
                                }
                                response(names);
                                self.bus.fireEvent(
                                    new mol.bus.Event(
                                        'hide-loading-indicator',
                                        {source : "autocomplete"}
                                    )
                                );
                             },
                             'json'
                        );
                    },
                    select: function(event, ui) {
                        self.searching[ui.item.value] = false;
                        self.names = [ui.item.value];
                        self.search(ui.item.value);
                    },
                    close: function(event,ui) {

                    },
                    search: function(event, ui) {
                        self.searching[$(this).val()] = true;
                        self.names=[];
                        self.bus.fireEvent(
                            new mol.bus.Event(
                                'show-loading-indicator',
                                {source : "autocomplete"}
                            )
                        );
                    },
                    open: function(event, ui) {
                        self.searching[$(this).val()] = false;
                        self.bus.fireEvent(
                             new mol.bus.Event(
                                'hide-loading-indicator',
                                {source : "autocomplete"}
                            )
                        );
                    }
              });
        },

        addEventHandlers: function() {
            var self = this;

            /**
             * Callback that toggles the search display visibility. The
             * event is expected to have the following properties:
             *
             *   event.visible - true to show the display, false to hide it.
             *
             * @param event mol.bus.Event
             */
            this.bus.addHandler(
                'search-display-toggle',
                function(event) {
                    var params = {},
                        e = null;

                    if (event.visible === undefined) {
                        self.display.toggle();
                        params = {visible: self.display.is(':visible')};
                    } else {
                        self.display.toggle(event.visible);
                    }

                    e = new mol.bus.Event('results-display-toggle', params);
                    self.bus.fireEvent(e);
                }
            );

            this.bus.addHandler(
                'close-autocomplete',
                function(event) {
                    $(self.display.searchBox).autocomplete("close");
                }
            );

            this.bus.addHandler(
                'search',
                function(event) {
                    if (event.term != undefined) {
                        if (!self.display.is(':visible')) {
                            self.bus.fireEvent(
                                new mol.bus.Event(
                                    'search-display-toggle',
                                    {visible : true}
                                )
                            );
                        }

                        self.search(event.term);

                        if (self.display.searchBox.val()=='') {
                            self.display.searchBox.val(event.term);
                        }
                    }
               }
            );

            /**
             * Clicking the go button executes a search.
             */
            this.display.goButton.click(
                function(event) {
                    self.search(self.display.searchBox.val());
                }
            );

            /**
             * Clicking the cancel button hides the search display and fires
             * a cancel-search event on the bus.
             */
            this.display.toggleButton.click(
                function(event) {
                    var params = {
                        visible: false
                    }, that = this;

                    if(self.display.searchDisplay.is(':visible')) {
                        self.display.searchDisplay.hide();
                        $(this).text('▶');
                        params.visible = false;
                    } else {

                        self.display.searchDisplay.show();
                        $(this).text('◀');
                        params.visible = true;
                    }

                    self.bus.fireEvent(
                        new mol.bus.Event('results-display-toggle', params));
                }
            );

            /**
             * Pressing the return button clicks the go button.
             */
            this.display.searchBox.keyup(
                function(event) {
                    if (event.keyCode === 13) {
                        $(this).autocomplete("close");
                        self.bus.fireEvent(
                            new mol.bus.Event(
                                'hide-loading-indicator',
                                {source : "autocomplete"}
                            )
                        );
                        self.search($(this).val());
                    }
                }
            );
        },

        /**
         * Fires the 'add-map-control' event. The mol.map.MapEngine handles
         * this event and adds the display to the map.
         */
        fireEvents: function() {
            var params = {
                    display: this.display,
                    slot: mol.map.ControlDisplay.Slot.TOP,
                    position: google.maps.ControlPosition.TOP_LEFT
                },
                event = new mol.bus.Event('add-map-control', params);

            this.bus.fireEvent(event);
        },

        /**
         * Searches CartoDB using a term from the search box. Fires
         * a search event on the bus. The success callback fires a
         * search-results event on the bus.
         *
         * @param term the search term (scientific name)
         */
        search: function(term) {
            var self = this;


                $(self.display.searchBox).autocomplete('disable');
                $(self.display.searchBox).autocomplete('close');

                if(term.length<3) {
                    if ($.trim(term).length==0) {
                        self.bus.fireEvent(new mol.bus.Event('clear-results'));
                    } else {
                        alert('' +
                            'Please enter at least 3 characters ' +
                            'in the search box.'
                        );
                    }
                } else {
                    self.bus.fireEvent(
                        new mol.bus.Event(
                            'show-loading-indicator',
                            {source : "search-{0}".format(term)}
                        )
                    );
                    $(self.display.searchBox).val(term);
                    $.getJSON(
                        mol.services.cartodb.sqlApi.jsonp_url.format(
                            this.search_sql.format(
                                $.trim(term)
                                .replace(/ /g, ' ')
                            )
                        ),
                        function (response) {
                            var results = {term:term, response:response};
                            self.bus.fireEvent(
                                new mol.bus.Event(
                                    'hide-loading-indicator',
                                    {source : "search-{0}".format(term)}
                                )
                            );
                            self.bus.fireEvent(
                                new mol.bus.Event(
                                    'search-results',
                                    results
                                )
                            );
                            $(self.display.searchBox).autocomplete('enable');
                        }
                    );
               }

        }
    });

    mol.map.search.SearchDisplay = mol.mvp.View.extend({
        init: function() {
            var html = '' +
                '<div class="mol-LayerControl-Search widgetTheme">' +
                '    <div class="title">Search</div>' +
                '    <div class="searchDisplay">' +
                '       <input class="value ui-autocomplete-input" type="text" ' +
                            'placeholder="Search by species name">' +
                '       <button class="execute">Go</button>' +
                '   </div>'+
                '   <button class="toggle">◀</button>' +
                '</div>';

            ///$('<div><select onchange="se.search(this.value)"><option value="Accipiter nanus">Accipiter nanus</option><option value="Pipile pipile">Pipile pipile</option><option value="Abroscopus superciliaris">Abroscopus superciliaris</option><option value="Acanthiza apicalis">Acanthiza apicalis</option><option value="Acanthiza robustirostris">Acanthiza robustirostris</option><option value="Accipiter griseiceps">Accipiter griseiceps</option><option value="Accipiter henicogrammus">Accipiter henicogrammus</option><option value="Accipiter poliocephalus">Accipiter poliocephalus</option><option value="Accipiter princeps">Accipiter princeps</option><option value="Accipiter virgatus">Accipiter virgatus</option><option value="Aceros corrugatus">Aceros corrugatus</option><option value="Acridotheres cristatellus">Acridotheres cristatellus</option><option value="Acrocephalus australis">Acrocephalus australis</option><option value="Acrocephalus griseldis">Acrocephalus griseldis</option><option value="Acrocephalus orinus">Acrocephalus orinus</option><option value="Acrocephalus rufescens">Acrocephalus rufescens</option><option value="Acrocephalus syrinx">Acrocephalus syrinx</option><option value="Acropternis orthonyx">Acropternis orthonyx</option><option value="Acryllium vulturinum">Acryllium vulturinum</option><option value="Actinodura waldeni">Actinodura waldeni</option><option value="Aechmophorus clarkii">Aechmophorus clarkii</option><option value="Aegithalos leucogenys">Aegithalos leucogenys</option><option value="Aegithina tiphia">Aegithina tiphia</option><option value="Aegotheles wallacii">Aegotheles wallacii</option><option value="Aenigmatolimnas marginalis">Aenigmatolimnas marginalis</option><option value="Aethia cristatella">Aethia cristatella</option><option value="Aethopyga boltoni">Aethopyga boltoni</option><option value="Aethopyga mystacalis">Aethopyga mystacalis</option><option value="Aethopyga primigenia">Aethopyga primigenia</option><option value="Aethopyga saturata">Aethopyga saturata</option><option value="Agelaius phoeniceus">Agelaius phoeniceus</option><option value="Agelaius tricolor">Agelaius tricolor</option><option value="Aglaiocercus coelestis">Aglaiocercus coelestis</option><option value="Agriornis micropterus">Agriornis micropterus</option><option value="Aimophila humeralis">Aimophila humeralis</option><option value="Alauda arvensis">Alauda arvensis</option><option value="Alcippe brunnea">Alcippe brunnea</option><option value="Alcippe formosana">Alcippe formosana</option><option value="Alcippe ruficapilla">Alcippe ruficapilla</option><option value="Alcippe variegaticeps">Alcippe variegaticeps</option><option value="Aleadryas rufinucha">Aleadryas rufinucha</option><option value="Alectoris graeca">Alectoris graeca</option><option value="Alectoris rufa">Alectoris rufa</option><option value="Alectroenas pulcherrima">Alectroenas pulcherrima</option><option value="Alectrurus tricolor">Alectrurus tricolor</option><option value="Alisterus chloropterus">Alisterus chloropterus</option><option value="Alophoixus flaveolus">Alophoixus flaveolus</option><option value="Amadina erythrocephala">Amadina erythrocephala</option><option value="Amaurolimnas concolor">Amaurolimnas concolor</option><option value="Amaurornis flavirostra">Amaurornis flavirostra</option><option value="Amaurornis magnirostris">Amaurornis magnirostris</option><option value="Amaurornis olivacea">Amaurornis olivacea</option><option value="Amazilia amabilis">Amazilia amabilis</option><option value="Amazilia cyanocephala">Amazilia cyanocephala</option><option value="Amazilia edward">Amazilia edward</option><option value="Amazilia leucogaster">Amazilia leucogaster</option><option value="Amazilia rosenbergi">Amazilia rosenbergi</option><option value="Amazilia violiceps">Amazilia violiceps</option><option value="Amytornis ballarae">Amytornis ballarae</option><option value="Amytornis merrotsyi">Amytornis merrotsyi</option><option value="Anabacerthia amaurotis">Anabacerthia amaurotis</option><option value="Anairetes agraphia">Anairetes agraphia</option><option value="Anas andium">Anas andium</option><option value="Anas eatoni">Anas eatoni</option><option value="Anas poecilorhyncha">Anas poecilorhyncha</option><option value="Anas sibilatrix">Anas sibilatrix</option><option value="Andropadus tephrolaemus">Andropadus tephrolaemus</option><option value="Anhinga anhinga">Anhinga anhinga</option><option value="Anisognathus melanogenys">Anisognathus melanogenys</option><option value="Anisognathus somptuosus">Anisognathus somptuosus</option><option value="Anorrhinus tickelli">Anorrhinus tickelli</option><option value="Anthochaera carunculata">Anthochaera carunculata</option><option value="Anthochaera paradoxa">Anthochaera paradoxa</option><option value="Anthornis melanura">Anthornis melanura</option><option value="Anthoscopus flavifrons">Anthoscopus flavifrons</option><option value="Anthreptes malacensis">Anthreptes malacensis</option><option value="Anthreptes platurus">Anthreptes platurus</option><option value="Anthreptes rhodolaemus">Anthreptes rhodolaemus</option><option value="Anthreptes simplex">Anthreptes simplex</option><option value="Anthus brachyurus">Anthus brachyurus</option><option value="Anthus godlewskii">Anthus godlewskii</option><option value="Anthus hoeschi">Anthus hoeschi</option><option value="Anthus melindae">Anthus melindae</option><option value="Apalis argentea">Apalis argentea</option><option value="Apalis bamendae">Apalis bamendae</option><option value="Apalis chirindensis">Apalis chirindensis</option><option value="Apalis cinerea">Apalis cinerea</option><option value="Apalis goslingi">Apalis goslingi</option><option value="Aphelocoma insularis">Aphelocoma insularis</option><option value="Aphelocoma ultramarina">Aphelocoma ultramarina</option><option value="Aplonis metallica">Aplonis metallica</option><option value="Apteryx haastii">Apteryx haastii</option><option value="Apteryx owenii">Apteryx owenii</option><option value="Apus balstoni">Apus balstoni</option><option value="Apus batesi">Apus batesi</option><option value="Apus bradfieldi">Apus bradfieldi</option><option value="Aquila chrysaetos">Aquila chrysaetos</option><option value="Aquila fasciatus">Aquila fasciatus</option><option value="Aquila hastata">Aquila hastata</option><option value="Aquila pomarina">Aquila pomarina</option><option value="Ara macao">Ara macao</option><option value="Ara severus">Ara severus</option><option value="Aramides axillaris">Aramides axillaris</option><option value="Aramides mangle">Aramides mangle</option><option value="Aramides saracura">Aramides saracura</option><option value="Aratinga acuticaudata">Aratinga acuticaudata</option><option value="Aratinga aurea">Aratinga aurea</option><option value="Aratinga canicularis">Aratinga canicularis</option><option value="Aratinga rubritorquis">Aratinga rubritorquis</option><option value="Arborophila orientalis">Arborophila orientalis</option><option value="Arborophila rubrirostris">Arborophila rubrirostris</option><option value="Arborophila sumatrana">Arborophila sumatrana</option><option value="Archilochus alexandri">Archilochus alexandri</option><option value="Archilochus colubris">Archilochus colubris</option><option value="Ardea humbloti">Ardea humbloti</option><option value="Ardeola grayii">Ardeola grayii</option><option value="Ardeotis kori">Ardeotis kori</option><option value="Arremonops chloronotus">Arremonops chloronotus</option><option value="Arses kaupi">Arses kaupi</option><option value="Artisornis metopias">Artisornis metopias</option><option value="Asthenes arequipae">Asthenes arequipae</option><option value="Asthenes urubambensis">Asthenes urubambensis</option><option value="Atlapetes rufigenis">Atlapetes rufigenis</option><option value="Atlapetes tricolor">Atlapetes tricolor</option><option value="Atticora fasciata">Atticora fasciata</option><option value="Attila bolivianus">Attila bolivianus</option><option value="Aulacorhynchus haematopygus">Aulacorhynchus haematopygus</option><option value="Aulacorhynchus prasinus">Aulacorhynchus prasinus</option><option value="Aythya americana">Aythya americana</option><option value="Aythya valisineria">Aythya valisineria</option><option value="Basileuterus basilicus">Basileuterus basilicus</option><option value="Basileuterus coronatus">Basileuterus coronatus</option><option value="Basileuterus fraseri">Basileuterus fraseri</option><option value="Basileuterus leucoblepharus">Basileuterus leucoblepharus</option><option value="Batis poensis">Batis poensis</option><option value="Batrachostomus auritus">Batrachostomus auritus</option><option value="Bernieria madagascariensis">Bernieria madagascariensis</option><option value="Boissonneaua flavescens">Boissonneaua flavescens</option><option value="Bolborhynchus orbygnesius">Bolborhynchus orbygnesius</option><option value="Bombycilla cedrorum">Bombycilla cedrorum</option><option value="Bostrychia carunculata">Bostrychia carunculata</option><option value="Botaurus pinnatus">Botaurus pinnatus</option><option value="Brachycope anomala">Brachycope anomala</option><option value="Brachygalba lugubris">Brachygalba lugubris</option><option value="Brachypteracias leptosomus">Brachypteracias leptosomus</option><option value="Bradornis pallidus">Bradornis pallidus</option><option value="Bradypterus barratti">Bradypterus barratti</option><option value="Bradypterus davidi">Bradypterus davidi</option><option value="Bubalornis niger">Bubalornis niger</option><option value="Bubo bubo">Bubo bubo</option><option value="Bubo cinerascens">Bubo cinerascens</option><option value="Bubulcus ibis">Bubulcus ibis</option><option value="Bucco tamatia">Bucco tamatia</option><option value="Busarellus nigricollis">Busarellus nigricollis</option><option value="Buteo albigula">Buteo albigula</option><option value="Buteo ridgwayi">Buteo ridgwayi</option><option value="Buteogallus gundlachii">Buteogallus gundlachii</option><option value="Buthraupis wetmorei">Buthraupis wetmorei</option><option value="Cacatua goffiniana">Cacatua goffiniana</option><option value="Cacicus chrysopterus">Cacicus chrysopterus</option><option value="Cacomantis sepulcralis">Cacomantis sepulcralis</option><option value="Cairina scutulata">Cairina scutulata</option><option value="Calidris acuminata">Calidris acuminata</option><option value="Calidris maritima">Calidris maritima</option><option value="Calidris mauri">Calidris mauri</option><option value="Calidris tenuirostris">Calidris tenuirostris</option><option value="Callipepla douglasii">Callipepla douglasii</option><option value="Callipepla gambelii">Callipepla gambelii</option><option value="Calyptocichla serina">Calyptocichla serina</option><option value="Calyptomena viridis">Calyptomena viridis</option><option value="Calyptophilus frugivorus">Calyptophilus frugivorus</option><option value="Calyptorhynchus funereus">Calyptorhynchus funereus</option><option value="Calyptorhynchus lathami">Calyptorhynchus lathami</option><option value="Calyptura cristata">Calyptura cristata</option><option value="Camaroptera undosa">Camaroptera undosa</option><option value="Campethera maculosa">Campethera maculosa</option><option value="Campylorhynchus nuchalis">Campylorhynchus nuchalis</option><option value="Capito brunneipectus">Capito brunneipectus</option><option value="Capito hypoleucus">Capito hypoleucus</option><option value="Caprimulgus ekmani">Caprimulgus ekmani</option><option value="Caprimulgus enarratus">Caprimulgus enarratus</option><option value="Caprimulgus maculicaudus">Caprimulgus maculicaudus</option><option value="Caprimulgus meesi">Caprimulgus meesi</option><option value="Caprimulgus noctitherus">Caprimulgus noctitherus</option><option value="Caprimulgus rufigena">Caprimulgus rufigena</option><option value="Caprimulgus ruwenzorii">Caprimulgus ruwenzorii</option><option value="Caprimulgus vociferus">Caprimulgus vociferus</option><option value="Caprimulgus whitelyi">Caprimulgus whitelyi</option><option value="Caracara plancus">Caracara plancus</option><option value="Carduelis barbata">Carduelis barbata</option><option value="Carduelis chloris">Carduelis chloris</option><option value="Carduelis hornemanni">Carduelis hornemanni</option><option value="Carduelis pinus">Carduelis pinus</option><option value="Carpodacus nipalensis">Carpodacus nipalensis</option><option value="Carpodacus puniceus">Carpodacus puniceus</option><option value="Carpodacus rhodochlamys">Carpodacus rhodochlamys</option><option value="Carpodacus roseus">Carpodacus roseus</option><option value="Carpodacus rubicilla">Carpodacus rubicilla</option><option value="Casiornis fuscus">Casiornis fuscus</option><option value="Catamenia homochroa">Catamenia homochroa</option><option value="Catharacta antarctica">Catharacta antarctica</option><option value="Catharus dryas">Catharus dryas</option><option value="Catreus wallichi">Catreus wallichi</option><option value="Centropus ateralbus">Centropus ateralbus</option><option value="Centropus rectunguis">Centropus rectunguis</option><option value="Cephalopterus glabricollis">Cephalopterus glabricollis</option><option value="Cercomacra carbonaria">Cercomacra carbonaria</option><option value="Cercomacra nigricans">Cercomacra nigricans</option><option value="Cercomela sinuata">Cercomela sinuata</option><option value="Certhilauda subcoronata">Certhilauda subcoronata</option><option value="Certhionyx pectoralis">Certhionyx pectoralis</option><option value="Cettia canturians">Cettia canturians</option><option value="Cettia fortipes">Cettia fortipes</option><option value="Ceyx rufidorsa">Ceyx rufidorsa</option><option value="Chaetops frenatus">Chaetops frenatus</option><option value="Chaetura spinicaudus">Chaetura spinicaudus</option><option value="Chalcopsitta sintillata">Chalcopsitta sintillata</option><option value="Chalcostigma ruficeps">Chalcostigma ruficeps</option><option value="Chalybura buffonii">Chalybura buffonii</option><option value="Chalybura urochrysia">Chalybura urochrysia</option><option value="Chamaepetes goudotii">Chamaepetes goudotii</option><option value="Chamaeza mollissima">Chamaeza mollissima</option><option value="Charadrius bicinctus">Charadrius bicinctus</option><option value="Charadrius veredus">Charadrius veredus</option><option value="Charadrius vociferus">Charadrius vociferus</option><option value="Charmosyna pulchella">Charmosyna pulchella</option><option value="Chelidoptera tenebrosa">Chelidoptera tenebrosa</option><option value="Chionis albus">Chionis albus</option><option value="Chlamydochaera jefferyi">Chlamydochaera jefferyi</option><option value="Chlamydotis undulata">Chlamydotis undulata</option><option value="Chlidonias hybrida">Chlidonias hybrida</option><option value="Chlidonias leucopterus">Chlidonias leucopterus</option><option value="Chloephaga poliocephala">Chloephaga poliocephala</option><option value="Chloroceryle amazona">Chloroceryle amazona</option><option value="Chloroceryle inda">Chloroceryle inda</option><option value="Chlorocichla simplex">Chlorocichla simplex</option><option value="Chloropsis aurifrons">Chloropsis aurifrons</option><option value="Chlorospingus parvirostris">Chlorospingus parvirostris</option><option value="Chlorospingus pileatus">Chlorospingus pileatus</option><option value="Chlorostilbon forficatus">Chlorostilbon forficatus</option><option value="Chlorostilbon gibsoni">Chlorostilbon gibsoni</option><option value="Chlorothraupis frenata">Chlorothraupis frenata</option><option value="Chondrohierax uncinatus">Chondrohierax uncinatus</option><option value="Chondrohierax wilsonii">Chondrohierax wilsonii</option><option value="Chordeiles rupestris">Chordeiles rupestris</option><option value="Chrysococcyx osculans">Chrysococcyx osculans</option><option value="Chrysomma sinense">Chrysomma sinense</option><option value="Chrysomus icterocephalus">Chrysomus icterocephalus</option><option value="Cichladusa ruficauda">Cichladusa ruficauda</option><option value="Ciconia abdimii">Ciconia abdimii</option><option value="Ciconia episcopus">Ciconia episcopus</option><option value="Ciconia nigra">Ciconia nigra</option><option value="Cinclodes aricomae">Cinclodes aricomae</option><option value="Cinclodes palliatus">Cinclodes palliatus</option><option value="Cinclus pallasii">Cinclus pallasii</option><option value="Cinnycerthia unirufa">Cinnycerthia unirufa</option><option value="Circaetus cinerascens">Circaetus cinerascens</option><option value="Circus maurus">Circus maurus</option><option value="Cisticola aberdare">Cisticola aberdare</option><option value="Cisticola chubbi">Cisticola chubbi</option><option value="Cisticola dambo">Cisticola dambo</option><option value="Cisticola ruficeps">Cisticola ruficeps</option><option value="Cisticola textrix">Cisticola textrix</option><option value="Cistothorus palustris">Cistothorus palustris</option><option value="Climacteris melanurus">Climacteris melanurus</option><option value="Clytomyias insignis">Clytomyias insignis</option><option value="Clytorhynchus pachycephaloides">Clytorhynchus pachycephaloides</option><option value="Coccothraustes vespertinus">Coccothraustes vespertinus</option><option value="Coccyzus rufigularis">Coccyzus rufigularis</option><option value="Coccyzus vetula">Coccyzus vetula</option><option value="Coeligena bonapartei">Coeligena bonapartei</option><option value="Coeligena lutetiae">Coeligena lutetiae</option><option value="Coeligena orina">Coeligena orina</option><option value="Coereba flaveola">Coereba flaveola</option><option value="Colaptes chrysoides">Colaptes chrysoides</option><option value="Colaptes pitius">Colaptes pitius</option><option value="Colibri coruscans">Colibri coruscans</option><option value="Colibri thalassinus">Colibri thalassinus</option><option value="Collocalia bartschi">Collocalia bartschi</option><option value="Collocalia germani">Collocalia germani</option><option value="Colluricincla harmonica">Colluricincla harmonica</option><option value="Colluricincla umbrina">Colluricincla umbrina</option><option value="Columba albinucha">Columba albinucha</option><option value="Columba arquatrix">Columba arquatrix</option><option value="Columba junoniae">Columba junoniae</option><option value="Columba leuconota">Columba leuconota</option><option value="Columba livia">Columba livia</option><option value="Columba punicea">Columba punicea</option><option value="Columba thomensis">Columba thomensis</option><option value="Columbina picui">Columbina picui</option><option value="Compsospiza baeri">Compsospiza baeri</option><option value="Compsospiza garleppi">Compsospiza garleppi</option><option value="Conioptilon mcilhennyi">Conioptilon mcilhennyi</option><option value="Conirostrum cinereum">Conirostrum cinereum</option><option value="Conirostrum sitticolor">Conirostrum sitticolor</option><option value="Conopias trivirgatus">Conopias trivirgatus</option><option value="Coracina analis">Coracina analis</option><option value="Coracina bicolor">Coracina bicolor</option><option value="Coracina fimbriata">Coracina fimbriata</option><option value="Coracina graueri">Coracina graueri</option><option value="Coracina holopolia">Coracina holopolia</option><option value="Coracina melaschistos">Coracina melaschistos</option><option value="Coracina novaehollandiae">Coracina novaehollandiae</option><option value="Coracina schistacea">Coracina schistacea</option><option value="Coracina schisticeps">Coracina schisticeps</option><option value="Coracornis raveni">Coracornis raveni</option><option value="Corvus frugilegus">Corvus frugilegus</option><option value="Corvus torquatus">Corvus torquatus</option><option value="Corvus typicus">Corvus typicus</option><option value="Coryphospingus cucullatus">Coryphospingus cucullatus</option><option value="Cosmopsarus unicolor">Cosmopsarus unicolor</option><option value="Cossypha albicapilla">Cossypha albicapilla</option><option value="Cossypha heuglini">Cossypha heuglini</option><option value="Cotinga amabilis">Cotinga amabilis</option><option value="Cotinga ridgwayi">Cotinga ridgwayi</option><option value="Coturnix chinensis">Coturnix chinensis</option><option value="Coua cristata">Coua cristata</option><option value="Coua reynaudii">Coua reynaudii</option><option value="Coua ruficeps">Coua ruficeps</option><option value="Coua verreauxi">Coua verreauxi</option><option value="Cracticus louisiadensis">Cracticus louisiadensis</option><option value="Cranioleuca gutturata">Cranioleuca gutturata</option><option value="Cranioleuca muelleri">Cranioleuca muelleri</option><option value="Cranioleuca vulpecula">Cranioleuca vulpecula</option><option value="Creurgops verticalis">Creurgops verticalis</option><option value="Cryptophaps poecilorrhoa">Cryptophaps poecilorrhoa</option><option value="Crypturellus ptaritepui">Crypturellus ptaritepui</option><option value="Crypturellus soui">Crypturellus soui</option><option value="Cuculus lepidus">Cuculus lepidus</option><option value="Cuculus pallidus">Cuculus pallidus</option><option value="Cutia legalleni">Cutia legalleni</option><option value="Cyanicterus cyanicterus">Cyanicterus cyanicterus</option><option value="Cyanocompsa cyanoides">Cyanocompsa cyanoides</option><option value="Cyanocorax heilprini">Cyanocorax heilprini</option><option value="Cyanoramphus auriceps">Cyanoramphus auriceps</option><option value="Cyanoramphus saisseti">Cyanoramphus saisseti</option><option value="Cyclopsitta gulielmitertii">Cyclopsitta gulielmitertii</option><option value="Cygnus cygnus">Cygnus cygnus</option><option value="Cynanthus sordidus">Cynanthus sordidus</option><option value="Cyornis herioti">Cyornis herioti</option><option value="Cyornis ruckii">Cyornis ruckii</option><option value="Cypseloides cherriei">Cypseloides cherriei</option><option value="Cypsnagra hirundinacea">Cypsnagra hirundinacea</option><option value="Dacelo tyro">Dacelo tyro</option><option value="Dacnis albiventris">Dacnis albiventris</option><option value="Daphoenositta miranda">Daphoenositta miranda</option><option value="Daptrius ater">Daptrius ater</option><option value="Dasyornis longirostris">Dasyornis longirostris</option><option value="Delichon dasypus">Delichon dasypus</option><option value="Dendrexetastes rufigula">Dendrexetastes rufigula</option><option value="Dendrocincla anabatina">Dendrocincla anabatina</option><option value="Dendrocitta frontalis">Dendrocitta frontalis</option><option value="Dendrocitta vagabunda">Dendrocitta vagabunda</option><option value="Dendrocopos dorae">Dendrocopos dorae</option><option value="Dendrocopos kizuki">Dendrocopos kizuki</option><option value="Dendrocopos mahrattensis">Dendrocopos mahrattensis</option><option value="Dendrocopos moluccensis">Dendrocopos moluccensis</option><option value="Dendrocygna arborea">Dendrocygna arborea</option><option value="Dendrocygna eytoni">Dendrocygna eytoni</option><option value="Dendroica aestiva">Dendroica aestiva</option><option value="Dendroica coronata">Dendroica coronata</option><option value="Dendroica delicata">Dendroica delicata</option><option value="Dendroica graciae">Dendroica graciae</option><option value="Dendroica magnolia">Dendroica magnolia</option><option value="Dendropicos spodocephalus">Dendropicos spodocephalus</option><option value="Dendrortyx leucophrys">Dendrortyx leucophrys</option><option value="Dicaeum anthonyi">Dicaeum anthonyi</option><option value="Dicaeum nitidum">Dicaeum nitidum</option><option value="Dicaeum quadricolor">Dicaeum quadricolor</option><option value="Dicaeum sanguinolentum">Dicaeum sanguinolentum</option><option value="Dicaeum vincens">Dicaeum vincens</option><option value="Dicaeum vulneratum">Dicaeum vulneratum</option><option value="Dicrurus aeneus">Dicrurus aeneus</option><option value="Dicrurus aldabranus">Dicrurus aldabranus</option><option value="Dicrurus atripennis">Dicrurus atripennis</option><option value="Dicrurus macrocercus">Dicrurus macrocercus</option><option value="Dicrurus paradiseus">Dicrurus paradiseus</option><option value="Dicrurus sumatranus">Dicrurus sumatranus</option><option value="Diglossa plumbea">Diglossa plumbea</option><option value="Diomedea epomophora">Diomedea epomophora</option><option value="Dioptrornis brunneus">Dioptrornis brunneus</option><option value="Dives warszewiczi">Dives warszewiczi</option><option value="Dolichonyx oryzivorus">Dolichonyx oryzivorus</option><option value="Doryfera ludovicae">Doryfera ludovicae</option><option value="Drepanoptila holosericea">Drepanoptila holosericea</option><option value="Dromaius novaehollandiae">Dromaius novaehollandiae</option><option value="Drymophila devillei">Drymophila devillei</option><option value="Drymophila ochropyga">Drymophila ochropyga</option><option value="Dryocopus hodgei">Dryocopus hodgei</option><option value="Dryoscopus senegalensis">Dryoscopus senegalensis</option><option value="Dryotriorchis spectabilis">Dryotriorchis spectabilis</option><option value="Ducula aenea">Ducula aenea</option><option value="Ducula pacifica">Ducula pacifica</option><option value="Ducula poliocephala">Ducula poliocephala</option><option value="Ducula zoeae">Ducula zoeae</option><option value="Dulus dominicus">Dulus dominicus</option><option value="Dumetella carolinensis">Dumetella carolinensis</option><option value="Egretta sacra">Egretta sacra</option><option value="Elaenia frantzii">Elaenia frantzii</option><option value="Elaenia pelzelni">Elaenia pelzelni</option><option value="Elanus axillaris">Elanus axillaris</option><option value="Elminia albiventris">Elminia albiventris</option><option value="Elminia albonotata">Elminia albonotata</option><option value="Elminia nigromitrata">Elminia nigromitrata</option><option value="Emberiza affinis">Emberiza affinis</option><option value="Emberiza citrinella">Emberiza citrinella</option><option value="Emberiza jankowskii">Emberiza jankowskii</option><option value="Emberiza koslowi">Emberiza koslowi</option><option value="Emberizoides herbicola">Emberizoides herbicola</option><option value="Emblema pictum">Emblema pictum</option><option value="Eminia lepida">Eminia lepida</option><option value="Empidonax atriceps">Empidonax atriceps</option><option value="Ensifera ensifera">Ensifera ensifera</option><option value="Entomyzon cyanotis">Entomyzon cyanotis</option><option value="Eophona migratoria">Eophona migratoria</option><option value="Eopsaltria pulverulenta">Eopsaltria pulverulenta</option><option value="Eos bornea">Eos bornea</option><option value="Eos squamata">Eos squamata</option><option value="Ephippiorhynchus asiaticus">Ephippiorhynchus asiaticus</option><option value="Epimachus fastuosus">Epimachus fastuosus</option><option value="Epimachus meyeri">Epimachus meyeri</option><option value="Epinecrophylla haematonota">Epinecrophylla haematonota</option><option value="Epinecrophylla ornata">Epinecrophylla ornata</option><option value="Eremomela canescens">Eremomela canescens</option><option value="Eremomela usticollis">Eremomela usticollis</option><option value="Eremophila alpestris">Eremophila alpestris</option><option value="Ergaticus versicolor">Ergaticus versicolor</option><option value="Eriocnemis alinae">Eriocnemis alinae</option><option value="Eriocnemis isabellae">Eriocnemis isabellae</option><option value="Eriocnemis vestita">Eriocnemis vestita</option><option value="Erithacus komadori">Erithacus komadori</option><option value="Erythropygia barbata">Erythropygia barbata</option><option value="Erythropygia signata">Erythropygia signata</option><option value="Erythrura psittacea">Erythrura psittacea</option><option value="Estrilda atricapilla">Estrilda atricapilla</option><option value="Estrilda nigriloris">Estrilda nigriloris</option><option value="Estrilda paludicola">Estrilda paludicola</option><option value="Eudocimus ruber">Eudocimus ruber</option><option value="Eugralla paradoxa">Eugralla paradoxa</option><option value="Eulipoa wallacei">Eulipoa wallacei</option><option value="Eumyias indigo">Eumyias indigo</option><option value="Eupetomena macroura">Eupetomena macroura</option><option value="Euphagus carolinus">Euphagus carolinus</option><option value="Euphagus cyanocephalus">Euphagus cyanocephalus</option><option value="Euphonia hirundinacea">Euphonia hirundinacea</option><option value="Euphonia plumbea">Euphonia plumbea</option><option value="Euplectes capensis">Euplectes capensis</option><option value="Euplectes hartlaubi">Euplectes hartlaubi</option><option value="Eupodotis afraoides">Eupodotis afraoides</option><option value="Eupodotis caerulescens">Eupodotis caerulescens</option><option value="Eupodotis savilei">Eupodotis savilei</option><option value="Eupodotis senegalensis">Eupodotis senegalensis</option><option value="Eurostopodus papuensis">Eurostopodus papuensis</option><option value="Eurostopodus temminckii">Eurostopodus temminckii</option><option value="Eutoxeres aquila">Eutoxeres aquila</option><option value="Falco alopex">Falco alopex</option><option value="Falco araea">Falco araea</option><option value="Falco berigora">Falco berigora</option><option value="Falco punctatus">Falco punctatus</option><option value="Falco rupicoloides">Falco rupicoloides</option><option value="Falco severus">Falco severus</option><option value="Falco sparverius">Falco sparverius</option><option value="Falco subbuteo">Falco subbuteo</option><option value="Falco subniger">Falco subniger</option><option value="Ficedula bonthaina">Ficedula bonthaina</option><option value="Ficedula buruensis">Ficedula buruensis</option><option value="Ficedula disposita">Ficedula disposita</option><option value="Ficedula hodgsonii">Ficedula hodgsonii</option><option value="Ficedula parva">Ficedula parva</option><option value="Ficedula rufigula">Ficedula rufigula</option><option value="Ficedula sapphira">Ficedula sapphira</option><option value="Formicarius colma">Formicarius colma</option><option value="Forpus coelestis">Forpus coelestis</option><option value="Forpus modestus">Forpus modestus</option><option value="Forpus xanthops">Forpus xanthops</option><option value="Francolinus castaneicollis">Francolinus castaneicollis</option><option value="Francolinus gularis">Francolinus gularis</option><option value="Fraseria cinerascens">Fraseria cinerascens</option><option value="Fratercula cirrhata">Fratercula cirrhata</option><option value="Fratercula corniculata">Fratercula corniculata</option><option value="Frederickena unduligera">Frederickena unduligera</option><option value="Fregata andrewsi">Fregata andrewsi</option><option value="Fregata aquila">Fregata aquila</option><option value="Fulica gigantea">Fulica gigantea</option><option value="Fulica leucoptera">Fulica leucoptera</option><option value="Furnarius cinnamomeus">Furnarius cinnamomeus</option><option value="Furnarius minor">Furnarius minor</option><option value="Galbula tombacea">Galbula tombacea</option><option value="Gallicolumba hoedtii">Gallicolumba hoedtii</option><option value="Gallicolumba stairi">Gallicolumba stairi</option><option value="Gallicolumba tristigmata">Gallicolumba tristigmata</option><option value="Gallinago jamesoni">Gallinago jamesoni</option><option value="Gallinago stenura">Gallinago stenura</option><option value="Gallirallus philippensis">Gallirallus philippensis</option><option value="Gallirallus rovianae">Gallirallus rovianae</option><option value="Garrulax formosus">Garrulax formosus</option><option value="Garrulax konkakinhensis">Garrulax konkakinhensis</option><option value="Garrulax lunulatus">Garrulax lunulatus</option><option value="Garrulax maesi">Garrulax maesi</option><option value="Garrulax milnei">Garrulax milnei</option><option value="Garrulax mitratus">Garrulax mitratus</option><option value="Garrulax ngoclinhensis">Garrulax ngoclinhensis</option><option value="Garrulus lidthi">Garrulus lidthi</option><option value="Geococcyx californianus">Geococcyx californianus</option><option value="Geoffroyus simplex">Geoffroyus simplex</option><option value="Geopelia maugeus">Geopelia maugeus</option><option value="Geophaps smithii">Geophaps smithii</option><option value="Geositta peruviana">Geositta peruviana</option><option value="Geositta rufipennis">Geositta rufipennis</option><option value="Geospiza fortis">Geospiza fortis</option><option value="Geothlypis speciosa">Geothlypis speciosa</option><option value="Geotrygon costaricensis">Geotrygon costaricensis</option><option value="Gerygone hypoxantha">Gerygone hypoxantha</option><option value="Glareola maldivarum">Glareola maldivarum</option><option value="Glaucidium parkeri">Glaucidium parkeri</option><option value="Glaucidium tephronotum">Glaucidium tephronotum</option><option value="Glaucis aeneus">Glaucis aeneus</option><option value="Glycichaera fallax">Glycichaera fallax</option><option value="Gorsachius magnificus">Gorsachius magnificus</option><option value="Grallaria kaestneri">Grallaria kaestneri</option><option value="Grallaria rufocinerea">Grallaria rufocinerea</option><option value="Grallaria varia">Grallaria varia</option><option value="Grallaricula ochraceifrons">Grallaricula ochraceifrons</option><option value="Granatellus sallaei">Granatellus sallaei</option><option value="Graueria vittata">Graueria vittata</option><option value="Grus monacha">Grus monacha</option><option value="Grus rubicunda">Grus rubicunda</option><option value="Guttera plumifera">Guttera plumifera</option><option value="Gymnobucco sladeni">Gymnobucco sladeni</option><option value="Gymnophaps albertisii">Gymnophaps albertisii</option><option value="Gyps bengalensis">Gyps bengalensis</option><option value="Gyps himalayensis">Gyps himalayensis</option><option value="Haematopus fuliginosus">Haematopus fuliginosus</option><option value="Haematopus longirostris">Haematopus longirostris</option><option value="Haliaeetus leucogaster">Haliaeetus leucogaster</option><option value="Haliastur sphenurus">Haliastur sphenurus</option><option value="Hamirostra melanosternon">Hamirostra melanosternon</option><option value="Hapaloptila castanea">Hapaloptila castanea</option><option value="Haplospiza unicolor">Haplospiza unicolor</option><option value="Harpagus diodon">Harpagus diodon</option><option value="Heliangelus mavors">Heliangelus mavors</option><option value="Heliangelus micraster">Heliangelus micraster</option><option value="Heliodoxa xanthogonys">Heliodoxa xanthogonys</option><option value="Helmitheros vermivorum">Helmitheros vermivorum</option><option value="Hemipus picatus">Hemipus picatus</option><option value="Hemispingus auricularis">Hemispingus auricularis</option><option value="Hemispingus frontalis">Hemispingus frontalis</option><option value="Hemispingus reyi">Hemispingus reyi</option><option value="Hemithraupis ruficapilla">Hemithraupis ruficapilla</option><option value="Hemitriccus flammulatus">Hemitriccus flammulatus</option><option value="Hemitriccus orbitatus">Hemitriccus orbitatus</option><option value="Herpsilochmus atricapillus">Herpsilochmus atricapillus</option><option value="Herpsilochmus dorsimaculatus">Herpsilochmus dorsimaculatus</option><option value="Herpsilochmus parkeri">Herpsilochmus parkeri</option><option value="Herpsilochmus pectoralis">Herpsilochmus pectoralis</option><option value="Herpsilochmus stictocephalus">Herpsilochmus stictocephalus</option><option value="Heterophasia annectens">Heterophasia annectens</option><option value="Heterophasia melanoleuca">Heterophasia melanoleuca</option><option value="Hieraaetus ayresii">Hieraaetus ayresii</option><option value="Himantopus himantopus">Himantopus himantopus</option><option value="Hippolais caligata">Hippolais caligata</option><option value="Hippolais opaca">Hippolais opaca</option><option value="Hippolais polyglotta">Hippolais polyglotta</option><option value="Hirundapus cochinchinensis">Hirundapus cochinchinensis</option><option value="Hirundo ariel">Hirundo ariel</option><option value="Hirundo lucida">Hirundo lucida</option><option value="Hirundo nigrita">Hirundo nigrita</option><option value="Hirundo preussi">Hirundo preussi</option><option value="Hylocharis leucotis">Hylocharis leucotis</option><option value="Hylocryptus rectirostris">Hylocryptus rectirostris</option><option value="Hyloctistes virgatus">Hyloctistes virgatus</option><option value="Hylopezus berlepschi">Hylopezus berlepschi</option><option value="Hylopezus dives">Hylopezus dives</option><option value="Hylophilus ochraceiceps">Hylophilus ochraceiceps</option><option value="Hylophilus pectoralis">Hylophilus pectoralis</option><option value="Hylophilus sclateri">Hylophilus sclateri</option><option value="Hylophilus semibrunneus">Hylophilus semibrunneus</option><option value="Hylophylax naevius">Hylophylax naevius</option><option value="Hylophylax punctulatus">Hylophylax punctulatus</option><option value="Hypergerus atriceps">Hypergerus atriceps</option><option value="Hypocnemis ochrogyna">Hypocnemis ochrogyna</option><option value="Hypositta corallirostris">Hypositta corallirostris</option><option value="Hypsipetes leucocephalus">Hypsipetes leucocephalus</option><option value="Hypsipetes parvirostris">Hypsipetes parvirostris</option><option value="Icterus auricapillus">Icterus auricapillus</option><option value="Icterus croconotus">Icterus croconotus</option><option value="Icterus cucullatus">Icterus cucullatus</option><option value="Icterus galbula">Icterus galbula</option><option value="Icterus jamacaii">Icterus jamacaii</option><option value="Icterus pustulatus">Icterus pustulatus</option><option value="Icterus spurius">Icterus spurius</option><option value="Icterus wagleri">Icterus wagleri</option><option value="Ictinaetus malayensis">Ictinaetus malayensis</option><option value="Ictinia mississippiensis">Ictinia mississippiensis</option><option value="Ictinia plumbea">Ictinia plumbea</option><option value="Idiopsar brachyurus">Idiopsar brachyurus</option><option value="Ifrita kowaldi">Ifrita kowaldi</option><option value="Illadopsis cleaveri">Illadopsis cleaveri</option><option value="Incaspiza watkinsi">Incaspiza watkinsi</option><option value="Indicator archipelagicus">Indicator archipelagicus</option><option value="Indicator exilis">Indicator exilis</option><option value="Indicator indicator">Indicator indicator</option><option value="Inezia subflava">Inezia subflava</option><option value="Iole indica">Iole indica</option><option value="Ixos amaurotis">Ixos amaurotis</option><option value="Jacamaralcyon tridactyla">Jacamaralcyon tridactyla</option><option value="Junco hyemalis">Junco hyemalis</option><option value="Junco insularis">Junco insularis</option><option value="Knipolegus franciscanus">Knipolegus franciscanus</option><option value="Knipolegus hudsoni">Knipolegus hudsoni</option><option value="Knipolegus signatus">Knipolegus signatus</option><option value="Kupeornis chapini">Kupeornis chapini</option><option value="Lagonosticta senegala">Lagonosticta senegala</option><option value="Lalage leucomela">Lalage leucomela</option><option value="Lamprotornis cupreocauda">Lamprotornis cupreocauda</option><option value="Lamprotornis purpuroptera">Lamprotornis purpuroptera</option><option value="Lamprotornis shelleyi">Lamprotornis shelleyi</option><option value="Lamprotornis superbus">Lamprotornis superbus</option><option value="Laniarius aethiopicus">Laniarius aethiopicus</option><option value="Laniarius atroflavus">Laniarius atroflavus</option><option value="Laniisoma elegans">Laniisoma elegans</option><option value="Laniocera rufescens">Laniocera rufescens</option><option value="Lanius bucephalus">Lanius bucephalus</option><option value="Lanius mackinnoni">Lanius mackinnoni</option><option value="Lanius newtoni">Lanius newtoni</option><option value="Larus delawarensis">Larus delawarensis</option><option value="Larus glaucescens">Larus glaucescens</option><option value="Larus novaehollandiae">Larus novaehollandiae</option><option value="Larus thayeri">Larus thayeri</option><option value="Laterallus albigularis">Laterallus albigularis</option><option value="Laterallus leucopyrrhus">Laterallus leucopyrrhus</option><option value="Leiothrix lutea">Leiothrix lutea</option><option value="Lepidocolaptes leucogaster">Lepidocolaptes leucogaster</option><option value="Lepidopyga coeruleogularis">Lepidopyga coeruleogularis</option><option value="Lepidopyga lilliae">Lepidopyga lilliae</option><option value="Leptasthenura andicola">Leptasthenura andicola</option><option value="Leptasthenura pileata">Leptasthenura pileata</option><option value="Leptasthenura setaria">Leptasthenura setaria</option><option value="Leptasthenura striata">Leptasthenura striata</option><option value="Leptodon forbesi">Leptodon forbesi</option><option value="Leptopoecile elegans">Leptopoecile elegans</option><option value="Leptopogon taczanowskii">Leptopogon taczanowskii</option><option value="Leptosomus discolor">Leptosomus discolor</option><option value="Leptotila battyi">Leptotila battyi</option><option value="Leptotila conoveri">Leptotila conoveri</option><option value="Lessonia oreas">Lessonia oreas</option><option value="Leucippus fallax">Leucippus fallax</option><option value="Leucophaeus scoresbii">Leucophaeus scoresbii</option><option value="Leucopternis lacernulatus">Leucopternis lacernulatus</option><option value="Leucopternis melanops">Leucopternis melanops</option><option value="Leucosticte tephrocotis">Leucosticte tephrocotis</option><option value="Lichenostomus flavescens">Lichenostomus flavescens</option><option value="Lichenostomus flavicollis">Lichenostomus flavicollis</option><option value="Lichenostomus unicolor">Lichenostomus unicolor</option><option value="Lichmera argentauris">Lichmera argentauris</option><option value="Lichmera deningeri">Lichmera deningeri</option><option value="Lichmera flavicans">Lichmera flavicans</option><option value="Limosa haemastica">Limosa haemastica</option><option value="Liosceles thoracicus">Liosceles thoracicus</option><option value="Lipaugus vociferans">Lipaugus vociferans</option><option value="Lipaugus weberi">Lipaugus weberi</option><option value="Locustella fluviatilis">Locustella fluviatilis</option><option value="Locustella lanceolata">Locustella lanceolata</option><option value="Lonchura atricapilla">Lonchura atricapilla</option><option value="Lonchura caniceps">Lonchura caniceps</option><option value="Lonchura castaneothorax">Lonchura castaneothorax</option><option value="Lonchura cucullata">Lonchura cucullata</option><option value="Lonchura flaviprymna">Lonchura flaviprymna</option><option value="Lonchura fringilloides">Lonchura fringilloides</option><option value="Lonchura hunsteini">Lonchura hunsteini</option><option value="Lonchura melaena">Lonchura melaena</option><option value="Lonchura nigriceps">Lonchura nigriceps</option><option value="Lonchura vana">Lonchura vana</option><option value="Lophophorus impejanus">Lophophorus impejanus</option><option value="Lophophorus lhuysii">Lophophorus lhuysii</option><option value="Lophornis brachylophus">Lophornis brachylophus</option><option value="Lophornis stictolophus">Lophornis stictolophus</option><option value="Lophotriccus vitiosus">Lophotriccus vitiosus</option><option value="Lophozosterops javanicus">Lophozosterops javanicus</option><option value="Lophura diardi">Lophura diardi</option><option value="Lophura erythrophthalma">Lophura erythrophthalma</option><option value="Loriculus vernalis">Loriculus vernalis</option><option value="Luscinia luscinia">Luscinia luscinia</option><option value="Lybius guifsobalito">Lybius guifsobalito</option><option value="Lybius rubrifacies">Lybius rubrifacies</option><option value="Lybius undatus">Lybius undatus</option><option value="Lybius vieilloti">Lybius vieilloti</option><option value="Macgregoria pulchra">Macgregoria pulchra</option><option value="Macroagelaius subalaris">Macroagelaius subalaris</option><option value="Macronyx capensis">Macronyx capensis</option><option value="Macrosphenus pulitzeri">Macrosphenus pulitzeri</option><option value="Malacopteron cinereum">Malacopteron cinereum</option><option value="Malacoptila fusca">Malacoptila fusca</option><option value="Malimbus ballmanni">Malimbus ballmanni</option><option value="Malimbus cassini">Malimbus cassini</option><option value="Malurus cyaneus">Malurus cyaneus</option><option value="Malurus lamberti">Malurus lamberti</option><option value="Manacus candei">Manacus candei</option><option value="Manucodia jobiensis">Manucodia jobiensis</option><option value="Margarornis bellulus">Margarornis bellulus</option><option value="Margarornis stellatus">Margarornis stellatus</option><option value="Megacrex inepta">Megacrex inepta</option><option value="Megalaima monticola">Megalaima monticola</option><option value="Megalurulus grosvenori">Megalurulus grosvenori</option><option value="Megalurulus llaneae">Megalurulus llaneae</option><option value="Megapodius geelvinkianus">Megapodius geelvinkianus</option><option value="Megapodius tenimberensis">Megapodius tenimberensis</option><option value="Megascops atricapilla">Megascops atricapilla</option><option value="Megascops hoyi">Megascops hoyi</option><option value="Megascops marshalli">Megascops marshalli</option><option value="Meiglyptes tukki">Meiglyptes tukki</option><option value="Melanerpes herminieri">Melanerpes herminieri</option><option value="Melanerpes hypopolius">Melanerpes hypopolius</option><option value="Melanerpes pulcher">Melanerpes pulcher</option><option value="Melanitta nigra">Melanitta nigra</option><option value="Melanocharis nigra">Melanocharis nigra</option><option value="Melanopareia maximiliani">Melanopareia maximiliani</option><option value="Melanoperdix niger">Melanoperdix niger</option><option value="Melanoptila glabrirostris">Melanoptila glabrirostris</option><option value="Melidectes belfordi">Melidectes belfordi</option><option value="Melidectes sclateri">Melidectes sclateri</option><option value="Melignomon eisentrauti">Melignomon eisentrauti</option><option value="Melignomon zenkeri">Melignomon zenkeri</option><option value="Melilestes megarhynchus">Melilestes megarhynchus</option><option value="Meliphaga reticulata">Meliphaga reticulata</option><option value="Melipotes gymnops">Melipotes gymnops</option><option value="Melithreptus validirostris">Melithreptus validirostris</option><option value="Mellisuga helenae">Mellisuga helenae</option><option value="Merulaxis stresemanni">Merulaxis stresemanni</option><option value="Mesopicos griseocephalus">Mesopicos griseocephalus</option><option value="Metallura phoebe">Metallura phoebe</option><option value="Metallura tyrianthina">Metallura tyrianthina</option><option value="Metopidius indicus">Metopidius indicus</option><option value="Microcerculus marginatus">Microcerculus marginatus</option><option value="Microdynamis parva">Microdynamis parva</option><option value="Microligea palustris">Microligea palustris</option><option value="Micropsitta meeki">Micropsitta meeki</option><option value="Micropsitta pusio">Micropsitta pusio</option><option value="Milvus milvus">Milvus milvus</option><option value="Mimus gilvus">Mimus gilvus</option><option value="Mimus gundlachii">Mimus gundlachii</option><option value="Mimus melanotis">Mimus melanotis</option><option value="Mimus parvulus">Mimus parvulus</option><option value="Mimus saturninus">Mimus saturninus</option><option value="Mimus thenca">Mimus thenca</option><option value="Mimus trifasciatus">Mimus trifasciatus</option><option value="Mionectes macconnelli">Mionectes macconnelli</option><option value="Mionectes rufiventris">Mionectes rufiventris</option><option value="Mirafra affinis">Mirafra affinis</option><option value="Mirafra angolensis">Mirafra angolensis</option><option value="Mirafra cordofanica">Mirafra cordofanica</option><option value="Mirafra gilletti">Mirafra gilletti</option><option value="Mitu salvini">Mitu salvini</option><option value="Molothrus armenti">Molothrus armenti</option><option value="Monarcha castaneiventris">Monarcha castaneiventris</option><option value="Monarcha mundus">Monarcha mundus</option><option value="Monarcha rubiensis">Monarcha rubiensis</option><option value="Monasa morphoeus">Monasa morphoeus</option><option value="Motacilla flaviventris">Motacilla flaviventris</option><option value="Mulleripicus pulverulentus">Mulleripicus pulverulentus</option><option value="Muscicapa caerulescens">Muscicapa caerulescens</option><option value="Muscicapa muttui">Muscicapa muttui</option><option value="Muscicapa ruficauda">Muscicapa ruficauda</option><option value="Muscicapa sibirica">Muscicapa sibirica</option><option value="Muscicapa ussheri">Muscicapa ussheri</option><option value="Muscisaxicola capistratus">Muscisaxicola capistratus</option><option value="Muscisaxicola flavinucha">Muscisaxicola flavinucha</option><option value="Muscisaxicola fluviatilis">Muscisaxicola fluviatilis</option><option value="Myadestes coloratus">Myadestes coloratus</option><option value="Myadestes lanaiensis">Myadestes lanaiensis</option><option value="Myadestes unicolor">Myadestes unicolor</option><option value="Mycerobas affinis">Mycerobas affinis</option><option value="Mycerobas melanozanthos">Mycerobas melanozanthos</option><option value="Myiagra oceanica">Myiagra oceanica</option><option value="Myiarchus cephalotes">Myiarchus cephalotes</option><option value="Myiarchus tuberculifer">Myiarchus tuberculifer</option><option value="Myioborus ornatus">Myioborus ornatus</option><option value="Myiopagis flavivertex">Myiopagis flavivertex</option><option value="Myiopagis viridicata">Myiopagis viridicata</option><option value="Myiophobus phoenicomitra">Myiophobus phoenicomitra</option><option value="Myiophobus pulcher">Myiophobus pulcher</option><option value="Myiozetetes luteiventris">Myiozetetes luteiventris</option><option value="Myophonus borneensis">Myophonus borneensis</option><option value="Myrmeciza atrothorax">Myrmeciza atrothorax</option><option value="Myrmeciza pelzelni">Myrmeciza pelzelni</option><option value="Myrmecocichla aethiops">Myrmecocichla aethiops</option><option value="Myrmecocichla albifrons">Myrmecocichla albifrons</option><option value="Myrmia micrura">Myrmia micrura</option><option value="Myrmotherula cherriei">Myrmotherula cherriei</option><option value="Myrmotherula fluminensis">Myrmotherula fluminensis</option><option value="Myrmotherula guttata">Myrmotherula guttata</option><option value="Myrmotherula ignota">Myrmotherula ignota</option><option value="Myrmotherula urosticta">Myrmotherula urosticta</option><option value="Myzomela cardinalis">Myzomela cardinalis</option><option value="Myzomela pammelaena">Myzomela pammelaena</option><option value="Myzomela pulchella">Myzomela pulchella</option><option value="Myzomela rubratra">Myzomela rubratra</option><option value="Myzomela sclateri">Myzomela sclateri</option><option value="Napothera epilepidota">Napothera epilepidota</option><option value="Neafrapus boehmi">Neafrapus boehmi</option><option value="Nectarinia afra">Nectarinia afra</option><option value="Nectarinia amethystina">Nectarinia amethystina</option><option value="Nectarinia bifasciata">Nectarinia bifasciata</option><option value="Nectarinia buettikoferi">Nectarinia buettikoferi</option><option value="Nectarinia dussumieri">Nectarinia dussumieri</option><option value="Nectarinia fuelleborni">Nectarinia fuelleborni</option><option value="Nectarinia newtonii">Nectarinia newtonii</option><option value="Nectarinia olivacea">Nectarinia olivacea</option><option value="Nectarinia osea">Nectarinia osea</option><option value="Nectarinia superba">Nectarinia superba</option><option value="Nectarinia veroxii">Nectarinia veroxii</option><option value="Neochmia ruficauda">Neochmia ruficauda</option><option value="Neomixis viridis">Neomixis viridis</option><option value="Neopelma chrysocephalum">Neopelma chrysocephalum</option><option value="Neophema elegans">Neophema elegans</option><option value="Neophema splendida">Neophema splendida</option><option value="Neopsittacus musschenbroekii">Neopsittacus musschenbroekii</option><option value="Neospiza concolor">Neospiza concolor</option><option value="Nigrita bicolor">Nigrita bicolor</option><option value="Nigrita canicapillus">Nigrita canicapillus</option><option value="Niltava davidi">Niltava davidi</option><option value="Niltava grandis">Niltava grandis</option><option value="Nipponia nippon">Nipponia nippon</option><option value="Nisaetus cirrhatus">Nisaetus cirrhatus</option><option value="Nothoprocta taczanowskii">Nothoprocta taczanowskii</option><option value="Nothura boraquira">Nothura boraquira</option><option value="Nothura minor">Nothura minor</option><option value="Numida meleagris">Numida meleagris</option><option value="Nyctanassa violacea">Nyctanassa violacea</option><option value="Nyctibius grandis">Nyctibius grandis</option><option value="Oceanites gracilis">Oceanites gracilis</option><option value="Oceanodroma monteiroi">Oceanodroma monteiroi</option><option value="Ochetorhynchus andaecola">Ochetorhynchus andaecola</option><option value="Ochthoeca cinnamomeiventris">Ochthoeca cinnamomeiventris</option><option value="Ochthoeca fumicolor">Ochthoeca fumicolor</option><option value="Ochthoeca jelskii">Ochthoeca jelskii</option><option value="Oculocincta squamifrons">Oculocincta squamifrons</option><option value="Ocyceros gingalensis">Ocyceros gingalensis</option><option value="Odontophorus capueira">Odontophorus capueira</option><option value="Odontophorus dialeucos">Odontophorus dialeucos</option><option value="Odontophorus erythrops">Odontophorus erythrops</option><option value="Oenanthe leucura">Oenanthe leucura</option><option value="Oncostoma cinereigulare">Oncostoma cinereigulare</option><option value="Onychorhynchus coronatus">Onychorhynchus coronatus</option><option value="Oreomystis bairdi">Oreomystis bairdi</option><option value="Oreopsar bolivianus">Oreopsar bolivianus</option><option value="Oreoscopus gutturalis">Oreoscopus gutturalis</option><option value="Oreostruthus fuliginosus">Oreostruthus fuliginosus</option><option value="Oreotrochilus adela">Oreotrochilus adela</option><option value="Oreotrochilus melanogaster">Oreotrochilus melanogaster</option><option value="Oriolus forsteni">Oriolus forsteni</option><option value="Oriolus larvatus">Oriolus larvatus</option><option value="Oriolus nigripennis">Oriolus nigripennis</option><option value="Oriolus sagittatus">Oriolus sagittatus</option><option value="Oriolus xanthonotus">Oriolus xanthonotus</option><option value="Ortalis ruficauda">Ortalis ruficauda</option><option value="Orthotomus cinereiceps">Orthotomus cinereiceps</option><option value="Otus balli">Otus balli</option><option value="Otus brucei">Otus brucei</option><option value="Otus insularis">Otus insularis</option><option value="Otus lettia">Otus lettia</option><option value="Otus rutilus">Otus rutilus</option><option value="Otus siaoensis">Otus siaoensis</option><option value="Otus silvicola">Otus silvicola</option><option value="Otus sunia">Otus sunia</option><option value="Oxylabes madagascariensis">Oxylabes madagascariensis</option><option value="Oxyruncus cristatus">Oxyruncus cristatus</option><option value="Oxyura leucocephala">Oxyura leucocephala</option><option value="Oxyura vittata">Oxyura vittata</option><option value="Pachycare flavogriseum">Pachycare flavogriseum</option><option value="Pachycephala arctitorquis">Pachycephala arctitorquis</option><option value="Pachycephala hypoxantha">Pachycephala hypoxantha</option><option value="Pachyramphus castaneus">Pachyramphus castaneus</option><option value="Pachyramphus marginatus">Pachyramphus marginatus</option><option value="Pachyramphus polychopterus">Pachyramphus polychopterus</option><option value="Pachyramphus validus">Pachyramphus validus</option><option value="Paradisaea decora">Paradisaea decora</option><option value="Paradoxornis davidianus">Paradoxornis davidianus</option><option value="Paradoxornis margaritae">Paradoxornis margaritae</option><option value="Paradoxornis zappeyi">Paradoxornis zappeyi</option><option value="Parmoptila woodhousei">Parmoptila woodhousei</option><option value="Paroaria gularis">Paroaria gularis</option><option value="Paroreomyza montana">Paroreomyza montana</option><option value="Parus caeruleus">Parus caeruleus</option><option value="Parus cinctus">Parus cinctus</option><option value="Parus gambeli">Parus gambeli</option><option value="Parus holsti">Parus holsti</option><option value="Parus leuconotus">Parus leuconotus</option><option value="Parus monticolus">Parus monticolus</option><option value="Parus rubidiventris">Parus rubidiventris</option><option value="Parus semilarvatus">Parus semilarvatus</option><option value="Parus spilonotus">Parus spilonotus</option><option value="Passer diffusus">Passer diffusus</option><option value="Passer montanus">Passer montanus</option><option value="Patagioenas caribaea">Patagioenas caribaea</option><option value="Patagioenas cayennensis">Patagioenas cayennensis</option><option value="Patagioenas nigrirostris">Patagioenas nigrirostris</option><option value="Patagioenas squamosa">Patagioenas squamosa</option><option value="Pelecanus onocrotalus">Pelecanus onocrotalus</option><option value="Pelecanus thagus">Pelecanus thagus</option><option value="Peltops blainvillii">Peltops blainvillii</option><option value="Penelope ochrogaster">Penelope ochrogaster</option><option value="Penelope purpurascens">Penelope purpurascens</option><option value="Penelope superciliaris">Penelope superciliaris</option><option value="Penelopina nigra">Penelopina nigra</option><option value="Peneothello sigillatus">Peneothello sigillatus</option><option value="Pericrocotus brevirostris">Pericrocotus brevirostris</option><option value="Petroica australis">Petroica australis</option><option value="Petroica bivittata">Petroica bivittata</option><option value="Petronia petronia">Petronia petronia</option><option value="Petronia xanthocollis">Petronia xanthocollis</option><option value="Peucedramus taeniatus">Peucedramus taeniatus</option><option value="Phacellodomus inornatus">Phacellodomus inornatus</option><option value="Phaethornis anthophilus">Phaethornis anthophilus</option><option value="Phaethornis guy">Phaethornis guy</option><option value="Phaethornis hispidus">Phaethornis hispidus</option><option value="Phaethornis idaliae">Phaethornis idaliae</option><option value="Phaethornis koepckeae">Phaethornis koepckeae</option><option value="Phaethornis striigularis">Phaethornis striigularis</option><option value="Phalacrocorax aristotelis">Phalacrocorax aristotelis</option><option value="Phalacrocorax campbelli">Phalacrocorax campbelli</option><option value="Phalacrocorax featherstoni">Phalacrocorax featherstoni</option><option value="Phaps elegans">Phaps elegans</option><option value="Pharomachrus pavoninus">Pharomachrus pavoninus</option><option value="Pheucticus aureoventris">Pheucticus aureoventris</option><option value="Philemon brassi">Philemon brassi</option><option value="Philemon citreogularis">Philemon citreogularis</option><option value="Philemon inornatus">Philemon inornatus</option><option value="Philentoma velata">Philentoma velata</option><option value="Phoeniconaias minor">Phoeniconaias minor</option><option value="Phoenicurus erythrogastrus">Phoenicurus erythrogastrus</option><option value="Phoenicurus frontalis">Phoenicurus frontalis</option><option value="Phoenicurus moussieri">Phoenicurus moussieri</option><option value="Phoenicurus ochruros">Phoenicurus ochruros</option><option value="Phyllastrephus flavostriatus">Phyllastrephus flavostriatus</option><option value="Phyllastrephus terrestris">Phyllastrephus terrestris</option><option value="Phyllomyias urichi">Phyllomyias urichi</option><option value="Phylloscartes parkeri">Phylloscartes parkeri</option><option value="Phylloscartes superciliaris">Phylloscartes superciliaris</option><option value="Phylloscartes venezuelanus">Phylloscartes venezuelanus</option><option value="Phylloscopus borealoides">Phylloscopus borealoides</option><option value="Phylloscopus canariensis">Phylloscopus canariensis</option><option value="Phylloscopus emeiensis">Phylloscopus emeiensis</option><option value="Phylloscopus orientalis">Phylloscopus orientalis</option><option value="Phylloscopus ruficapilla">Phylloscopus ruficapilla</option><option value="Phylloscopus schwarzi">Phylloscopus schwarzi</option><option value="Pica pica">Pica pica</option><option value="Picoides borealis">Picoides borealis</option><option value="Piculus callopterus">Piculus callopterus</option><option value="Piculus litae">Piculus litae</option><option value="Picumnus granadensis">Picumnus granadensis</option><option value="Picumnus nigropunctatus">Picumnus nigropunctatus</option><option value="Picumnus pumilus">Picumnus pumilus</option><option value="Picumnus pygmaeus">Picumnus pygmaeus</option><option value="Picus chlorolophus">Picus chlorolophus</option><option value="Pinarocorys nigricans">Pinarocorys nigricans</option><option value="Pinicola enucleator">Pinicola enucleator</option><option value="Pinicola subhimachala">Pinicola subhimachala</option><option value="Pionopsitta pileata">Pionopsitta pileata</option><option value="Pionus senilis">Pionus senilis</option><option value="Pipile cumanensis">Pipile cumanensis</option><option value="Pipile jacutinga">Pipile jacutinga</option><option value="Pipilo aberti">Pipilo aberti</option><option value="Pipilo crissalis">Pipilo crissalis</option><option value="Pipilo erythrophthalmus">Pipilo erythrophthalmus</option><option value="Pipra filicauda">Pipra filicauda</option><option value="Pipra rubrocapilla">Pipra rubrocapilla</option><option value="Pipraeidea melanonota">Pipraeidea melanonota</option><option value="Pipreola jucunda">Pipreola jucunda</option><option value="Piranga hepatica">Piranga hepatica</option><option value="Pitangus lictor">Pitangus lictor</option><option value="Pithecophaga jefferyi">Pithecophaga jefferyi</option><option value="Pitohui dichrous">Pitohui dichrous</option><option value="Pitta maxima">Pitta maxima</option><option value="Pitta steerii">Pitta steerii</option><option value="Platalea flavipes">Platalea flavipes</option><option value="Platycercus adscitus">Platycercus adscitus</option><option value="Platyrinchus cancrominus">Platyrinchus cancrominus</option><option value="Platysteira cyanea">Platysteira cyanea</option><option value="Platysteira tonsa">Platysteira tonsa</option><option value="Ploceus albinucha">Ploceus albinucha</option><option value="Ploceus dichrocephalus">Ploceus dichrocephalus</option><option value="Ploceus dorsomaculatus">Ploceus dorsomaculatus</option><option value="Ploceus flavipes">Ploceus flavipes</option><option value="Ploceus nigrimentus">Ploceus nigrimentus</option><option value="Ploceus preussi">Ploceus preussi</option><option value="Ploceus sakalava">Ploceus sakalava</option><option value="Ploceus velatus">Ploceus velatus</option><option value="Pnoepyga formosana">Pnoepyga formosana</option><option value="Pnoepyga immaculata">Pnoepyga immaculata</option><option value="Podargus strigoides">Podargus strigoides</option><option value="Podiceps occipitalis">Podiceps occipitalis</option><option value="Podoces panderi">Podoces panderi</option><option value="Poecilotriccus luluae">Poecilotriccus luluae</option><option value="Pogoniulus bilineatus">Pogoniulus bilineatus</option><option value="Pogoniulus scolopaceus">Pogoniulus scolopaceus</option><option value="Poicephalus crassus">Poicephalus crassus</option><option value="Poicephalus gulielmi">Poicephalus gulielmi</option><option value="Poliocephalus rufopectus">Poliocephalus rufopectus</option><option value="Polioptila caerulea">Polioptila caerulea</option><option value="Polioptila dumicola">Polioptila dumicola</option><option value="Polioptila lembeyei">Polioptila lembeyei</option><option value="Polyplectron schleiermacheri">Polyplectron schleiermacheri</option><option value="Polytelis anthopeplus">Polytelis anthopeplus</option><option value="Polytelis swainsonii">Polytelis swainsonii</option><option value="Polytmus milleri">Polytmus milleri</option><option value="Pomarea mendozae">Pomarea mendozae</option><option value="Pomatorhinus erythrocnemis">Pomatorhinus erythrocnemis</option><option value="Pomatostomus superciliosus">Pomatostomus superciliosus</option><option value="Poospiza alticola">Poospiza alticola</option><option value="Poospiza lateralis">Poospiza lateralis</option><option value="Poospiza torquata">Poospiza torquata</option><option value="Poospiza whitii">Poospiza whitii</option><option value="Porphyrospiza caerulescens">Porphyrospiza caerulescens</option><option value="Porzana flaviventer">Porzana flaviventer</option><option value="Prinia leucopogon">Prinia leucopogon</option><option value="Prinia molleri">Prinia molleri</option><option value="Prinia polychroa">Prinia polychroa</option><option value="Prinia rufescens">Prinia rufescens</option><option value="Prinia subflava">Prinia subflava</option><option value="Prioniturus verticalis">Prioniturus verticalis</option><option value="Prionochilus maculatus">Prionochilus maculatus</option><option value="Prionochilus olivaceus">Prionochilus olivaceus</option><option value="Priotelus roseigaster">Priotelus roseigaster</option><option value="Progne elegans">Progne elegans</option><option value="Psarisomus dalhousiae">Psarisomus dalhousiae</option><option value="Psarocolius bifasciatus">Psarocolius bifasciatus</option><option value="Pselliophorus tibialis">Pselliophorus tibialis</option><option value="Psephotus varius">Psephotus varius</option><option value="Pseudobias wardi">Pseudobias wardi</option><option value="Pseudobulweria aterrima">Pseudobulweria aterrima</option><option value="Pseudobulweria rostrata">Pseudobulweria rostrata</option><option value="Pseudocalyptomena graueri">Pseudocalyptomena graueri</option><option value="Pseudocolaptes johnsoni">Pseudocolaptes johnsoni</option><option value="Pseudocolopteryx flaviventris">Pseudocolopteryx flaviventris</option><option value="Pseudoleistes virescens">Pseudoleistes virescens</option><option value="Pseudopodoces humilis">Pseudopodoces humilis</option><option value="Pseudoscops clamator">Pseudoscops clamator</option><option value="Pseudotriccus pelzelni">Pseudotriccus pelzelni</option><option value="Psilopogon pyrolophus">Psilopogon pyrolophus</option><option value="Psilopsiagon aurifrons">Psilopsiagon aurifrons</option><option value="Psittacella modesta">Psittacella modesta</option><option value="Psittacella picta">Psittacella picta</option><option value="Psittacula alexandri">Psittacula alexandri</option><option value="Psittaculirostris desmarestii">Psittaculirostris desmarestii</option><option value="Psophodes occidentalis">Psophodes occidentalis</option><option value="Psophodes olivaceus">Psophodes olivaceus</option><option value="Pterocles bicinctus">Pterocles bicinctus</option><option value="Pterocles decoratus">Pterocles decoratus</option><option value="Pterodroma baraui">Pterodroma baraui</option><option value="Pterodroma heraldica">Pterodroma heraldica</option><option value="Pterodroma sandwichensis">Pterodroma sandwichensis</option><option value="Pteroglossus viridis">Pteroglossus viridis</option><option value="Pteruthius aenobarbus">Pteruthius aenobarbus</option><option value="Ptilinopus bernsteinii">Ptilinopus bernsteinii</option><option value="Ptilinopus granulifrons">Ptilinopus granulifrons</option><option value="Ptilinopus occipitalis">Ptilinopus occipitalis</option><option value="Ptilinopus perlatus">Ptilinopus perlatus</option><option value="Ptilinopus porphyraceus">Ptilinopus porphyraceus</option><option value="Ptilinopus rarotongensis">Ptilinopus rarotongensis</option><option value="Ptilinopus regina">Ptilinopus regina</option><option value="Ptilinopus richardsii">Ptilinopus richardsii</option><option value="Ptilinopus roseicapilla">Ptilinopus roseicapilla</option><option value="Ptilinopus superbus">Ptilinopus superbus</option><option value="Ptilocichla leucogrammica">Ptilocichla leucogrammica</option><option value="Ptilocichla mindanensis">Ptilocichla mindanensis</option><option value="Ptilopsis granti">Ptilopsis granti</option><option value="Ptilorrhoa leucosticta">Ptilorrhoa leucosticta</option><option value="Pucrasia macrolopha">Pucrasia macrolopha</option><option value="Puffinus creatopus">Puffinus creatopus</option><option value="Puffinus opisthomelas">Puffinus opisthomelas</option><option value="Pulsatrix koeniswaldiana">Pulsatrix koeniswaldiana</option><option value="Pycnonotus blanfordi">Pycnonotus blanfordi</option><option value="Pycnonotus capensis">Pycnonotus capensis</option><option value="Pycnonotus leucogrammicus">Pycnonotus leucogrammicus</option><option value="Pycnonotus leucotis">Pycnonotus leucotis</option><option value="Pycnonotus tympanistrigus">Pycnonotus tympanistrigus</option><option value="Pyrenestes minor">Pyrenestes minor</option><option value="Pyrenestes sanguineus">Pyrenestes sanguineus</option><option value="Pyrilia aurantiocephala">Pyrilia aurantiocephala</option><option value="Pyroderus scutatus">Pyroderus scutatus</option><option value="Pyrrhula erythrocephala">Pyrrhula erythrocephala</option><option value="Pyrrhura albipectus">Pyrrhura albipectus</option><option value="Quelea quelea">Quelea quelea</option><option value="Querula purpurata">Querula purpurata</option><option value="Rallus aquaticus">Rallus aquaticus</option><option value="Rallus limicola">Rallus limicola</option><option value="Ramphotrigon megacephalum">Ramphotrigon megacephalum</option><option value="Rhagologus leucostigma">Rhagologus leucostigma</option><option value="Rhaphidura leucopygialis">Rhaphidura leucopygialis</option><option value="Rhaphidura sabini">Rhaphidura sabini</option><option value="Rhinomyias colonus">Rhinomyias colonus</option><option value="Rhinomyias oscillans">Rhinomyias oscillans</option><option value="Rhinomyias ruficauda">Rhinomyias ruficauda</option><option value="Rhinoptilus bitorquatus">Rhinoptilus bitorquatus</option><option value="Rhipidura albicollis">Rhipidura albicollis</option><option value="Rhipidura kubaryi">Rhipidura kubaryi</option><option value="Rhipidura nebulosa">Rhipidura nebulosa</option><option value="Rhopocichla atriceps">Rhopocichla atriceps</option><option value="Rhyacornis fuliginosa">Rhyacornis fuliginosa</option><option value="Rhynchocyclus brevirostris">Rhynchocyclus brevirostris</option><option value="Rhynchopsitta terrisi">Rhynchopsitta terrisi</option><option value="Rhynchostruthus percivali">Rhynchostruthus percivali</option><option value="Riparia paludicola">Riparia paludicola</option><option value="Rollandia rolland">Rollandia rolland</option><option value="Rostratula semicollaris">Rostratula semicollaris</option><option value="Rostrhamus sociabilis">Rostrhamus sociabilis</option><option value="Ruwenzorornis johnstoni">Ruwenzorornis johnstoni</option><option value="Rynchops albicollis">Rynchops albicollis</option><option value="Sakesphorus cristatus">Sakesphorus cristatus</option><option value="Salpornis spilonotus">Salpornis spilonotus</option><option value="Saroglossa spiloptera">Saroglossa spiloptera</option><option value="Sasia africana">Sasia africana</option><option value="Saxicoloides fulicatus">Saxicoloides fulicatus</option><option value="Scelorchilus rubecula">Scelorchilus rubecula</option><option value="Schoenicola platyurus">Schoenicola platyurus</option><option value="Sclerurus caudacutus">Sclerurus caudacutus</option><option value="Sclerurus guatemalensis">Sclerurus guatemalensis</option><option value="Sclerurus mexicanus">Sclerurus mexicanus</option><option value="Scolopax rusticola">Scolopax rusticola</option><option value="Scytalopus fuscus">Scytalopus fuscus</option><option value="Scytalopus superciliaris">Scytalopus superciliaris</option><option value="Scytalopus unicolor">Scytalopus unicolor</option><option value="Scytalopus urubambae">Scytalopus urubambae</option><option value="Seicercus omeiensis">Seicercus omeiensis</option><option value="Seicercus soror">Seicercus soror</option><option value="Seicercus tephrocephalus">Seicercus tephrocephalus</option><option value="Selasphorus platycercus">Selasphorus platycercus</option><option value="Sephanoides sephaniodes">Sephanoides sephaniodes</option><option value="Sericornis arfakianus">Sericornis arfakianus</option><option value="Sericornis perspicillatus">Sericornis perspicillatus</option><option value="Sericornis spilodera">Sericornis spilodera</option><option value="Sericossypha albocristata">Sericossypha albocristata</option><option value="Serinus buchanani">Serinus buchanani</option><option value="Serinus dorsostriatus">Serinus dorsostriatus</option><option value="Serinus frontalis">Serinus frontalis</option><option value="Serinus nigriceps">Serinus nigriceps</option><option value="Serinus thibetanus">Serinus thibetanus</option><option value="Setornis criniger">Setornis criniger</option><option value="Sheppardia aurantiithorax">Sheppardia aurantiithorax</option><option value="Sheppardia sharpei">Sheppardia sharpei</option><option value="Sicalis citrina">Sicalis citrina</option><option value="Sicalis luteola">Sicalis luteola</option><option value="Sicalis raimondii">Sicalis raimondii</option><option value="Siptornopsis hypochondriaca">Siptornopsis hypochondriaca</option><option value="Sitta canadensis">Sitta canadensis</option><option value="Sitta cashmirensis">Sitta cashmirensis</option><option value="Sitta europaea">Sitta europaea</option><option value="Sitta himalayensis">Sitta himalayensis</option><option value="Sitta ledanti">Sitta ledanti</option><option value="Smithornis capensis">Smithornis capensis</option><option value="Snowornis cryptolophus">Snowornis cryptolophus</option><option value="Speirops brunneus">Speirops brunneus</option><option value="Spelaeornis longicaudatus">Spelaeornis longicaudatus</option><option value="Sphecotheres hypoleucus">Sphecotheres hypoleucus</option><option value="Spilornis klossi">Spilornis klossi</option><option value="Spizixos semitorques">Spizixos semitorques</option><option value="Spizocorys personata">Spizocorys personata</option><option value="Sporophila cinnamomea">Sporophila cinnamomea</option><option value="Sporophila collaris">Sporophila collaris</option><option value="Sporophila hypochroma">Sporophila hypochroma</option><option value="Sporophila leucoptera">Sporophila leucoptera</option><option value="Sporophila luctuosa">Sporophila luctuosa</option><option value="Sporophila minuta">Sporophila minuta</option><option value="Sporophila nigrorufa">Sporophila nigrorufa</option><option value="Sporophila schistacea">Sporophila schistacea</option><option value="Spreo fischeri">Spreo fischeri</option><option value="Stachyris chrysaea">Stachyris chrysaea</option><option value="Stachyris nigricollis">Stachyris nigricollis</option><option value="Stachyris nigrocapitata">Stachyris nigrocapitata</option><option value="Stachyris whiteheadi">Stachyris whiteheadi</option><option value="Starnoenas cyanocephala">Starnoenas cyanocephala</option><option value="Stellula calliope">Stellula calliope</option><option value="Sterna acuticauda">Sterna acuticauda</option><option value="Sterna albifrons">Sterna albifrons</option><option value="Sterna albostriata">Sterna albostriata</option><option value="Sterna anaethetus">Sterna anaethetus</option><option value="Sterna antillarum">Sterna antillarum</option><option value="Sterna bergii">Sterna bergii</option><option value="Sterna nereis">Sterna nereis</option><option value="Stiphrornis erythrothorax">Stiphrornis erythrothorax</option><option value="Stipiturus ruficeps">Stipiturus ruficeps</option><option value="Strepera versicolor">Strepera versicolor</option><option value="Streptopelia decaocto">Streptopelia decaocto</option><option value="Streptopelia hypopyrrha">Streptopelia hypopyrrha</option><option value="Streptopelia reichenowi">Streptopelia reichenowi</option><option value="Streptopelia turtur">Streptopelia turtur</option><option value="Streptoprocne rutila">Streptoprocne rutila</option><option value="Streptoprocne zonaris">Streptoprocne zonaris</option><option value="Strix chacoensis">Strix chacoensis</option><option value="Strix fulvescens">Strix fulvescens</option><option value="Strix hylophila">Strix hylophila</option><option value="Strix uralensis">Strix uralensis</option><option value="Strix virgata">Strix virgata</option><option value="Strix woodfordii">Strix woodfordii</option><option value="Sturnella magna">Sturnella magna</option><option value="Sturnus cineraceus">Sturnus cineraceus</option><option value="Sturnus melanopterus">Sturnus melanopterus</option><option value="Suiriri islerorum">Suiriri islerorum</option><option value="Suiriri suiriri">Suiriri suiriri</option><option value="Sylvia leucomelaena">Sylvia leucomelaena</option><option value="Sylvia nisoria">Sylvia nisoria</option><option value="Sylvia rueppelli">Sylvia rueppelli</option><option value="Sylvietta brachyura">Sylvietta brachyura</option><option value="Sylvietta philippae">Sylvietta philippae</option><option value="Sylvietta ruficapilla">Sylvietta ruficapilla</option><option value="Synallaxis azarae">Synallaxis azarae</option><option value="Synallaxis cabanisi">Synallaxis cabanisi</option><option value="Synallaxis cinerascens">Synallaxis cinerascens</option><option value="Synallaxis ruficapilla">Synallaxis ruficapilla</option><option value="Synallaxis zimmeri">Synallaxis zimmeri</option><option value="Syndactyla roraimae">Syndactyla roraimae</option><option value="Synthliboramphus craveri">Synthliboramphus craveri</option><option value="Tachornis phoenicobia">Tachornis phoenicobia</option><option value="Tachycineta stolzmanni">Tachycineta stolzmanni</option><option value="Tangara callophrys">Tangara callophrys</option><option value="Tangara cyanicollis">Tangara cyanicollis</option><option value="Tangara fucosa">Tangara fucosa</option><option value="Tangara icterocephala">Tangara icterocephala</option><option value="Tangara meyerdeschauenseei">Tangara meyerdeschauenseei</option><option value="Tangara nigrocincta">Tangara nigrocincta</option><option value="Tangara peruviana">Tangara peruviana</option><option value="Tangara vassorii">Tangara vassorii</option><option value="Tangara viridicollis">Tangara viridicollis</option><option value="Telophorus bocagei">Telophorus bocagei</option><option value="Tephrodornis pondicerianus">Tephrodornis pondicerianus</option><option value="Terathopius ecaudatus">Terathopius ecaudatus</option><option value="Terenura maculata">Terenura maculata</option><option value="Terenura spodioptila">Terenura spodioptila</option><option value="Terpsiphone viridis">Terpsiphone viridis</option><option value="Tesia cyaniventer">Tesia cyaniventer</option><option value="Tesia everetti">Tesia everetti</option><option value="Tetrao parvirostris">Tetrao parvirostris</option><option value="Tetrao tetrix">Tetrao tetrix</option><option value="Thalassarche cauta">Thalassarche cauta</option><option value="Thalurania furcata">Thalurania furcata</option><option value="Thalurania ridgwayi">Thalurania ridgwayi</option><option value="Thamnistes anabatinus">Thamnistes anabatinus</option><option value="Thamnophilus caerulescens">Thamnophilus caerulescens</option><option value="Thamnophilus nigriceps">Thamnophilus nigriceps</option><option value="Thamnophilus nigrocinereus">Thamnophilus nigrocinereus</option><option value="Thamnophilus zarumae">Thamnophilus zarumae</option><option value="Thaumatibis gigantea">Thaumatibis gigantea</option><option value="Theristicus caerulescens">Theristicus caerulescens</option><option value="Thinornis novaeseelandiae">Thinornis novaeseelandiae</option><option value="Thlypopsis inornata">Thlypopsis inornata</option><option value="Thlypopsis sordida">Thlypopsis sordida</option><option value="Thraupis episcopus">Thraupis episcopus</option><option value="Thripadectes flammulatus">Thripadectes flammulatus</option><option value="Tichodroma muraria">Tichodroma muraria</option><option value="Tinamotis ingoufi">Tinamotis ingoufi</option><option value="Tinamus osgoodi">Tinamus osgoodi</option><option value="Tinamus solitarius">Tinamus solitarius</option><option value="Tockus hemprichii">Tockus hemprichii</option><option value="Todiramphus chloris">Todiramphus chloris</option><option value="Todiramphus godeffroyi">Todiramphus godeffroyi</option><option value="Topaza pella">Topaza pella</option><option value="Toxostoma bendirei">Toxostoma bendirei</option><option value="Trachyphonus vaillantii">Trachyphonus vaillantii</option><option value="Tregellasia leucops">Tregellasia leucops</option><option value="Treron calvus">Treron calvus</option><option value="Treron formosae">Treron formosae</option><option value="Trichastoma celebense">Trichastoma celebense</option><option value="Trichixos pyrropygus">Trichixos pyrropygus</option><option value="Trichoglossus haematodus">Trichoglossus haematodus</option><option value="Trigonoceps occipitalis">Trigonoceps occipitalis</option><option value="Tringa glareola">Tringa glareola</option><option value="Tringa guttifer">Tringa guttifer</option><option value="Troglodytes sissonii">Troglodytes sissonii</option><option value="Trogon caligatus">Trogon caligatus</option><option value="Trogon citreolus">Trogon citreolus</option><option value="Trogon mesurus">Trogon mesurus</option><option value="Trogon rufus">Trogon rufus</option><option value="Turdinus marmorata">Turdinus marmorata</option><option value="Turdoides earlei">Turdoides earlei</option><option value="Turdus fuscater">Turdus fuscater</option><option value="Turdus iliacus">Turdus iliacus</option><option value="Turdus infuscatus">Turdus infuscatus</option><option value="Turdus rubrocanus">Turdus rubrocanus</option><option value="Turdus serranus">Turdus serranus</option><option value="Turnix melanogaster">Turnix melanogaster</option><option value="Turnix tanki">Turnix tanki</option><option value="Tyrannopsis sulphurea">Tyrannopsis sulphurea</option><option value="Tyrannus albogularis">Tyrannus albogularis</option><option value="Tyrannus dominicensis">Tyrannus dominicensis</option><option value="Tyrannus vociferans">Tyrannus vociferans</option><option value="Upucerthia validirostris">Upucerthia validirostris</option><option value="Upupa epops">Upupa epops</option><option value="Uroglaux dimorpha">Uroglaux dimorpha</option><option value="Uropelia campestris">Uropelia campestris</option><option value="Uropsalis lyra">Uropsalis lyra</option><option value="Uropsila leucogastra">Uropsila leucogastra</option><option value="Urosphena subulata">Urosphena subulata</option><option value="Vanellus armatus">Vanellus armatus</option><option value="Vanellus vanellus">Vanellus vanellus</option><option value="Veniliornis dignus">Veniliornis dignus</option><option value="Vidua larvaticola">Vidua larvaticola</option><option value="Vidua maryae">Vidua maryae</option><option value="Vidua obtusa">Vidua obtusa</option><option value="Vidua paradisaea">Vidua paradisaea</option><option value="Vini australis">Vini australis</option><option value="Vini kuhlii">Vini kuhlii</option><option value="Vireo brevipennis">Vireo brevipennis</option><option value="Vireo carmioli">Vireo carmioli</option><option value="Vireo huttoni">Vireo huttoni</option><option value="Vireo plumbeus">Vireo plumbeus</option><option value="Vireolanius eximius">Vireolanius eximius</option><option value="Willisornis poecilinotus">Willisornis poecilinotus</option><option value="Wilsonia citrina">Wilsonia citrina</option><option value="Woodfordia lacertosa">Woodfordia lacertosa</option><option value="Xanthotis provocator">Xanthotis provocator</option><option value="Xenops milleri">Xenops milleri</option><option value="Xenops tenuirostris">Xenops tenuirostris</option><option value="Xiphorhynchus elegan">Xiphorhynchus elegan</option><option value="Xiphorhynchus erythropygius">Xiphorhynchus erythropygius</option><option value="Xiphorhynchus guttatus">Xiphorhynchus guttatus</option><option value="Xiphorhynchus susurrans">Xiphorhynchus susurrans</option><option value="Zaratornis stresemanni">Zaratornis stresemanni</option><option value="Zimmerius bolivianus">Zimmerius bolivianus</option><option value="Zimmerius chrysops">Zimmerius chrysops</option><option value="Zimmerius cinereicapilla">Zimmerius cinereicapilla</option><option value="Zimmerius gracilipes">Zimmerius gracilipes</option><option value="Zoothera camaronensis">Zoothera camaronensis</option><option value="Zoothera dumasi">Zoothera dumasi</option><option value="Zoothera leucolaema">Zoothera leucolaema</option><option value="Zoothera marginata">Zoothera marginata</option><option value="Zoothera wardii">Zoothera wardii</option><option value="Zosterops abyssinicus">Zosterops abyssinicus</option><option value="Zosterops albogularis">Zosterops albogularis</option><option value="Zosterops hypolais">Zosterops hypolais</option><option value="Zosterops japonicus">Zosterops japonicus</option><option value="Zosterops maderaspatanus">Zosterops maderaspatanus</option><option value="Zosterops rendovae">Zosterops rendovae</option><option value="Zosterops rotensis">Zosterops rotensis</option><option value="Zosterops stalkeri">Zosterops stalkeri</option><option value="Zosterops tenuirostris">Zosterops tenuirostris</option><option value="Zosterops uropygialis">Zosterops uropygialis</option><option value="Zosterops vellalavella">Zosterops vellalavella</option><option value="Zosterops xanthochroa">Zosterops xanthochroa</option></select></div>')
            //    .dialog({width:350, height:110});
            this._super(html);
            this.goButton = $(this).find('.execute');
            this.toggleButton = $(this).find('.toggle');
            this.searchDisplay = $(this).find('.searchDisplay');
            this.searchBox = $(this).find('.value');
        },

        clear: function() {
            this.searchBox.html('');
        }
    });
};
/**
 * This module handles add-layers events and layer-toggle events. tI basically
 * proxies the CartoDB JavaScript API for adding and removing CartoDB layers
 * to and from the map.
 */
mol.modules.map.tiles = function(mol) {

    mol.map.tiles = {};

    /**
     * Based on the CartoDB point density gallery example by Andrew Hill at
     * Vizzuality (andrew@vizzuality.com).
     *
     * @see http://developers.cartodb.com/gallery/maps/densitygrid.html
     */
    mol.map.tiles.TileEngine = mol.mvp.Engine.extend({
        init: function(proxy, bus, map) {
            this.proxy = proxy;
            this.bus = bus;
            this.map = map;
            this.gmap_events = [];
            this.addEventHandlers();
        },

        addEventHandlers: function() {
            var self = this;

            /**
             * Handler for when the layer-toggle event is fired. This renders
             * the layer on the map if visible, and removes it if not visible.
             * The event.layer is a layer object {id, name, type, source}. event.showing
             * is true if visible, false otherwise.
             */
             this.bus.addHandler(
                'layer-toggle',
                function(event) {
                        var showing = event.showing,
                            layer = event.layer,
                            params = null,
                            e = null;

                        if (showing) {
                            self.map.overlayMapTypes.forEach(
                                function(mt, index) {
                                    if (mt != undefined && mt.name == layer.id) {
                                        params = {
                                            layer: layer,
                                            opacity: mt.opacity_visible
                                        };
                                        e = new mol.bus.Event('layer-opacity', params);
                                        self.bus.fireEvent(e);
                                        //if(maptype.interaction != undefined) {
                                        //    maptype.interaction.add();
                                        //    maptype.interacton.clickAction="full"
                                        //}
                                        return;
                                    }
                                }
                            );
                            //self.renderTiles([layer]);
                        } else { // Remove layer from map.
                            self.map.overlayMapTypes.forEach(
                                function(mt, index) {
                                    if (mt != undefined && mt.name == layer.id) {
                                        mt.opacity_visible = mt.opacity;
                                        params = {
                                            layer: layer,
                                            opacity: 0
                                        };
                                        e = new mol.bus.Event(
                                            'layer-opacity',
                                            params
                                        );
                                        self.bus.fireEvent(e);
                                        if(mt.interaction != undefined) {
                                            mt.interaction.remove();
                                            mt.interaction.clickAction="";
                                        }
                                        //self.map.overlayMapTypes.removeAt(index);
                                    }
                                }
                            );
                        }
                    }
                );
                /**
                 * Handler for changing layer opacity. The event.opacity is a
                 * number between 0 and 1.0 and the event.layer is an object
                 * {id, name, source, type}.
                 */
                this.bus.addHandler(
                    'layer-opacity',
                    function(event) {
                        var layer = event.layer,
                            opacity = event.opacity;

                        if (opacity === undefined) {
                            return;
                        }

                        self.map.overlayMapTypes.forEach(
                            function(maptype, index) {
                                if (maptype.name === layer.id) {
                                    maptype.setOpacity(opacity);
                                }
                            }
                        );
                    }
                );

                /**
                 * Handler for applying cartocss style to a layer.
                 */
                this.bus.addHandler(
                    'apply-layer-style',
                    function(event) {
                        var layer = event.layer,
                            style = event.style;

                        self.map.overlayMapTypes.forEach(
                            function(maptype, index) {
                                //find the overlaymaptype to style
                                if(maptype != undefined) {
                                if (maptype.name === layer.id) {
                                    //remove it from the map
                                    self.map.overlayMapTypes.removeAt(index);
                                    //add the style
                                    layer.tile_style = style;
                                    //this is for cdb layers
                                    layer.mode='cdb';
                                    //make the layer
                                    self.getTile(layer);
                                    //fix the layer order
                                    self.map.overlayMapTypes.forEach(
                                        function(newmaptype, newindex) {
                                            var mt,
                                                e,
                                                params = {
                                                    layer: layer,
                                                    opacity: maptype.opacity
                                                };
                                            if(newmaptype.name === layer.id) {
                                                mt = self.map.overlayMapTypes.removeAt(newindex);
                                                self.map.overlayMapTypes.insertAt(index, mt);
                                                e = new mol.bus.Event(
                                                    'layer-opacity',
                                                    params
                                                );
                                                self.bus.fireEvent(e);
                                                return;
                                            }
                                        }
                                    );
                                }
                            }
                            }
                        );



                    }
                );

                /**
                 * Handler for when the add-layers event is fired. This renders
                 * the layers on the map by firing a add-map-layer event. The
                 * event.layers is an array of layer objects {name:, type:}.
                 */
                this.bus.addHandler(
                    'add-layers',
                    function(event) {
                        self.renderTiles(event.layers);
                    }
                );
                /**
                 * Handler for when the toggle-ee-filter event is fired. This
                 * switches the layer's getTile to point to earth engine
                 */
                this.bus.addHandler(
                    'toggle-ee-filter',
                    function(event) {
                        var layer = event.layer,
                            layerAdded = false;

                        self.map.overlayMapTypes.forEach(
                            function(maptype, index) {
                                //find the overlaymaptype to switch to ee
                                if (maptype != undefined) {
                                    if (maptype.name === layer.id) {
                                        //remove it from the map
                                        if(maptype.interaction != undefined) {
                                            maptype.interaction.remove();
                                            maptype.interaction.clickAction="";
                                        }
                                        self.map.overlayMapTypes.removeAt(index);
                                        //put it back the layer
                                        self.getTile(layer);
                                        //fix the layer order
                                        self.map.overlayMapTypes.forEach(
                                            function(newmaptype, newindex) {
                                                var mt,
                                                    e,
                                                    params = {
                                                        layer: layer,
                                                        opacity: maptype.opacity
                                                    };
                                                if(newmaptype.name === layer.id) {
                                                    mt = self.map.overlayMapTypes.removeAt(newindex);
                                                    self.map.overlayMapTypes.insertAt(index, mt);
                                                    layerAdded = true;
                                                    e = new mol.bus.Event(
                                                        'layer-opacity',
                                                        params
                                                    );
                                                    self.bus.fireEvent(e);
                                                    return;
                                                }
                                            }
                                        );
                                    }
                                }
                            }
                        );
                        if(!layerAdded) {
                            self.getTile(layer);
                        }

                    }
                );
                /**
                 * Handler for when the remove-layers event is fired. This
                 * functions removes all layers from the Google Map. The
                 * event.layers is an array of layer objects {id}.
                 */
                    this.bus.addHandler(
                    'remove-layers',
                    function(event) {
                        var layers = event.layers,
                            mapTypes = self.map.overlayMapTypes;

                        _.each(
                            layers,
                            function(layer) { // "lid" is short for layer id.
                                var lid = layer.id;
                                mapTypes.forEach(
                                    function(mt, index) {
                                        if (mt != undefined && mt.name === lid) {
                                            if(mt.interaction != undefined) {
                                                mt.interaction.remove();
                                            }
                                            mapTypes.removeAt(index);
                                        }
                                    }
                                );
                            }
                        );
                    }
                );

                    /**
                     * Handler for when the reorder-layers event is fired. This
                     * renders the layers according to the list of layers
                     * provided
                     */
                    this.bus.addHandler(
                         'reorder-layers',
                         function(event) {
                              var layers = event.layers,
                            mapTypes = self.map.overlayMapTypes;

                              _.each(
                                   layers,
                                   function(lid) { // "lid" is short for layerId.
                                        mapTypes.forEach(
                                             function(mt, index) {
                                                  if ((mt != undefined) &&
                                                      (mt.name === lid)) {
                                                      mapTypes.removeAt(index);
                                                      mapTypes.insertAt(0, mt);
                                                  }
                                             }
                                        );
                                   }
                              );
                         }
                    );
            },

            /**
             * Renders an array a tile layers.
             *
             * @param layers the array of layer objects {name, type}
             */
            renderTiles: function(layers) {
                var overlays = this.map.overlayMapTypes.getArray(),
                    newLayers = this.filterLayers(layers, overlays),
                    self = this;

                _.each(
                    newLayers,
                    function(layer) {
                        var maptype = self.getTile(layer);
                    },
                    self
                );
            },
            /**
             * Returns an array of layer objects that are not already on the
             * map.
             *
             * @param layers an array of layer object {id, name, type, source}.
             * @params overlays an array of wax connectors.
             */
            filterLayers: function(layers, overlays) {
                var layerIds = _.map(
                        layers,
                        function(layer) {
                            return layer.id;
                        }
                    ),
                    overlayIds = _.map(
                        overlays,
                        function(overlay) {
                            return overlay.name;
                        }
                    ),
                    ids = _.without(layerIds, overlayIds);

                return _.filter(
                    layers,
                    function(layer) {
                        return (_.indexOf(ids, layer.id) != -1);
                    },
                    this
                );
            },

            /**
             * Closure around the layer that returns the ImageMapType for the
             * tile.
             */
            getTile: function(layer) {
                var name = layer.name,
                    type = layer.type,
                    self = this;
                if(layer.mode=='cdb') {
                    maptype = new mol.map.tiles.CartoDbTile(
                                layer,
                                layer.style_table,
                                this.map
                            );

                    maptype.layer.params.layer.onbeforeload = function (){
                        self.bus.fireEvent(
                            new mol.bus.Event(
                                "show-loading-indicator",
                                {source : layer.id}
                            )
                        )
                    };

                    maptype.layer.params.layer.onafterload = function (){
                        self.bus.fireEvent(
                            new mol.bus.Event(
                                "hide-loading-indicator",
                                {source : layer.id}
                            )
                        )
                    };
                } else {
                    self.bus.fireEvent(
                        new mol.bus.Event(
                            "show-loading-indicator",
                            {source : layer.id}
                        )
                    );
                    $.getJSON(
                        'ee_{0}'.format(layer.filter_mode),
                        {
                            sciname: layer.name,
                            habitats: layer.selectedHabitats[layer.filter_mode].join(','),
                            elevation: layer.selectedElev.join(','),
                            year: layer.selectedYear,
                            get_area: false
                        },
                        function (ee) {
                            var maptype = new mol.map.tiles.EarthEngineTile(
                                ee,
                                layer,
                                self.map
                            );
                            maptype.layer.onafterload = function (){
                                self.bus.fireEvent(
                                    new mol.bus.Event(
                                        "hide-loading-indicator",
                                        {source : layer.id}
                                    )
                                )
                            };
                            maptype.layer.onbeforeload = function (){
                                self.bus.fireEvent(
                                    new mol.bus.Event(
                                        "show-loading-indicator",
                                        {source : layer.id}
                                    )
                                )
                            };
                           self.map.overlayMapTypes.insertAt(0,maptype.layer);
                        }
                    );
                    $.getJSON(
                        'ee_{0}'.format(layer.filter_mode),
                        {
                            sciname: layer.name,
                            habitats: layer.selectedHabitats[layer.filter_mode].join(','),
                            elevation: layer.selectedElev.join(','),
                            year: layer.selectedYear,
                            get_area: true
                        },
                        function (ee) {
                            var maptype = new mol.map.tiles.EarthEngineTile(
                                ee,
                                layer,
                                self.map
                            );
                            maptype.layer.onafterload = function (){
                                self.bus.fireEvent(
                                    new mol.bus.Event(
                                        "hide-loading-indicator",
                                        {source : layer.id}
                                    )
                                )
                            };
                            maptype.layer.onbeforeload = function (){
                                self.bus.fireEvent(
                                    new mol.bus.Event(
                                        "show-loading-indicator",
                                        {source : layer.id}
                                    )
                                )
                            };
                           $("<div>" +
                                "{0}<br>".format(layer.name) +
                                "Expert map range size: {0}".format(Math.round(ee.total_area)) +
                                " km<sup><font size=-2>2</font></sup><br>" +
                                "Refined range size: {0}".format(Math.round(ee.clipped_area)) +
                            " km<sup><font size=-2>2</font></sup></div>").dialog({width: 400});
                        }
                    );

                };
            }
        }
     );

    mol.map.tiles.CartoDbTile = Class.extend(
        {
            init: function(layer, table, map) {
                var sql =  "" +
                    "SELECT cache_key.* FROM " +
                    " get_tile('{0}','{1}','{2}','{3}') cache_key".format(
                        layer.source,
                        layer.type,
                        layer.name,
                        layer.dataset_id
                    ),
                    hostname =  mol.services.cartodb.tileApi.host,
                    style_table_name = layer.style_table;
                    info_query = sql;
                    meta_query = "" +
                        "SELECT * FROM get_feature_metadata(TEXT('{0}'))",
                    infowindow = true,
                    hostname = (hostname === 'localhost') ?
                       '{0}:8080'.format(hostname) : hostname;

                if(layer.tile_style == undefined) {
                    layer.tile_style = "#" + layer.dataset_id + layer.css;
                    layer.style = layer.tile_style;
                    layer.orig_style = layer.tile_style;

                    layer.orig_opacity = layer.opacity;
                }

                this.layer = new google.maps.CartoDBLayer({
                        tile_name: layer.id,
                        tile_style: layer.tile_style,
                        hostname: hostname,
                        map_canvas: 'map_container',
                        map: map,
                        user_name: 'mol',
                        table_name: table,
                        mol_layer: layer,
                        style_table_name: layer.dataset_id,
                        query: sql,
                        info_query: info_query,
                        meta_query: meta_query,
                        map_style: false,
                        infowindow: infowindow,
                        opacity: layer.opacity
                });
            }
        }
    );
    mol.map.tiles.EarthEngineTile = Class.extend({
            init: function(ee, layer, map) {
                var eeMapOptions = {
                        getTileUrl: function(tile, zoom) {
                            var y = tile.y,
                                x = tile.x,
                                tileRange = 1 << zoom;
                            if (y < 0 || y >= tileRange) {
                                return null;
                            }
                            if (x < 0 || x >= tileRange) {
                                x = (x % tileRange + tileRange) % tileRange;
                            }

                            if (self.layer.pending.length === 1) {
                                $(self.layer).trigger("onbeforeload");
                            }

                            return ee.urlPattern.replace("{X}",x).replace("{Y}",y).replace("{Z}",zoom);
                        },
                        tileSize: new google.maps.Size(256, 256),
                        maxZoom: 9,
                        minZoom: 0
                },
                self = this;

                this.layer= new google.maps.ImageMapType(eeMapOptions);
                this.layer.baseGetTile = this.layer.getTile;

                this.layer.pending = [];
                //override getTile so we can add in an event when finished
                this.layer.getTile = function(tileCoord, zoom, ownerDocument) {

                    // Get the DOM node generated by the out-of-the-box ImageMapType
                    var node = self.layer.baseGetTile(tileCoord, zoom, ownerDocument);

                    // Listen for any images within the node to finish loading
                    $("img", node).one("load", function() {

                        // Remove the image from our list of pending urls
                        var index = $.inArray(this.__src__, self.layer.pending);
                        self.layer.pending.splice(index, 1);

                        // If the pending url list is empty, emit an event to
                        // indicate that the tiles are finished loading
                        if (self.layer.pending.length === 0) {
                            $(self.layer).trigger("onafterload");
                        }
                    });

                    return node;
                };

                this.layer.layer = layer;
                this.layer.name = layer.id;

            }
        }
    );
};
mol.modules.map.dashboard = function(mol) {

    mol.map.dashboard = {};

    mol.map.dashboard.DashboardEngine = mol.mvp.Engine.extend(
        {
            init: function(proxy, bus) {
                this.proxy = proxy;
                this.bus = bus;
                this.summary_sql = '' +
                    'SELECT DISTINCT * ' +
                    'FROM get_dashboard_summary()';
                this.dashboard_sql = '' +
                    'SELECT DISTINCT * ' +
                    'FROM dash_cache ' +
                    'ORDER BY dataset_title asc';
                this.summary = null;
                this.types = {};
                this.sources = {};

            },

            start: function() {
                this.initDialog();
                this.addDashboardMenuButton();
            },

            addDashboardMenuButton : function() {
               var html = '' +
                    '<div ' +
                        'title="Toggle dashboard." ' +
                        'id="dashboard" ' +
                        'class="widgetTheme dash button">' +
                        'Dashboard' +
                    '</div>',
                    params = {
                        button: html
                    },
                    event = new mol.bus.Event('add-dashboard-toggle-button', params);

               this.bus.fireEvent(event);
            },

            addEventHandlers: function() {
                var self = this;

                /**
                 * Callback that toggles the dashboard display visibility.
                 *
                 * @param event mol.bus.Event
                 */
                this.bus.addHandler(
                    'taxonomy-dashboard-toggle',
                    function(event) {
                        var params = null,
                            e = null;
                        if (event.state === undefined) {
                            if(self.display.dialog('isOpen')) {
                                self.display.dialog('close');
                            } else {
                                self.display.dialog('open');
                            }
                        } else {
                            self.display.dialog(event.state);
                        }
                    }
                );

                _.each(
                    this.display.datasets,
                    function(dataset) {
                        var provider = $(dataset).data('provider'),
                            type = $(dataset).data('type_id'),
                            dataset_id = $(dataset).data('dataset_id'),
                            dataset_title = $(dataset).data('dataset_title'),
                            type_title = $(dataset).data('type');

                        $(dataset).find('.table').click (
                            function(event) {
                                self.bus.fireEvent(
                                    new mol.bus.Event(
                                        'metadata-toggle',
                                        {params:
                                            {dataset_id: dataset_id,
                                             title: dataset_title}}
                                     )
                                 );
                            }
                        );
                        $(dataset).find('.type').click (
                                function(event) {
                                    self.bus.fireEvent(
                                        new mol.bus.Event(
                                            'metadata-toggle',
                                            {params:{type: type, title: type_title}}));
                                }
                         );
                    }
                );
            },

            /**
             * Fires the 'add-map-control' event. The mol.map.MapEngine handles
             * this event and adds the display to the map.
             */
            initDialog: function() {
                var self = this;

                $.getJSON(
                    mol.services.cartodb.sqlApi.jsonp_url.format(this.dashboard_sql),
                    function(response) {
                        self.display = new mol.map.dashboard.DashboardDisplay(
                            response.rows, self.summary
                        );
                        self.display.dialog(
                            {
                                autoOpen: false,
                                width: 946,
                                height: 600,
                                minHeight: 300,
                                stack: true,
                                dialogClass: "mol-Dashboard",
                                title: 'Dashboard - ' +
                                'Statistics for Data Served by the Map of Life',
                                open: function(event, ui) {
                                     $(".mol-Dashboard-TableWindow")
                                        .height(
                                            $(".mol-Dashboard").height()-95);

                                     //need this to force zebra on the table
                                     self.display.dashtable
                                        .trigger("update", true);
                                }
                            }
                        );

                        $(".mol-Dashboard").parent().bind("resize", function() {
                            $(".mol-Dashboard-TableWindow")
                                .height($(".mol-Dashboard").height()-95);
                        });
                        self.addEventHandlers();
                    }
                );

                $.getJSON(
                    mol.services.cartodb.sqlApi.jsonp_url.format(this.summary_sql),
                    function(response) {
                        self.summary = response.rows[0];
                        if(self.display) {
                            self.display.fillSummary(self.summary);
                        }
                    }
                );
            }
        }
    );

    mol.map.dashboard.DashboardDisplay = mol.mvp.View.extend(
        {
            init: function(rows, summary) {
                var html = '' +
                    '<div id="dialog">' +
                    '  <div >' +
                    '    <div class="summary">' +
                    '      <span class="label">' +
                             'Data sources:' +
                    '      </span>' +
                    '      <span class="providers">' +
                    '      </span>' +
                    '      <span class="label">' +
                             'Datasets:' +
                    '      </span>' +
                    '      <span class="datasets">' +
                    '      </span>' +
                    '      <span class="label">' +
                             'Species names in source data:' +
                    '      </span>' +
                    '      <span class="names">' +
                    '      </span>' +
                    '      <span class="label">' +
                             'Accepted species names:' +
                    '      </span>' +
                    '      <span class="all_matches">' +
                    '      </span>' +
                    '      <span class="label">' +
                             'Total records:' +
                    '      </span>' +
                    '      <span class="records_total">' +
                    '      </span>' +
                    '    </div>' +
                    '    <div class="mol-Dashboard-TableWindow">' +
                    '      <table class="dashtable">' +
                    '       <thead>' +
                    '        <tr>' +
                    '          <th><b>Dataset</b></th>' +
                    '          <th><b>Type</b></th>' +
                    '          <th><b>Source</b></th>' +
                    '          <th><b>Taxon</b></th>' +
                    '          <th><b>Species Names</b></th>' +
                    '          <th><b>Records</b></th>' +
                    '          <th><b>% Match</b></th>' +
                    '        </tr>' +
                    '       </thead>' +
                    '       <tbody class="tablebody"></tbody>' +
                    '      </table>' +
                    '    </div>' +
                    '  <div>' +
                    '</div>  ',
                    self = this;


                this._super(html);
                _.each(
                    rows,
                    function(row) {
                        self.fillRow(row);
                    }
                )

                this.dashtable = $(this).find('.dashtable');
                this.dashtable.tablesorter({
                    sortList: [[0,0]],
                    widthFixed: true,
                    theme: "blue",
                    widgets: ["filter","zebra"]
                });
                this.datasets = $(this).find('.dataset');

                this.dashtable.find("tr.master")
                    .click(function() {
                        $(this).parent().find('tr').each(
                            function(index, elem) {
                                $(elem).find('td').each(
                                    function(index, el) {
                                        if($(el).hasClass('selectedDashRow')) {
                                            $(el).removeClass('selectedDashRow');
                                        }
                                    }
                                )
                            }
                        )

                        $(this).find('td').each(
                            function(index, elem) {
                                $(elem).addClass('selectedDashRow');
                            }
                        )
                    }
                );

                if(summary!=null) {
                    self.fillSummary(summary);
                }
            },

            fillRow:  function(row) {
                var self = this;

                $(this).find('.tablebody').append(
                    new mol.map.dashboard.DashboardRowDisplay(row));
            },

            fillSummary: function(summary) {
                var self = this;
                _.each(
                    _.keys(summary),
                    function(stat){
                        $(self).find('.{0}'.format(stat)).text(summary[stat]);
                    }
                )
            }
        }
    );

    mol.map.dashboard.DashboardRowDisplay = mol.mvp.View.extend(
        {
            init: function(row) {
                var html = '' +
                    '<tr class="master dataset">' +
                        '<td class="table {8}">{8}</td>' +
                        '<td class="type {0}">{1}</td>' +
                        '<td class="provider {2}">{3}</td>' +
                        '<td class="class {4}">{5}</td>' +
                        '<td class="spnames">{6}</td>' +
                        '<td class="records">{7}</td>' +
                        '<td class="pctmatch">{9}</td>' +
                    '</tr>',
                    self = this;

                self._super(
                    html.format(
                        row.type_id,
                        row.type,
                        row.dataset_id,
                        row.provider,
                        row.classes.split(',').join(' '),
                        row.classes.split(',').join(', '),
                        this.format(row.species_count),
                        this.format(row.feature_count),
                        row.dataset_title,
                        row.pct_in_tax
                    )
                );
                //store some data in each dataset/row
                 _.each(
                     _.keys(row),
                     function(key) {
                        $(self).data(key, row[key]);
                     }
                );
            },

            format: function(number, comma, period) {
                var reg = /(\d+)(\d{3})/;
                var split = number.toString().split('.');
                var numeric = split[0];
                var decimal;

                comma = comma || ',';
                period = period || '.';
                decimal = split.length > 1 ? period + split[1] : '';

                while (reg.test(numeric)) {
                  numeric = numeric.replace(reg, '$1' + comma + '$2');
                }

                return numeric + decimal;
            }
         }
    );



};mol.modules.map.query = function(mol) {

    mol.map.query = {};

    mol.map.query.QueryEngine = mol.mvp.Engine.extend({
        init : function(proxy, bus, map) {
            this.proxy = proxy;
            this.bus = bus;
            this.map = map;
            this.url = '' +
                'http://mol.cartodb.com/' +
                'api/v2/sql?callback=?&q={0}';
            // TODO: Docs for what this query does.
            this.sql = '' +
                "SELECT * FROM get_species_list('{0}',{1},{2},{3},'{4}')";
             // TODO: Docs for what this query does.
            this.csv_sql = '' +
                "SELECT * FROM get_species_list_csv('{0}',{1},{2},{3},'{4}')";
            this.queryct=0;
        },

        start : function() {
            this.addQueryDisplay();
            this.addEventHandlers();
            
            //disable all map clicks
            this.toggleMapLayerClicks(false);
        },
        
        toggleMapLayerClicks : function(boo) {            
            //true to disable
            this.bus.fireEvent(
                new mol.bus.Event('layer-click-toggle', {disable: boo}));          
        },
        
        /*
         *  Add the species list tool controls to the map.
         */
        addQueryDisplay : function() {
            var params = {
                display: null,
                slot: mol.map.ControlDisplay.Slot.TOP,
                position: google.maps.ControlPosition.TOP_RIGHT
            };
            
            this.bus.fireEvent(new mol.bus.Event('register-list-click'));
            this.enabled=true;
            this.features={};
            this.display = new mol.map.QueryDisplay();
            params.display = this.display;
            this.bus.fireEvent(new mol.bus.Event('add-map-control', params));
        },
        /*
         *  Method to build and submit an AJAX call that retrieves species
         *  at a radius around a lat, long.
         */
        getList: function(lat, lng, listradius, dataset_id, className) {
            var self = this,
                //hardcode class for now
                _class = (dataset_id == "ecoregion_species") ? "Reptilia" : "",
                sql = this.sql.format(
                    dataset_id,
                    Math.round(lng*100)/100, 
                    Math.round(lat*100)/100,
                    listradius.radius,
                    _class),
                csv_sql = escape(
                    this.csv_sql.format(
                        dataset_id,
                        Math.round(lng*100)/100, 
                        Math.round(lat*100)/100,
                        listradius.radius,
                        _class)),
                params = {
                    sql:sql,
                    key: '{0}'.format(
                        (lat+'-'+lng+'-'+listradius.radius+dataset_id))
                };

            if (self.queryct > 0) {
                alert('Please wait for your last species list request to ' +
                'complete before starting another.');
            } else {
                self.queryct++;
                $.getJSON(
                    self.url.format(sql),
                    function(data, textStatus, jqXHR) {
                        var results = {
                            listradius:listradius,
                            dataset_id: dataset_id,
                            _class: _class,
                            className : className,
                            response:data,
                            sql:csv_sql
                        },
                        e = new mol.bus.Event('species-list-query-results',
                            results);
                        self.queryct--;
                        self.bus.fireEvent(e);
                    }
                );
            }
        },

        addEventHandlers : function () {
            var self = this;
            /*
             * Attach some rules to the ecoregion /
             * range button-switch in the controls.
             */
            _.each(
                $('button',$(this.display.types)),
                function(button) {
                    $(button).click(
                        function(event) {
                            $('button',$(self.display.types))
                                .removeClass('selected');
                            $(this).addClass('selected');
                            if ($(this).hasClass('range') &&
                                self.display.dataset_id.val().
                                    toLowerCase().indexOf('reptil') > 0) {
                                alert('Available for North America only.');
                            }
                        }
                    );
                }
            );
            
            /*
             * Toggle Click Handler for Species List Clicking
             */
            this.display.queryButton.click(
                function() {
                    $(self.display.queryButton).toggleClass('selected');
                    
                    if($(self.display.queryButton).hasClass('selected')) {
                        $(self.display.queryButton).html("ON");
                        self.toggleMapLayerClicks(true);
                    } else {
                        $(self.display.queryButton).html("OFF");
                        self.toggleMapLayerClicks(false);
                    }
                }
            );
            this.bus.addHandler(
                'dialog-closed-click',
                function(event) {                  
                    if($.cookie('mol_species_list_query_tip_disabled') == null) {
                        $(self.display.queryButton).qtip({
                            content: {
                                text: 'Species list querying is currently ' +
                                      'disabled. Toggle this button to enable' +
                                      ' querying and left-click the map to' + 
                                      ' generate a list.',
                                title: {
                                    text: 'Species List Tool',
                                    button: true
                                }     
                                
                            },
                            position: {
                                my: 'top right',
                                at: 'bottom left'
                            },
                            show: {
                                event: false,
                                ready: true
                            },
                            hide: {
                                fixed: false,
                                event: 'mouseenter'
                            }
                        });
                        
                        $.cookie(
                            'mol_species_list_query_tip_disabled', 
                            'tip_seen',
                            {expires: 1});
                    }
                }
            );
            
            /*
             *  Map click handler that starts a list tool request.
             */
            this.bus.addHandler(
                'species-list-query-click',
                function (event) {
                    var listradius,
                        dataset_id = $("option:selected",
                            $(self.display.dataset_id)).data(
                                $('.selected',$(self.display.types)).val() 
                            ),
                        className =  $("option:selected",
                            $(self.display.dataset_id)).text();
                    
                    if($(self.display).data('qtip')) {
                        $(self.display).qtip('destroy');
                    }

                    if (self.enabled 
                            && 
                            $(self.display.queryButton).hasClass('selected')) {
                        listradius = new google.maps.Circle(
                            {
                                map: event.map,
                                radius: parseInt(
                                    self.display.radiusInput.val())*1000,
                                    // 50 km
                                center: event.gmaps_event.latLng,
                                strokeWeight: 3,
                                strokeColor: 'darkred',
                                clickable:false,
                                fillOpacity:0,

                            }
                        );
                        self.bus.fireEvent(new mol.bus.Event(
                            'show-loading-indicator',
                            {source : 'listradius'}));

                        _.each(
                            self.features,
                            function(feature) {
                                if(feature.listWindow) {
                                    feature.listWindow.dialog("close");
                                }
                            }
                        )

                        self.getList(
                            event.gmaps_event.latLng.lat(),
                            event.gmaps_event.latLng.lng(),
                            listradius,
                            dataset_id,
                            className);
                    }
                }
            );

            /*
             *  Assembles HTML for an species list given results from
             *  an AJAX call made in getList.
             */
            this.bus.addHandler(
                'species-list-query-results',
                function (event) {
                    var className,
                        listradius  = event.listradius,
                        latHem,
                        lngHem,
                        listRowsDone;

                    if (!event.response.error) {
                        className = event.className;
                        latHem = (listradius.center.lat() > 0) ? 'N' : 'S';
                        lngHem = (listradius.center.lng() > 0) ? 'E' : 'W';

                        listRowsDone = self.processListRows(
                                            listradius,
                                            className,
                                            latHem,
                                            lngHem,
                                            event.response.rows,
                                            event.sql);

                        self.displayListWindow(
                            listradius,
                            listRowsDone.speciestotal,
                            className,
                            latHem,
                            lngHem,
                            event.response.rows,
                            listRowsDone.content,
                            listRowsDone.dlContent,
                            listRowsDone.iucnContent);
                    } else {
                        listradius.setMap(null);
                        delete(
                            self.features[listradius.center.toString()+
                                          listradius.radius]);
                    }
                    self.bus.fireEvent(
                        new mol.bus.Event(
                            'hide-loading-indicator',
                            {source : 'listradius'}));
                }
            );

            this.bus.addHandler(
                'species-list-tool-toggle',
                function(event, params) {                                      
                    if(event.visible == true) {
                        self.enabled = true;
                    } else {
                        self.enabled = false;
                    }
                    
                    if (self.listradius) {
                        self.listradius.setMap(null);
                    }
                    
                    if (self.enabled == true) {
                        _.each(
                            self.features,
                            function(feature) {
                                feature.listradius.setMap(self.map);
                                feature.listWindow.setMap(self.map);
                            }
                        );
                        $(self.display.queryButton).addClass('selected');
                        $(self.display.queryButton).html("ON");
                        self.toggleMapLayerClicks(true);
                    } else {
                        _.each(
                            self.features,
                            function(feature) {
                                if(feature.listWindow) {
                                    feature.listWindow.dialog("close");
                                }
                                feature.listradius.setMap(null);
                            }
                        );
                        $(self.display.queryButton).removeClass('selected');
                        $(self.display.queryButton).html("OFF");
                        self.toggleMapLayerClicks(false);
                    }
                }
            );

            this.display.radiusInput.blur(
                function(event) {
                    if (this.value > 1000) {
                        this.value = 1000;
                        alert(
                            'Please choose a radius between 50 km and 1000 km.'
                        );
                    }
                    if (this.value < 50) {
                        this.value = 50;
                        alert(
                            'Please choose a radius between 50 km and 1000 km.'
                        );
                    }
                }
            );

            this.display.dataset_id.change(
                function(event) {
                    if ($(this).val().toLowerCase().indexOf('fish') > 0) {
                        $(self.display.types).find('.ecoregion')
                            .toggle(false);
                        $(self.display.types).find('.ecoregion')
                            .removeClass('selected');
                        $(self.display.types).find('.range')
                            .toggle(false);
                        if ($(self.display.types).find('.range')
                            .hasClass('selected')) {
                                alert('Available for North America only.');
                        };
                    } else if ($(this).val().toLowerCase()
                        .indexOf('reptil') > 0) {
                        $(self.display.types).find('.ecoregion')
                            .toggle(true);
                        $(self.display.types).find('.ecoregion')
                            .removeClass('selected');
                        $(self.display.types).find('.range')
                            .toggle(true);
                        if ($(self.display.types).find('.range')
                            .hasClass('selected')) {
                                alert('Available for North America only.');
                        };
                    } else {
                        $(self.display.types).find('.ecoregion')
                            .toggle(false);
                        $(self.display.types).find('.range')
                            .toggle(false);
                        $(self.display.types).find('.range')
                            .addClass('selected');
                    }
                }
            );
            
            /**
             * Clicking the cancel button hides the search display and fires
             * a cancel-search event on the bus.
             */
            this.display.toggleButton.click(
                function(event) {
                    var params = {
                        visible: false
                        }, 
                        that = this;
                    
                    if(self.display.speciesDisplay.is(':visible')) {
                        self.display.speciesDisplay.hide();
                        $(this).text('◀');
                        params.visible = false;
                    } else {
                        
                        self.display.speciesDisplay.show();
                        $(this).text('▶');
                        params.visible = true;
                    }
                   
                    self.bus.fireEvent(
                        new mol.bus.Event('species-list-tool-toggle', params));
                }
            );
        },

        /*
         * Processes response content for List dialog
         */
        processListRows: function(listrad, clnm, latH, lngH, rows, sqlurl) {
            var self = this,
                listradius = listrad,
                className = clnm,
                latHem = latH,
                lngHem = lngH,
                tablerows = [],
                providers = [],
                scientificnames = {},
                years = [],
                redlistCt = {},
                stats,
                speciestotal = 0,
                speciesthreatened = 0,
                speciesdd = 0;

            _.each(
                rows,
                function(row) {
                    var english = (row.english != null) ?
                            _.uniq(row.english.split(',')).join(',') : '',
                        year = (row.year_assessed != null) ?
                            _.uniq(row.year_assessed.split(',')).join(',') : '',
                        redlist = (row.redlist != null) ?
                            _.uniq(row.redlist.split(',')).join(',') : '',
                        tclass = "";

                    //create class for 3 threatened iucn classes
                    switch(redlist) {
                        case "VU":
                            tclass = "iucnvu";
                            break;
                        case "EN":
                            tclass = "iucnen";
                            break;
                        case "CR":
                            tclass = "iucncr";
                            break;
                    }

                    //list row header
                    tablerows.push(""+
                        "<tr class='" + tclass + "'>" +
                        "   <td class='arrowBox'>" +
                        "       <div class='arrow'></div>" +
                        "   </td>" +
                        "   <td class='wiki sci' value='" +
                                row.thumbsrc + "'>" +
                                row.scientificname +
                        "   </td>" +
                        "   <td class='wiki english' value='" +
                                row.imgsrc + "' eol-page='" +
                                row.eol_page_id + "'>" +
                                ((english != null) ? english : '') +
                        "   </td>" +
                        "   <td class='wiki'>" +
                                ((row.order != null) ?
                                    row.order : '') +
                        "   </td>" +
                        "   <td class='wiki'>" +
                                ((row.family != null) ?
                                    row.family : '') +
                        "   </td>" +
                        "   <td>" + ((row.sequenceid != null) ?
                                        row.sequenceid : '') +
                        "   </td>" +
                        "   <td class='iucn' data-scientificname='" +
                                row.scientificname + "'>" +
                                ((redlist != null) ? redlist : '') +
                        "   </td>" +
                        "</tr>");

                    //list row collapsible content
                    tablerows.push("" +
                        "<tr class='tablesorter-childRow'>" +
                        "   <td colspan='7' value='" +
                                row.scientificname + "'>" +
                        "   </td>" +
                        "</tr>");

                    providers.push(
                        ('<a class="type {0}">{1}</a>, ' +
                         '<a class="provider {2}">{3}</a>')
                            .format(
                                row.type,
                                row.type_title,
                                row.provider,
                                row.provider_title));
                    if (year != null && year != '') {
                        years.push(year);
                    }
                    scientificnames[row.scientificname]=redlist;
                }
            );
            years = _.uniq(years);
            tablerows = _.uniq(tablerows);
            providers = _.uniq(providers);

            years = _.sortBy(_.uniq(years), function(val) {
                    return val;
                }
            );

            years[years.length-1] = (years.length > 1) ?
                ' and ' + years[years.length-1] : years[years.length-1];

            _.each(
                scientificnames,
                function(red_list_status) {
                    speciestotal++;
                    speciesthreatened +=
                        ((red_list_status.indexOf('EN')>=0) ||
                         (red_list_status.indexOf('VU')>=0) ||
                         (red_list_status.indexOf('CR')>=0) ||
                         (red_list_status.indexOf('EX')>=0) ||
                         (red_list_status.indexOf('EW')>=0) )  ?
                            1 : 0;
                    speciesdd +=
                        (red_list_status.indexOf('DD')>0)  ?
                            1 : 0;
                }
            );

            stats = (speciesthreatened > 0) ?
                ('(' + speciesthreatened + ' considered threatened by ' +
                '<a href="http://www.iucnredlist.org" ' +
                'target="_iucn">IUCN</a> '+years.join(',')+')') : '';

            if (speciestotal > 0) {
                content = $('' +
                    '<div class="mol-Map-ListQueryInfo">' +
                    '   <div class="mol-Map-ListQuery">' +
                           'Data type/source:&nbsp;' +
                           providers.join(', ') +
                           '.&nbsp;All&nbsp;seasonalities.<br>' +
                    '   </div> ' +
                    '   <div class="mol-Map-ListQueryInfoWindow"> ' +
                    '       <table class="listtable">' +
                    '           <thead>' +
                    '               <tr>' +
                    '                   <th></th>' +
                    '                   <th>Scientific Name</th>' +
                    '                   <th>English Name</th>' +
                    '                   <th>Order</th>' +
                    '                   <th>Family</th>' +
                    '                   <th>Rank&nbsp;&nbsp;&nbsp;</th>' +
                    '                   <th>IUCN&nbsp;&nbsp;</th>' +
                    '               </tr>' +
                    '           </thead>' +
                    '           <tbody class="tablebody">' +
                                    tablerows.join('') +
                    '           </tbody>' +
                    '       </table>' +
                    '   </div>' +
                    '</div>');

                dlContent = $('' +
                    '<div class="mol-Map-ListQuery">' +
                    '   <div>' +
                    '       <a href="' + 
                                this.url.format(sqlurl) + '&format=csv"' +
                    '           class="mol-Map-ListQueryDownload">' +
                    '               download csv</a>' +
                    '   </div> ' +
                    '</div>');

                iucnContent = $('' +
                    '<div class="mol-Map-ListQuery mol-Map-ListQueryInfo">' +
                    '    <div id="iucnChartDiv"></div>'+
                    '    <div class="iucn_stats">' + stats + '</div>' +
                    '</div>');
            } else {
                content = $(''+
                    '<div class="mol-Map-ListQueryEmptyInfoWindow">' +
                    '   <b>No ' + className.replace(/All/g, '') +
                            ' species found within ' +
                            listradius.radius/1000 + ' km of ' +
                            Math.abs(
                                Math.round(
                                    listradius.center.lat()*1000)/1000) +
                                    '&deg;&nbsp;' + latHem + '&nbsp;' +
                            Math.abs(
                                Math.round(
                                    listradius.center.lng()*1000)/1000) +
                                    '&deg;&nbsp;' + lngHem +
                    '   </b>' +
                    '</div>');

                dlContent = $('' +
                    '<div class="mol-Map-ListQueryEmptyInfoWindow">' +
                    '    <b>No list to download.</b>' +
                    '</div>');

                iucnContent = $('' +
                    '<div class="mol-Map-ListQueryEmptyInfoWindow">' +
                    '    <b>No species found.</b>' +
                    '</div>');
            }

            return {speciestotal: speciestotal,
                    content: content,
                    dlContent: dlContent,
                    iucnContent: iucnContent}
        },

        /*
         * Displays and Manages the List dialog
         */

        displayListWindow: function(listrad, sptot, clname, latH, lngH,
                                    rows, con, dlCon, iuCon) {
            var self = this,
                listradius = listrad,
                listWindow,
                listTabs,
                speciestotal = sptot,
                className = clname,
                latHem = latH,
                lngHem = lngH,
                content = con;
                dlContent = dlCon,
                iucnContent = iuCon;

            listWindow = new mol.map.query.listDisplay();

            self.features[listradius.center.toString()+listradius.radius] = {
                listradius : listradius,
                listWindow : listWindow
            };

            listWindow.dialog({
                autoOpen: true,
                width: 680,
                height: 415,
                dialogClass: 'mol-Map-ListDialog',
                modal: false,
                title: speciestotal + ' species of ' + className +
                       ' within ' + listradius.radius/1000 + ' km of ' +
                       Math.abs(Math.round(
                           listradius.center.lat()*1000)/1000) +
                           '&deg;&nbsp;' + latHem + '&nbsp;' +
                       Math.abs(Math.round(
                           listradius.center.lng()*1000)/1000) +
                           '&deg;&nbsp;' + lngHem
            });

            $(".mol-Map-ListDialog").parent().bind("resize", function() {
                $(".mol-Map-ListQueryInfoWindow")
                    .height($(".mol-Map-ListDialog").height()-125);
                    
                $("#gallery")
                    .height($(".mol-Map-ListDialog").height()-125);
            });

            //tabs() function needs document ready to
            //have been called on the dialog content
            $(function() {
                var mmlHeight;

                //initialize tabs and set height
                listTabs = $("#tabs").tabs();

                $("#tabs > #listTab").html(content[0]);
                $("#tabs > #dlTab").html(dlContent[0]);
                $("#tabs > #iucnTab").html(iucnContent[0]);

                $(".mol-Map-ListQueryDownload").button();
                mmlHeight = $(".mol-Map-ListDialog").height();
                $(".mol-Map-ListQueryInfoWindow").height(mmlHeight-125);
                $("#gallery").height(mmlHeight-125);

                //list table creation
                self.createSpeciesListTable(listWindow);

                //chart creation
                if(speciestotal > 0 ) {
                    self.createIucnChart(rows, mmlHeight);
                }

                //image gallery creation
                self.createImageGallery(rows, speciestotal);

                listTabs.tabs("select", 0);
            });

            self.features[listradius.center.toString()+listradius.radius] = {
                listradius : listradius,
                listWindow : listWindow
            };

            $(listWindow).dialog({
               beforeClose: function(evt, ui) {
                   listTabs.tabs("destroy");
                   $(".mol-Map-ListDialogContent").remove();
                   listradius.setMap(null);
                   delete (
                       self.features[listradius.center.toString() +
                                     listradius.radius]);
               }
            });
        },

        /*
         * Bins the IUCN species for a list query request into categories
         * and returns an associate array with totals
         */
        getRedListCounts: function(rows) {

            var iucnListArray = [
                    ['IUCN Status', 'Count'],
                    ['LC',0],
                    ['NT',0],
                    ['VU',0],
                    ['EN',0],
                    ['CR',0],
                    ['EW',0],
                    ['EX',0]
                ], redlist;

            _.each(rows, function(row) {
                redlist = (row.redlist != null) ?
                    _.uniq(row.redlist.split(',')).join(',') : '';

                switch(redlist) {
                    case "LC":
                        iucnListArray[1][1]++;
                        break;
                    case "NT":
                        iucnListArray[2][1]++;
                        break;
                    case "VU":
                        iucnListArray[3][1]++;
                        break;
                    case "EN":
                        iucnListArray[4][1]++;
                        break;
                    case "CR":
                        iucnListArray[5][1]++;
                        break;
                    case "EW":
                        iucnListArray[6][1]++;
                        break;
                    case "EX":
                        iucnListArray[7][1]++;
                        break;
                }
            });

            return iucnListArray;
        },

        /*
         * Creates List Table
         */
        createSpeciesListTable: function(lw) {
            var self = this;

            $("table.listtable tr:odd").addClass("master");
            $("table.listtable tr:not(.master)").hide();
            $("table.listtable tr:first-child").show();
            $("table.listtable tr.master td.arrowBox").click(
                function() {
                    $(this).parent().next("tr").toggle();
                    $(this).parent().find(".arrow").toggleClass("up");

                    if(!$(this).parent().hasClass('hasWiki')) {
                        $(this).parent().addClass('hasWiki');
                        self.callWiki($(this).parent());
                    }
                }
            );
            $(".listtable", $(lw)).tablesorter({
                sortList: [[5,0]]
            });

            _.each(
                $('.wiki',$(lw)),
                function(wiki) {
                    $(wiki).click(
                        function(event) {
                            var win = window.open(
                                'http://en.wikipedia.com/wiki/'+
                                $(this).text().split(',')[0]
                                    .replace(/ /g, '_')
                            );
                            win.focus();
                        }
                    );
                }
            );

            _.each(
                $('.iucn',$(lw)),
                function(iucn) {
                    if ($(iucn).data('scientificname') != '') {
                        $(iucn).click(
                            function(event) {
                                var win = window.open(
                                    'http://www.iucnredlist.org/' +
                                    'apps/redlist/search/external?text='
                                    +$(this).data('scientificname')
                                );
                                win.focus();
                            }
                        );
                    }
                }
            );
        },

        /*
         * Creates IUCN pie chart
         */
        createIucnChart: function(rows, mHeight) {
            var self = this,
                iucnlist,
                iucndata,
                options,
                chart;

            $("#iucnChartDiv").height(mHeight-140);

            iucnlist = self.getRedListCounts(rows);
            iucndata = google.visualization.arrayToDataTable(iucnlist);

            options = {
                width: 605,
                height: $("#iucnChartDiv").height(),
                backgroundColor: 'transparent',
                title: 'Species by IUCN Status',
                colors: ['#006666',
                         '#88c193',
                         '#cc9900',
                         '#cc6633',
                         '#cc3333',
                         '#FFFFFF',
                         '#000000'],
                pieSliceText: 'none',
                chartArea: {left:125, top:25, width:"100%", height:"85%"}
            };

            chart = new google.visualization.PieChart(
                document.getElementById('iucnChartDiv'));
            chart.draw(iucndata, options);
        },

        /*
         * Creates and populates image gallery tab
         */
        createImageGallery: function (rows, sptotal) {
            var hasImg = 0,
                english
                self = this;

            _.each(
               rows,
                function(row) {
                    english = (row.english != null) ?
                        _.uniq(row.english.split(',')).join(',') : '';

                    if(row.thumbsrc != null) {
                        $("#gallery").append('' +
                            '<li><a class="eol_img" href="http://eol.org/pages/' +
                            row.eol_page_id +
                            '" target="_blank"><img src="' +
                            row.thumbsrc +
                            '" title="' +
                            english +
                            '" sci-name="' +
                            row.scientificname + '"/></a></li>');

                        hasImg++;
                    } else {
                        $("#gallery").append('' +
                            '<li><div style="width:91px; height:68px"' +
                            'title="' + english +
                            '" sci-name="' + row.scientificname +
                            '">No image for ' +
                            english + '.</div></li>');
                    }
                }
            );

            $('#gallery').ppGallery({thumbWidth: 91, maxWidth: 635});
            $('#imgTotals').html('' +
                                'Images are available for ' +
                                hasImg + ' of ' + sptotal +
                                ' species. ');

            $('#gallery li a img').qtip({
                content: {
                    text: function(api) {
                        return '<div>' + $(this).attr('oldtitle') +
                            '<br/><button class="mapButton" value="' +
                            $(this).attr('sci-name') +
                            '">Map</button>' +
                            '<button class="eolButton" value="' +
                            $(this).parent().attr('href') +
                            '">EOL</button></div>';
                    }
                },
                hide: {
                    fixed: true,
                    delay: 500
                },
                events: {
                    visible: function(event, api) {
                        $("button.mapButton").click(
                            function(event) {
                                self.bus.fireEvent(
                                    new mol.bus.Event(
                                        'search',
                                        {term : $.trim(event.target.value)}
                                    )
                                );
                            }
                        );

                        $('button.eolButton').click(
                            function(event) {
                                var win = window.open(
                                    $.trim(event.target.value)
                                );
                                win.focus();
                            }
                        );
                    }
                }
            });
            $('.eol_img').mouseup(
                function(event) {
                    if(event.ctrlKey) {
                      //
                    }
                }
            )

            $('#gallery li div').qtip({
                content: {
                    text: function(api) {
                        return '<div>' + $(this).attr('title') +
                            '<br/><button class="mapButton" value="' +
                            $(this).attr('sci-name') +
                            '">Map</button></div>';
                    }
                },
                hide: {
                    fixed: true,
                    delay: 500
                },
                events: {
                    visible: function(event, api) {
                        $("button.mapButton").click(function(event) {
                            self.bus.fireEvent(new mol.bus.Event('search', {
                                term : $.trim(event.target.value)
                            }));
                        });
                    }
                }
            });
        },

        /*
         * Callback for Wikipedia Json-P request
         */
        wikiCallback: function(data, row,q,qs,eolimg,eolpage) {

            var wikidata,
                wikiimg,
                prop,
                a,
                imgtitle,
                req,
                reqs,
                i,
                e,
                self = this;


            for(e in data.query.pages) {
                if(e != -1) {
                    prop = data.query.pages[e];
                    wikidata = prop.extract
                        .replace('...','')
                        .replace('<b>','<strong>')
                        .replace('<i>','<em>')
                        .replace('</b>','</strong>')
                        .replace('</i>','</em>')
                        .replace('<br />',"")
                        .replace(/<p>/g,'<div>')
                        .replace(/<\/p>/g,'</div>')
                        .replace(/<h2>/g,'<strong>')
                        .replace(/<\/h2>/g,'</strong>')
                        .replace(/<h3>/g,'<strong>')
                        .replace(/<\/h3>/g,'</strong>')
                        .replace(/\n/g,"")
                        .replace('</div>\n<div>'," ")
                        .replace('</div><div>'," ")
                        .replace('</div><strong>'," <strong> ")
                        .replace('</strong><div>'," </strong> ");

                    $(row).next().find('td').html(wikidata);
                    $(row).next().find('td div br').remove();

                    a = prop.images;

                    for(i=0;i < a.length;i++) {
                        imgtitle = a[i].title;

                        req = new RegExp(q, "i");
                        reqs = new RegExp(qs, "i");

                        if(imgtitle.search(req) != -1 ||
                           imgtitle.search(reqs) != -1) {
                            wikiimg = imgtitle;
                            break;
                        }
                    }
                }

                if(eolimg != "null") {
                    $('<a href="http://eol.org/pages/' +
                        eolpage +
                        '" target="_blank"><img src="' +
                        eolimg +
                        '" style="float:left; margin:0 4px 0 0;"/>' +
                        '</a>').prependTo($(row).next().find('td'));
                    $(row).next().find('td div:last').append('' +
                        '... (Text Source:' +
                        '<a href="http://en.wikipedia.com/wiki/' +
                        qs.replace(/ /g, '_') +
                        '" target="_blank">Wikipedia</a>;' +
                        ' Image Source:<a href="http://eol.org/pages/' +
                        eolpage +
                        '" target="_blank">EOL</a>)' +
                        '<p><button class="mapButton" value="' +
                        qs + '">Map</button></p>');
                } else if(wikiimg != null) {
                    //get a wikipedia image if we have to
                    $.getJSON(
                        'http://en.wikipedia.org/w/api.php?' +
                        'action=query' +
                        '&prop=imageinfo' +
                        '&format=json' +
                        '&iiprop=url' +
                        '&iilimit=10' +
                        '&iiurlwidth=91' +
                        '&iiurlheight=68' +
                        '&titles={0}'.format(wikiimg) +
                        '&callback=?'
                    ).success(
                        function(data) {
                            self.wikiImgCallback(data, qs, wikiimg)
                        }
                    );
                }

                //check for link to eol, if true, add button
                if(eolpage != "null") {
                    $(row).next().find('td p:last').append('' +
                    '<button class="eolButton" ' +
                    'value="http://eol.org/pages/' +
                    eolpage + '">Encyclopedia of Life</button>');

                    $('button.eolButton[value="http://eol.org/pages/' +
                        eolpage + '"]').click(function(event) {
                        var win = window.open($.trim(event.target.value));
                        win.focus();
                    });
                }

                $(row).find('td.arrowBox').html("<div class='arrow up'></div>");
            }


            $("button.mapButton").click(
                function(event) {
                    self.bus.fireEvent(
                        new mol.bus.Event(
                            'search',
                            {term : $.trim(event.target.value)}
                        )
                    );
                }
            );
        },

        /*
         *  Callback for Wikipedia image json-p request.
         */
        wikiImgCallback: function(data, qs, wikiimg) {

            var imgurl,
                x,
                z;

            for(x in data.query.pages) {
                z = data.query.pages[x];
                imgurl = z.imageinfo[0].thumburl;

                $('<a href="http://en.wikipedia.com/wiki/' +
                    qs.replace(/ /g, '_') +
                    '" target="_blank"><img src="' +
                    imgurl +
                    '" style="float:left; margin:0 4px 0 0;"/>')
                   .prependTo($(row).next().find('td'));
                $(row).next().find('td div:last')
                    .append('' +
                    '... (Text Source:' +
                    '<a href="http://en.wikipedia.com/wiki/' +
                    qs.replace(/ /g, '_') +
                    '" target="_blank">Wikipedia</a>;' +
                    ' Image Source:' +
                    '<a href="http://en.wikipedia.com/wiki/' +
                    wikiimg +
                    '" target="_blank">Wikipedia</a>)' +
                    '<p><button class="mapButton" value="' +
                    qs +
                    '">Map</button></p>');
            }
        },

        /*
         *  Put html in saying information unavailable...
         */
        wikiError: function(row) {
            $(row).find('td.arrowBox').html("<div class='arrow up'></div>");
            $(row).next().find('td').html('<p>Description unavailable.</p>');
        },

        /*
         * Function to call Wikipedia and EOL image
         */
        callWiki: function(row) {
            var q,
                qs,
                eolimg,
                eolpage,
                self = this;

            $(row).find('td.arrowBox').html('' +
                '<img src="/static/loading-small.gif" width="' +
                $(row).find('td.arrowBox').height() +'" height="' +
                $(row).find('td.arrowBox').width() + '" />');

            q = $(row).find('td.english').html();
            qs = $(row).find('td.sci').html();
            eolimg = $(row).find('td.sci').attr('value');
            eolpage = $(row).find('td.english').attr('eol-page');

            $.getJSON(
                "http://en.wikipedia.org/w/api.php?" +
                "action=query" +
                "&format=json" +
                "&callback=test" +
                "&prop=extracts|images" +
                "&imlimit=10" +
                "&exlimit=1" +
                "&redirects=" +
                "exintro=" +
                "&iwurl=" +
                "&titles=" + qs +
                "&exchars=275" +
                '&callback=?'
            ).success (
                function(data) {
                    self.wikiCallback(data, row,q,qs,eolimg,eolpage)
                }
            ).error(
                function(data) {
                    self.wikiError(row);
                }
            );
        }
    });

    mol.map.QueryDisplay = mol.mvp.View.extend({
        init : function(names) {
            var className = 'mol-Map-QueryDisplay',
                html = '' +
                    '<div title=' +
                    '  "Use this control to select species group and radius.' +
                    '  Then right click (Mac Users: \'control-click\')' +
                    '  on focal location on map." class="' + className +
                    '  widgetTheme">' +
                    '  <button class="toggle">▶</button>' +
                    '  <span class="title">Species List</span>' +
                    '  <div class="speciesDisplay">' +
                    '    <button id="speciesListButton" ' + 
                             'class="toggleBtn" ' +
                             'title="Click to activate species' + 
                                 ' list querying.">' +
                             'OFF' +
                    '    </button>' + 
                         'Radius </span>' +
                    '    <select class="radius">' +
                    '      <option selected value="50">50 km</option>' +
                    '      <option value="100">100 km</option>' +
                    '      <option value="300">300 km</option>' +
                    '    </select>' +
                         'Group ' +
                    '    <select class="dataset_id" value="">' +
                    '      <option selected data-range="jetz_maps" ' +
                    '        data-class="Aves" >' +
                    '        Birds</option>' +
                    '      <option data-range="na_fish"' +
                    '        data-class="Fishes" >' +
                    '        NA Freshwater Fishes</option>' +
                    '      <option data-range="iucn_reptiles" ' +
                    '        data-regionalchecklist="ecoregion_species" ' +
                    '        data-class="Reptilia" >' +
                    '        NA Reptiles</option>' +
                    '      <option data-range="iucn_amphibians"' +
                    '        data-class="Amphibia" >' +
                    '        Amphibians</option>' +
                    '      <option data-range="iucn_mammals" ' +
                    '        data-class="Mammalia" >' +
                    '        Mammals</option>' +
                    '    </select>' +
                    '    <span class="types">' +
                    '      <button class="range selected" ' +
                             'value="range">' +
                    '        <img title="Click to use Expert range maps' +
                               ' for query."' +
                    '          src="/static/maps/search/range.png">' +
                    '      </button>' +
                    '      <button class="ecoregion" ' +
                    '        value="regionalchecklist">' +
                    '        <img title="Click to use Regional' +
                               ' checklists for query." ' +
                               'src="/static/maps/search/ecoregion.png">' +
                    '      </button>' +
                    '    </span>' +
                    '  </div>' +


                    '</div>';

            this._super(html);
            this.resultslist=$(this).find('.resultslist');
            this.radiusInput=$(this).find('.radius');
            this.dataset_id=$(this).find('.dataset_id');
            this.types=$(this).find('.types');
            this.queryButton=$(this).find('#speciesListButton');
            this.toggleButton = $(this).find('.toggle');
            this.speciesDisplay = $(this).find('.speciesDisplay');
            
            $(this.types).find('.ecoregion').toggle(false);
            $(this.types).find('.range').toggle(false);
        }
    });

    mol.map.QueryResultDisplay = mol.mvp.View.extend({
        init : function(scientificname) {
            var className = 'mol-Map-QueryResultDisplay', html = '{0}';
            this._super(html.format(scientificname));
        }
    });

    mol.map.query.listDisplay = mol.mvp.View.extend({
        init : function() {
            var html = '' +
                '<div class="mol-Map-ListDialogContent ui-tabs" id="tabs">' +
                '   <ul class="ui-tabs-nav">' +
                '      <li><a href="#listTab">List</a></li>' +
                '      <li><a href="#imagesTab">Images</a></li>' +
                '      <li><a href="#iucnTab">IUCN</a></li>' +
                '      <li><a href="#dlTab">Download</a></li>' +
                '   </ul>' +
                '   <div id="listTab" class="ui-tabs-panel">Content.</div>' +
                '   <div id="imagesTab" class="ui-tabs-panel">' +
                '       <div>' +
                '           <span id="imgTotals"></span>' +
                            'Source: <a href="http://eol.org/" ' +
                            'target="_blank">Encyclopedia of Life</a> ' +
                '       </div>' +
                '       <ul id="gallery" style="overflow: auto;"></ul></div>' +
                '   <div id="iucnTab" class="ui-tabs-panel">IUCN.</div>' +
                '   <div id="dlTab" class="ui-tabs-panel">Download.</div>' +
                '</div>';
            this._super(html);
        }
    });
};
mol.modules.map.basemap = function(mol) {

    mol.map.basemap = {};

    mol.map.basemap.BaseMapEngine = mol.mvp.Engine.extend({
        init: function(proxy, bus, map) {
            this.proxy = proxy;
            this.bus = bus;
            this.map = map;
        },

        /**
         * Starts the MenuEngine. Note that the container parameter is
         * ignored.
         */
        start: function() {
            this.display = new mol.map.basemap.BaseMapControlDisplay();
            this.display.toggle(true);
            this.addEventHandlers();
            this.fireEvents();
        },

        setBaseMap: function(type) {
                switch(type) {
                    case "Roadmap" :
                        this.map.setOptions({styles:[
                            {
                                "stylers" : [{
                                    "saturation" : -65
                                }, {
                                    "gamma" : 1.52
                                }]
                            }, {
                                "featureType" : "administrative",
                                "stylers" : [{
                                    "saturation" : -95
                                }, {
                                    "gamma" : 2.26
                                }]
                            }, {
                                "featureType" : "water",
                                "elementType" : "labels",
                                "stylers" : [{
                                    "visibility" : "off"
                                }]
                            }, {
                                "featureType" : "administrative.locality",
                                "stylers" : [{
                                    "visibility" : "off"
                                }]
                            }, {
                                "featureType" : "road",
                                "stylers" : [{
                                    "visibility" : "simplified"
                                }, {
                                    "saturation" : -99
                                }, {
                                    "gamma" : 2.22
                                }]
                            }, {
                                "featureType" : "poi",
                                "elementType" : "labels",
                                "stylers" : [{
                                    "visibility" : "off"
                                }]
                            }, {
                                "featureType" : "road.arterial",
                                "stylers" : [{
                                    "visibility" : "off"
                                }]
                            }, {
                                "featureType" : "road.local",
                                "elementType" : "labels",
                                "stylers" : [{
                                    "visibility" : "off"
                                }]
                            }, {
                                "featureType" : "transit",
                                "stylers" : [{
                                    "visibility" : "off"
                                }]
                            }, {
                                "featureType" : "road",
                                "elementType" : "labels",
                                "stylers" : [{
                                    "visibility" : "off"
                                }]
                            }, {
                                "featureType" : "poi",
                                "stylers" : [{
                                    "saturation" : -55
                                }]
                            }
                        ]});
                        break;

                    case "Basic":
                        type="ROADMAP";
                        this.map.setOptions({styles: [
                            {
                                featureType: "administrative",
                                stylers: [
                                 { visibility: "off" }
                                ]
                            },
                             {
                               featureType: "landscape",
                             stylers: [
                               { visibility: "off" }
                               ]
                             },
                             {
                             featureType: "road",
                             stylers: [
                               { visibility: "off" }
                               ]
                            },
                             {
                             featureType: "poi",
                             stylers: [
                               { visibility: "off" }
                             ]
                           },{
                                featureType: "water",
                                labels: "off",
                              stylers: [
                                { visibility: "on" },
                                { saturation: -65 },
                                { lightness: -15 },
                               { gamma: 0.83 },

                                ]
                              },{
                                featureType: "water",
                                elementType: "labels",
                                stylers: [
                                   { visibility: "off" }
                                ]
                              },
                           {
                              featureType: "transit",
                             stylers: [
                                  { visibility: "off" }
                                ]
                             }
                        ]});
                    break;
                    case 'Political' :
                        this.map.setOptions({styles : [
                            {
                        featureType: "administrative.country",
                        stylers: [
                        { visibility: "on" }
                        ]
                        },{
                        featureType: "administrative.locality",
                        stylers: [
                        { visibility: "off" }
                        ]
                        },{
                        featureType: "road",
                        stylers: [
                        { visibility: "off" }
                        ]
                        },{
                        featureType: "administrative.province",
                        stylers: [
                        { visibility: "on" }
                        ]
                        },{
                        featureType: "poi",
                        stylers: [
                        { visibility: "off" }
                        ]
                        },{
                        featureType: "landscape",
                        stylers: [
                        { visibility: "off" }
                        ]
                        },{
                        featureType: "water",
                        stylers: [
                        { visibility: "simplified" }
                        ]
                        },{
                        featureType: "water",
                        stylers: [
                        { gamma: 0.21 }
                        ]
                        },{
                        featureType: "landscape",
                        stylers: [
                        { gamma: 0.99 },
                        { lightness: 65 }
                        ]
                        },{
                        }
                        ]});
                   type='ROADMAP';
                   break;
                }
                this.map.setMapTypeId(google.maps.MapTypeId[type.toUpperCase()])
        },
        /**
         * Adds a handler for the 'search-display-toggle' event which
         * controls display visibility. Also adds UI event handlers for the
         * display.
         */
        addEventHandlers: function() {
            var self = this;
            _.each(
                $(this.display).find(".button"),
                function(button) {
                    $(button).click(
                        function(event) {
                            self.setBaseMap($(this).text());
                        }
                    );
                }
            );

            this.bus.addHandler(
                'basemap-display-toggle',
                function(event) {
                    var params = null,
                    e = null;

                    if (event.visible === undefined) {
                        self.display.toggle();
                        params = {visible: self.display.is(':visible')};
                    } else {
                        self.display.toggle(event.visible);
                    }
                }
            );
        },

        /**
         * Fires the 'add-map-control' event. The mol.map.MapEngine handles
         * this event and adds the display to the map.
         */
        fireEvents: function() {
            var params = {
                    display: this.display,
                    slot: mol.map.ControlDisplay.Slot.FIRST,
                    position: google.maps.ControlPosition.LEFT_BOTTOM
            };

            this.bus.fireEvent(new mol.bus.Event('add-map-control', params));
        }
    });

    mol.map.basemap.BaseMapControlDisplay = mol.mvp.View.extend({
        init: function() {
            var html = '' +
                '<div class="mol-BaseMapControl">' +
                    '<div class="label">Base Map:</div>' +
                    '<div title="Basic Base Map (water and boundaries only)" class="widgetTheme button">Basic</div>' +
                    '<div title="Road Base Map" class="widgetTheme button">Political</div>' +
                    '<div title="Political boundaries." class="widgetTheme button">Roadmap</div>' +
                    '<div title="Topographic Base Map" class="widgetTheme button">Terrain</div>' +
                    '<div title="Satellite Base Map" class="widgetTheme button">Satellite</div>' +
                '</div>';

            this._super(html);

        }
    });
};



mol.modules.map.metadata = function(mol) {

    mol.map.metadata = {};

    mol.map.metadata.MetadataEngine = mol.mvp.Engine.extend({
        init: function(proxy, bus) {
            this.proxy = proxy;
            this.bus = bus;
            this.url = 'http://mol.cartodb.com/api/v2/sql?q={0}&callback=?';
            this.sql = {
                dashboard: '' +
                    'SELECT Coverage as "Coverage", Taxon as "Taxon", ' +
                    '   dm.Description as "Description", ' +
                    '   CASE WHEN URL IS NOT NULL THEN CONCAT(\'<a target="_dashlink" href="\',dm.URL, \'">\', dm.URL, \'</a>\') ' +
                    '   ELSE Null END AS "URL", ' +
                    '   dm.Spatial_metadata as "Spatial Metadata", ' +
                    '   dm.Taxonomy_metadata as "Taxonomy Metadata", ' +
                    '   dm.seasonality as "Seasonality", ' +
                    '   dm.seasonality_more as "Seasonality further info", ' +
                    '   dm.date_range as "Date", ' +
                    '   dm.date_more as "Date further info", ' +
                    '   dm.Recommended_citation as "Recommended Citation", ' +
                    '   dm.Contact as "Contact" ' +
                    'FROM dashboard_metadata dm ' +
                    'WHERE ' +
                    '   dm.dataset_id = \'{0}\'',
                types: '' +
                    'SELECT title as "Data Type", description AS "Description" FROM types where type = \'{0}\''
            }
       },

        start: function() {
            
            this.addEventHandlers();
        },
        getTypeMetadata:function (params) {
            var self = this,
                type = params.type,
                title = params.title,
                sql = this.sql['types'].format(type);
              this.getMetadata(sql, title);  
        },
        getDashboardMetadata: function (params) {
            var self = this,
                dataset_id = params.dataset_id,
                title = params.title,
                sql = this.sql['dashboard'].format(dataset_id);
            this.getMetadata(sql, title);
        },
        getMetadata: function (sql, title) {
            this.bus.fireEvent(
                new mol.bus.Event(
                    'show-loading-indicator',
                    {source: sql}
                )
            );
            $.getJSON(
                mol.services.cartodb.sqlApi.jsonp_url.format(sql),
                function(response) {
                    if(self.display) {
                        self.display.dialog('close');
                    }
                    if(!response.error) {
                        if(response.total_rows > 0) {
                            self.display = 
                                new mol.map.metadata.MetadataDisplay(
                                    response, title
                                );
                        }
                    }
                    self.bus.fireEvent(
                        new mol.bus.Event(
                            'hide-loading-indicator',
                            {source: sql}
                        )
                    );
                }
            );
        },
        addEventHandlers: function() {
            var self = this;

            /**
             * Callback that toggles the metadata display visibility.
             *
             * @param event mol.bus.Event
             */
            this.bus.addHandler(
                'metadata-toggle',
                function(event) {
                    var params = event.params;
                    if(params.dataset_id) {
                        self.getDashboardMetadata(params);
                    } else if(params.type) {
                        self.getTypeMetadata(params);
                    }
                }
            );
       }
    }
);

mol.map.metadata.MetadataDisplay = mol.mvp.View.extend(
    {
        init: function(response, title) {
            var self = this,
                html = '' +
                    '<div id="dialog" title="{0}">'.format(title),
                row_html = '' +
                    '<div class="metarow metakey-{0}">' +
                        '<div class="key">{1}</div>' +
                        '<div class="values"></div>' +
                    '</div>'; 
           _.each(
                response.rows[0],
                function(val, key, list) {
                    html+=row_html.format(
                            key.replace(/ /g, '_'),
                            key.replace(/_/g,' ')
                        );
                }
            )

            html+='</div>';

            this._super(html);
            _.each(
                response.rows,
                function(col) {
                    _.each(
                        col,
                        function(val, key, list) {
                            if(val != null) {
                                $(self).find(".metakey-{0} .values"
                                    .format(key.replace(/ /g, '_')))
                                    .append($('<div class="val">{0}<div>'
                                    .format(val)));
                            }
                            if($(self).find(".metakey-{0}"
                                .format(key.replace(/ /g, '_')))
                                .find(".val").length == 0 ) {
                                $(self).find(".metakey-{0}".format(
                                    key.replace(/ /g, '_'))
                                ).toggle(false);
                            } else {
                                $(self).find(".metakey-{0}"
                                    .format(key.replace(/ /g, '_')))
                                    .toggle(true);
                            }
                        }
                    )
                }
            );
           
            this.dialog(
                {
                    autoOpen: true,
                    stack: true,
                    dialogClass: "mol-LayerMetadata"
                }
            );
            //set first col widths
            $(this).find('.key')
                .width(
                    Math.max.apply(
                        Math, 
                        $(self)
                            .find('.key')
                                .map(
                                    function(){ 
                                        return $(this).width(); 
                                    }
                                ).get()));
            //set total width
            this.dialog(
                "option", 
                "width",
                Math.max.apply(
                    Math, 
                    $(self).find('.key')
                        .map(
                            function(){ 
                                return $(this).width(); 
                            }
                        ).get())+
                    Math.max.apply(
                        Math, 
                        $(self).find('.values').map(
                            function(){ 
                                return $(this).width() 
                            }
                        ).get())+150
            );
            
            this.dialog("moveToTop");
        }
    });

};



mol.modules.map.splash = function(mol) {

    mol.map.splash = {};

    mol.map.splash.SplashEngine = mol.mvp.Engine.extend({
        init: function(proxy, bus, map) {
            this.proxy = proxy;
            this.bus = bus;
            this.map = map;
            this.IE8 = false;
        },
        start: function() {
            this.display = new mol.map.splash.splashDisplay();
            this.addEventHandlers();
        },
        /*
        *  Returns the version of Internet Explorer or a -1
        *  (indicating the use of another browser).
        */
        getIEVersion: function() {
            var rv = -1, ua, re;
            if (navigator.appName == 'Microsoft Internet Explorer') {
                ua = navigator.userAgent;
                re = new RegExp("MSIE ([0-9]{1,}[\.0-9]{0,})");
                if (re.exec(ua) != null) {
                    rv = parseFloat(RegExp.$1);
                }
            }
            return rv;
        },
        /*
        *  Method to attach MOL events to links in the iframe.
        */
        addIframeHandlers: function() {
            var self = this;

            $(this.display.iframe_content[0].contentDocument.body).find('.getspecies').click(function(event) {
                $(self.display).dialog('option', 'modal', 'false');
                $(self.display.parent()).animate({
                    left: '{0}px'.format($(window).width() / (7 / 4) - 400)
                }, 'slow');
                self.bus.fireEvent(new mol.bus.Event('search', {
                    term: 'Puma concolor'
                }));
                setTimeout(function() {
                    self.bus.fireEvent(new mol.bus.Event('results-map-selected'))
                }, 2000);
            });
            $(this.display.iframe_content[0].contentDocument.body).find('.listdemo1').click(function(event) {
                $(self.display).dialog('option', 'modal', 'false');
                $(self.display.parent()).animate({
                    left: '{0}px'.format($(window).width() / 3 - 400)
                }, 'slow');
                self.bus.fireEvent(new mol.bus.Event('layers-toggle', {
                    visible: false
                }));
                self.bus.fireEvent(new mol.bus.Event('species-list-query-click', {
                    gmaps_event: {
                        latLng: new google.maps.LatLng(-2.263, 39.045)
                    },
                    map: self.map
                }));
            });
        },
        initDialog: function() {
            var self = this;
            this.display.dialog({
                autoOpen: true,
                width: 800,
                height: 580,
                DialogClass: "mol-splash",
                close: function() {
                    self.bus.fireEvent(new mol.bus.Event('dialog-closed-click'));
                }
            //modal: true
            });
            this.display.dialog('close');
            $(this.display).width('98%');
            $(".ui-widget-overlay").live("click", function() {
                self.display.dialog("close");
            });
            this.map.setCenter(new google.maps.LatLng(0,-50));
        },
        /*
        *  Display a message for IE8- users.
        */
        badBrowser: function() {
            //old ie8, please upgrade
            this.IE8 = true;
            this.display.iframe_content.src = '/static/splash/ie8.html';
            this.initDialog();
            this.display.mesg.append($("<div class='IEwarning'>Your version of Internet Explorer requires the Google Chrome Frame Plugin to view the Map of Life. Chrome Frame is available at <a href='http://www.google.com/chromeframe'>http://www.google.com/chromeframe/</a>. Otherwise, please use the latest version of Chrome, Safari, Firefox, or Internet Explorer.</div>"));
            $(this.display).dialog("option", "closeOnEscape", false);
            $(this.display).bind(
            "dialogbeforeclose",
            function(event, ui) {
                alert('Your version of Internet Explorer is not supported. Please install Google Chrome Frame, or use the latest version of Chrome, Safari, Firefox, or IE.');
                return false;
            }
            );
            $(self.display.iframe_content).height(320);
        },
        /*
        * Display a message if the site is down.
        */
        molDown: function() {
            this.initDialog();
            this.display.mesg.append($("<font color='red'>Map of Life is down for maintenance. We will be back up shortly.</font>"));
            $(this.display).dialog("option", "closeOnEscape", false);
            $(this.display).bind(
            "dialogbeforeclose",
            function(event, ui) {
                return false;
            }
            );
        },
        addEventHandlers: function() {
            var self = this;
            this.bus.addHandler(
            'toggle-splash',
            function(event) {
                if (self.getIEVersion() < 9 && self.getIEVersion() >= 0) {
                    self.badBrowser();
                } else if (self.MOL_Down) {
                    self.molDown();
                } else {
                    self.initDialog();
                }
                if (!self.IE8) {
                    $(self.display.iframe_content).load(function(event) {
                        self.addIframeHandlers();
                    });
                }
            });
        }
    });
    mol.map.splash.splashDisplay = mol.mvp.View.extend({
        init: function() {
            var html = '' +
            '<div class="mol-Splash">' +
            '    <div class="message"></div>' +
            '    <iframe class="mol-splash iframe_content ui-dialog-content" style="height:400px; width: 98%; margin-right: auto; display: block;" src="/static/splash/index.html"></iframe>' +
            '    <div id="footer_imgs" style="text-align: center">' + '<div>Sponsors, partners and supporters</div>' +
            '        <a target="_blank" tabindex="-1" href="http://www.yale.edu/jetz/"><button><img width="72px" height="36px" title="Jetz Lab, Yale University" src="/static/home/yale.png"></button></a>' +
            '        <a target="_blank" tabindex="-1" href="http://sites.google.com/site/robgur/"><button><img width="149px" height="36px" title="Guralnick Lab, University of Colorado Boulder" src="/static/home/cuboulder.png"></button></a>' +
            '        <a target="_blank" tabindex="-1" href="http://www.gbif.org/"><button><img width="33px" height="32px" title="Global Biodiversity Information Facility" src="/static/home/gbif.png"></button></a>' +
            '        <a target="_blank" tabindex="-1" href="http://www.eol.org/"><button><img width="51px" height="32px" title="Encyclopedia of Life" src="http://www.mappinglife.org/static/home/eol.png"></button></a>' +
            '        <a target="_blank" tabindex="-1" href="http://www.nasa.gov/"><button><img width="37px" height="32px" title="National Aeronautics and Space Administration" src="http://www.mappinglife.org/static/home/nasa.png"></button></a>' +
            '        <br>' +
            '        <a target="_blank" tabindex="-1" href="http://www.nceas.ucsb.edu/"><button><img width="30px" height="32px" title="National Center for Ecological Analysis and Synthesis" src="http://www.mappinglife.org/static/home/nceas.png"></button></a>' +
            '        <a target="_blank" tabindex="-1" href="http://www.iplantcollaborative.org/"><button><img width="105px" height="32px" title="iPlant Collaborative" src="http://www.mappinglife.org/static/home/iplant.png"></button></a>' +
            '        <a target="_blank" tabindex="-1" href="http://www.nsf.gov/"><button><img width="32px" height="32px" title="National Science Foundation" src="http://www.mappinglife.org/static/home/nsf.png"></button></a>' +
            '        <a target="_blank" tabindex="-1" href="http://www.senckenberg.de"><button><img width="81px" height="32px"title="Senckenberg" src="http://www.mappinglife.org/static/home/senckenberg.png"></button></a>' +
            '        <a target="_blank" tabindex="-1" href="http://www.bik-f.de/"><button><img width="74px" height="32px" title="Biodiversität und Klima Forschungszentrum (BiK-F)" src="http://www.mappinglife.org/static/home/bik_bildzeichen.png"></button></a>' +
            '        <a target="_blank" tabindex="-1" href="http://www.mountainbiodiversity.org/"><button><img width="59px" height="32px" title="Global Mountain Biodiversity Assessment" src="http://www.mappinglife.org/static/home/gmba.png"></button></a>' +
            '    </div>' +
            '</div>';
            this._super(html);
            this.iframe_content = $(this).find('.iframe_content');
            this.mesg = $(this).find('.message');
        }
    });
};mol.modules.map.help = function(mol) {

    mol.map.help = {};

    mol.map.help.HelpDialog = mol.mvp.Engine.extend(
        {
            init: function(proxy, bus) {
                this.proxy = proxy;
                this.bus = bus;
             },

            /**
             * Starts the MenuEngine. Note that the container parameter is
             * ignored.
             */
            start: function() {
                this.helpDisplay = new mol.map.help.helpDisplay();
                this.feedbackDisplay = new mol.map.help.feedbackDisplay();
                this.initDialog();
                this.addEventHandlers();
            },

            addEventHandlers: function() {
                var self = this;

                this.bus.addHandler(
                    'help-display-dialog',
                    function(event) {
                        var params = null,
                            e = null;

                        if(event.state === undefined) {
                            self.helpDisplay.dialog('open');

                            // This is necessary, because otherwise the
                            // iframe comes out in the wrong size.
                            $(self.helpDisplay).width('98%');
                        } else {
                            self.helpDisplay.dialog(event.state);
                        }
                    }
                );

                this.bus.addHandler(
                    'feedback-display-toggle',
                    function(event) {
                        var params = null,
                            e = null;

                        if(event.state === undefined) {
                            if(self.feedbackDisplay.dialog('isOpen')) {
                                self.feedbackDisplay.dialog('close');
                            } else {
                                self.feedbackDisplay.dialog('open');
                            }

                            // This is necessary, because otherwise the
                            // iframe comes out in the wrong size.
                            $(self.feedbackDisplay).width('98%');
                        } else {
                            self.feedbackDisplay.dialog(event.state);
                        }
                    }
                );


            },

            initDialog: function() {
                this.helpDisplay.dialog(
                    {
                        autoOpen: false,
			            dialogClass: "mol-help",
                        height: 550,
                        width: 700,
                        modal: true
                    }
                );

                this.feedbackDisplay.dialog(
                    {
                        autoOpen: false,
			            dialogClass: "mol-help",
                        height: 550,
                        width: 850,
                        modal: true,
                    }
                );
            }
        }
    );

    mol.map.help.helpDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var html = '' +
                    '<iframe id="help_dialog" ' + 
                        'class="mol-help iframe_content" ' + 
                        'src="/static/help/index.html">' + 
                    '</iframe>';

                this._super(html);

                // this.iframe_content = $(this).find('.iframe_content');
            }
        }
    );

    mol.map.help.feedbackDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var html = '' +
                    '<iframe id="feedback_dialog" ' + 
                        'src="https://docs.google.com/' + 
                        'spreadsheet/embeddedform?' + 
                        'formkey=dC10Y2ZWNkJXbU5RQWpWbXpJTzhGWEE6MQ" ' + 
                        'width="760" ' + 
                        'height="625" ' + 
                        'frameborder="0" ' + 
                        'marginheight="0" ' + 
                        'marginwidth="0">' + 
                        'Loading...' + 
                    '</iframe>';

                this._super(html);

                // this.iframe_content = $(this).find('.iframe_content');
            }
        }
    );
};



mol.modules.map.status = function(mol) {

    mol.map.status = {};

    mol.map.status.StatusEngine = mol.mvp.Engine.extend(
        {
            init: function(proxy, bus) {
                this.proxy = proxy;
                this.bus = bus;
             },

            /**
             * Starts the MenuEngine. Note that the container parameter is
             * ignored.
             */
            start: function() {

                this.display = new mol.map.status.StatusDisplay();
                this.addEventHandlers();
            },

            showStatus: function() {
                this.display.dialog(
                    {
                        autoOpen: true,
            			width: 680,
            			height: 390,
            			dialogClass: "mol-status",
            			modal: true
                    }
                );
                
                $(this.display).width('98%');
            },
            
            addEventHandlers : function () {
                 var self = this;
                 this.bus.addHandler(
                    'status-display-dialog',
                    function (params) {
                        self.showStatus();
                    }
                );
            }
        }
    );

    mol.map.status.StatusDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var html = '' +
                '<div>' +
	            '  <iframe ' + 
	                   'class="mol-status iframe_content ui-dialog-content" ' + 
	                   'style="height:600px; ' + 
	                           'width: 98%; ' + 
	                           'margin-left: -18px; ' + 
	                           'margin-right: auto; ' + 
	                           'display: block;" ' + 
                       'src="/static/status/index.html">' + 
                '  </iframe>' +
                '</div>';

                this._super(html);
                this.iframe_content = $(this).find('.iframe_content');
		        this.mesg = $(this).find('.message');
            }
        }
    );
};



mol.modules.map.styler = function(mol) {
    mol.map.styler = {};
    
    mol.map.styler.StylerEngine = mol.mvp.Engine.extend({
        init: function(proxy, bus) {
            this.proxy = proxy;
            this.bus = bus;
        },
        
        start: function() {
            this.display = new mol.map.styler.StylerDisplay();
            this.addEventHandlers();
        },
        
        addEventHandlers: function() {
            var self = this;
            
            this.bus.addHandler(
                'show-styler',
                function(event) {
                    self.displayLayerStyler(event.params.target, 
                                            event.params.layer);
                }
            );
            
            this.bus.addHandler(
                'reset-layer-style',
                function(event) {
                    var o = self.parseLayerStyle(event.params.layer, "orig");
                            
                    //update css
                    self.updateLegendCss(
                        $(event.params.l).find('.styler'), 
                        o, 
                        event.params.layer,
                        event.params.layer.orig_opacity
                    );

                    //update tiles
                    self.updateLayerStyle(
                        $(event.params.l).find('.styler'),
                        o,
                        event.params.layer, 
                        event.params.layer.orig_opacity
                    );
                }
            );
            
            this.bus.addHandler(
                'style-all-layers',
                function(event) {
                    var button = event.params.target,
                        display = event.params.display,
                        layers = event.params.layers,
                        baseHtml,
                        q;
                    
                    baseHtml = '' + 
                           '<div class="mol-LayerControl-Styler">' +
                           '  <div class="colorPickers">' + 
                           '    <div class="colorPicker">' + 
                           '      <span class="stylerLabel">Color:&nbsp</span>' + 
                           '      <input type="text" id="allFill" />' +
                           '    </div>' + 
                           '  </div>' + 
                           '  <div class="buttonWrapper allStyler">' +
                           '    <button id="applyStyle">Apply</button>' +
                           '    <button id="cancelStyle">Cancel</button>' +
                           '  </div>' +      
                           '</div>';
                    
                    $(button).removeData('qtip');
                    
                    q = $(button).qtip({
                        content: {
                            text: baseHtml,
                            title: {
                                text: 'Style All Layers',
                                button: true
                            }
                        },
                        position: {
                            at: 'left center',
                            my: 'right top'
                        },
                        show: {
                            event: 'click',
                            delay: 0,
                            ready: true,
                            solo: true
                        },
                        hide: false,
                        style: {
                            def: false,
                            classes: 'ui-tooltip-widgettheme'
                        },
                        events: {
                            render: function(event, api) {                                       
                                var colors = ['black','white','red','yellow',
                                              'blue','green','orange','purple'],
                                    colors2 = ['#66C2A5','#FC8D62', '#8DA0CB',
                                               '#E78AC3', '#A6D854', '#FFD92F',
                                               '#E5C494'];
         
                                $("#allFill").spectrum({
                                      color: 'black',
                                      showPaletteOnly: true,
                                      palette: [colors, colors2]
                                });         

                                $(api.elements.content)
                                    .find('#applyStyle').click(
                                        function(event) {
                                            var o = {},
                                                color;
                                            
                                            color = $('#allFill')
                                                        .spectrum("get")
                                                            .toHexString();               
                                            
                                            o.fill = color;
                                            o.size = 1;
                                            o.border = color;
                                            o.s1 = color;
                                            o.s2 = color;
                                            o.s3 = color;
                                            o.s4 = color;
                                            o.s5 = color;
                                            o.p = color;
                                            
                                            _.each(
                                                layers,
                                                function(layer) {
                                                    var l, 
                                                        current;
                                                            
                                                    l = display.getLayer(layer);
                                                        
                                                    current = self
                                                            .parseLayerStyle(
                                                                layer, 
                                                                "current");
                                                            
                                                    o.s1c = current.s1c;
                                                    o.s2c = current.s2c;
                                                    o.s3c = current.s3c;
                                                    o.s4c = current.s4c;
                                                    o.s5c = current.s5c;
                                                    o.pc = current.pc;
                                                    
                                                    if(layer.type == "range") {
                                                        o.size = 0;
                                                    }
                                                    
                                                    if(layer.style_table == 
                                                                "point_style") {
                                                        o.size = 3;
                                                    }        
                                                    
                                                    //update css
                                                    self.updateLegendCss(
                                                        $(l).find('.styler'), 
                                                        o, 
                                                        layer,
                                                        0.9
                                                    );
                        
                                                    //update tiles
                                                    self.updateLayerStyle(
                                                        $(l).find('.styler'),
                                                        o,
                                                        layer, 
                                                        0.9
                                                    );
                                                }
                                            );  
                                                   
                                            $(button).prop('disabled', false);            
                                            $(button).qtip('destroy');
                                        }
                                );
                                    
                                $(api.elements.content)
                                    .find('#cancelStyle').click(
                                        function(event) {
                                            $(button).prop('disabled', false);
                                            $(button).qtip('destroy');
                                        }
                                    );
                            },
                            show: function(event, api) {                              
                                $(button).prop('disabled', true);
                            },
                            hide: function(event, api) {
                                $(button).prop('disabled', false);
                                $(button).qtip('destroy');
                            }
                        }
                    });
                }  
            );
            
            this.bus.addHandler(
                'initial-legend-style',
                function(event) {
                    var o = {};
                    
                    //style legends initially
                    o = self.parseLayerStyle(event.params.layer, "orig");
                                    
                    //initalize css
                    self.updateLegendCss(
                        $(event.params.l).find('.styler'), 
                        o, 
                        event.params.layer,
                        event.params.layer.orig_opacity
                    );
                }
            );
            
            this.bus.addHandler(
                'toggle-layer-highlight',
                function(event) {
                    self.toggleLayerHighlight(event.params.layer,
                                              event.params.visible,
                                              event.params.selected);
                }
            );
        },
        
        displayLayerStyler: function(button, layer) {
            var baseHtml,
                layer_curr_style,
                layer_orig_style,
                max,
                min,
                params = {
                    layer: layer,
                    style: null
                },
                q,
                self = this;
            
            layer_curr_style = self.parseLayerStyle(layer, "current");
            layer_orig_style = self.parseLayerStyle(layer, "orig");
            
            baseHtml = '' + 
                   '<div class="mol-LayerControl-Styler ' +layer.source+ '">' +
                   '  <div class="colorPickers"></div>' + 
                   '  <div class="sizerHolder"></div>' +
                   '  <div class="opacityHolder">' +
                   '    <span class="sliderLabel">Opacity:&nbsp</span>' +
                   '    <div class="sliderContainer">' +
                   '      <div class="opacity"></div>' +
                   '    </div>' +
                   '    <span id="opacityValue">50</span>' +
                   '  </div>' +
                   '  <div class="buttonWrapper">' +
                   '    <button id="applyStyle">Apply</button>' +
                   '    <button id="resetStyle">Reset</button>' +
                   '    <button id="cancelStyle">Cancel</button>' +
                   '  </div>' +      
                   '</div>';
            
            $(button).removeData('qtip'); 
            
            q = $(button).qtip({
                content: {
                    text: baseHtml,
                    title: {
                        text: 'Layer Style',
                        button: true
                    }
                },
                position: {
                    at: 'left center',
                    my: 'right top'
                },
                show: {
                    event: 'click',
                    delay: 0,
                    ready: true,
                    solo: true
                },
                hide: false,
                style: {
                    def: false,
                    classes: 'ui-tooltip-widgettheme'
                },
                events: {
                    render: function(event, api) {   
                        self.getStylerLayout(
                                $(api.elements.content)
                                    .find('.mol-LayerControl-Styler'),
                                layer);
                                
                        self.setStylerProperties(
                                    api.elements.content,
                                    layer,
                                    layer_curr_style, 
                                    layer_orig_style,
                                    false);
               
                        $(api.elements.content).find('#applyStyle').click(
                            function(event) {
                                var o = {};

                                if(layer.type == "range") {
                                    //TODO issue #175 replace iucn ref 
                                    if(layer.source == "jetz" || 
                                       layer.source == "iucn") {
                                        o.s1 = $('#showFill1Palette')
                                             .spectrum("get")
                                                .toHexString();
                                        o.s1c = $('#seasChk1')
                                                    .is(':checked') ? 1:0;        
                                        o.s2 = $('#showFill2Palette')
                                                 .spectrum("get")
                                                    .toHexString();
                                        o.s2c = $('#seasChk2')
                                                    .is(':checked') ? 1:0;            
                                        o.s3 = $('#showFill3Palette')
                                                 .spectrum("get")
                                                    .toHexString();
                                        o.s3c = $('#seasChk3')
                                                    .is(':checked') ? 1:0; 
                                    }
                                    
                                    //TODO issue #175 replace iucn ref               
                                    if(layer.source == "iucn") {
                                        o.s4 = $('#showFill4Palette')
                                             .spectrum("get")
                                                .toHexString();
                                        o.s4c = $('#seasChk4')
                                                    .is(':checked') ? 1:0;
                                    }                
                                     
                                    if(layer.source != "jetz") {
                                        o.s5 = $('#showFill5Palette')
                                             .spectrum("get")
                                                .toHexString();
                                        o.s5c = $('#seasChk5')
                                                    .is(':checked') ? 1:0;
                                    }
                                    
                                    if(layer.source == "iucn") {               
                                        o.p = $('#showFill6Palette')
                                             .spectrum("get")
                                                .toHexString(); 
                                        o.pc = $('#seasChk6')
                                                    .is(':checked') ? 1:0;                
                                    }                                                               
                                } else {
                                    o.fill = $('#showFillPalette')
                                            .spectrum("get")
                                                .toHexString();
                                }
                                
                                o.border = $('#showBorderPalette')
                                                .spectrum("get")
                                                    .toHexString();                
                                o.size = $(api.elements.content)
                                                .find('.sizer')
                                                    .slider('value');
                                
                                self.updateLegendCss(
                                        button, 
                                        o, 
                                        layer,
                                        parseFloat($(api.elements.content)
                                            .find('.opacity')
                                                .slider("value")));
                                
                                self.updateLayerStyle(
                                        button,
                                        o,
                                        layer,
                                        parseFloat($(api.elements.content)
                                            .find('.opacity')
                                                .slider("value")) 
                                );       
                                       
                                $(button).prop('disabled', false);           
                                $(button).qtip('destroy');
                            }
                        );
                        
                        $(api.elements.content)
                            .find('#resetStyle').click(
                                function(event) {
                                    self.setStylerProperties(
                                                    api.elements.content,
                                                    layer,
                                                    layer_orig_style, 
                                                    layer_orig_style,
                                                    true);
                                }
                            );
                            
                        $(api.elements.content)
                            .find('#cancelStyle').click(
                                function(event) {
                                    $(button).prop('disabled', false);
                                    $(button).qtip('destroy');
                                }
                            );
                    },
                    show: function(event, api) {                              
                        $(button).prop('disabled', true);
                    },
                    hide: function(event, api) {
                        $(button).prop('disabled', false);
                        $(button).qtip('destroy');
                    }
                }
            });
        },
        
        parseLayerStyle: function(layer, original) {
            var o = {},
                fillStyle, borderStyle, sizeStyle,
                style,
                s1Style, s2Style, s3Style, s4Style, s5Style, pStyle,
                s1, s2, s3, s4, s5, p, pc,
                c1, c2, c3, c4, c5;
                
            if(original == "current") {
                style = layer.style;
            } else if(original == "orig") {
                style = layer.orig_style;
            } else {
                style = layer.tile_style;
            }
            
            if(layer.style_table == "points_style") {
                fillStyle = style.substring(
                                    style.indexOf('marker-fill'),
                                    style.length-1);
                                    
                borderStyle = style.substring(
                                    style.indexOf('marker-line-color'),
                                    style.length-1);   
                                    
                sizeStyle = style.substring(
                                    style.indexOf('marker-width'),
                                    style.length-1);                  
                
                o = {fill: fillStyle.substring(
                                    fillStyle.indexOf('#'),
                                    fillStyle.indexOf(';')),
                     border: borderStyle.substring(
                                    borderStyle.indexOf('#'),
                                    borderStyle.indexOf(';')),
                     size: Number($.trim(sizeStyle.substring(
                                    sizeStyle.indexOf(':')+1,
                                    sizeStyle.indexOf(';'))))};
            } else {
                if(layer.type == "range") {
                    if(layer.source == "jetz" || layer.source == "iucn") {
                        s1Style = style.substring(
                                        style.indexOf('seasonality=1'),
                                        style.length-1);
                                            
                        s1 = s1Style.substring(
                                        s1Style.indexOf('polygon-fill'),
                                        s1Style.length-1);
                                        
                        c1 = s1Style.substring(
                                        s1Style.indexOf('polygon-opacity'),
                                        s1Style.length-1);           
      
                        s2Style = style.substring(
                                        style.indexOf('seasonality=2'),
                                        style.length-1);
                                            
                        s2 = s2Style.substring(
                                        s2Style.indexOf('polygon-fill'),
                                        s2Style.length-1);
                                        
                        c2 = s2Style.substring(
                                        s2Style.indexOf('polygon-opacity'),
                                        s2Style.length-1);                 
                                    
                        s3Style = style.substring(
                                        style.indexOf('seasonality=3'),
                                        style.length-1);
                                            
                        s3 = s3Style.substring(
                                        s3Style.indexOf('polygon-fill'),
                                        s3Style.length-1);
                                        
                        c3 = s3Style.substring(
                                        s3Style.indexOf('polygon-opacity'),
                                        s3Style.length-1);                                 
                                    
                        o.s1 = s1.substring(
                                        s1.indexOf('#'),
                                        s1.indexOf(';'));
                        o.s2 = s2.substring(
                                        s2.indexOf('#'),
                                        s2.indexOf(';'));
                        o.s3 = s3.substring(
                                        s3.indexOf('#'),
                                        s3.indexOf(';'));
                        o.s1c = c1.substring(
                                        c1.indexOf(':')+1,
                                        c1.indexOf(';'));
                        o.s2c = c2.substring(
                                        c2.indexOf(':')+1,
                                        c2.indexOf(';'));
                        o.s3c = c3.substring(
                                        c3.indexOf(':')+1,
                                        c3.indexOf(';'));    
                    }
                    
                    //TODO issue #175 replace iucn ref    
                    if(layer.source == "iucn") {
                        s4Style = style.substring(
                                    style.indexOf('seasonality=4'),
                                    style.length-1);
                                        
                        s4 = s4Style.substring(
                                        s4Style.indexOf('polygon-fill'),
                                        s4Style.length-1); 
                                  
                        c4 = s4Style.substring(
                                        s4Style.indexOf('polygon-opacity'),
                                        s4Style.length-1);  
                        
                        o.s4 = s4.substring(
                                    s4.indexOf('#'),
                                    s4.indexOf(';'));
                        
                        o.s4c = c4.substring(
                                    c4.indexOf(':')+1,
                                    c4.indexOf(';'));               
                    }
                    
                    if(layer.source != 'jetz') {
                        s5Style = style.substring(
                                    style.indexOf('seasonality=5'),
                                    style.length-1);
                                        
                        s5 = s5Style.substring(
                                    s5Style.indexOf('polygon-fill'),
                                    s5Style.length-1); 
                                    
                        c5 = s5Style.substring(
                                    s5Style.indexOf('polygon-opacity'),
                                    s5Style.length-1);                        
                                    
                        o.s5 = s5.substring(
                                    s5.indexOf('#'),
                                    s5.indexOf(';'));
                                    
                        o.s5c = c5.substring(
                                    c5.indexOf(':')+1,
                                    c5.indexOf(';'));    
                    }
                    
                    if(layer.source == "iucn") {
                        pStyle = style.substring(
                                    style.indexOf('presence=4'),
                                    style.length-1);
                                        
                        p = pStyle.substring(
                                    pStyle.indexOf('polygon-fill'),
                                    pStyle.length-1);      
                                    
                        pc = pStyle.substring(
                                    pStyle.indexOf('polygon-opacity'),
                                    pStyle.length-1);                  
                                    
                        o.p = p.substring(
                                    p.indexOf('#'),
                                    p.indexOf(';')); 
                                    
                        o.pc = pc.substring(
                                    pc.indexOf(':')+1,
                                    pc.indexOf(';'));
                    }
                } else {
                    fillStyle = style.substring(
                                    style.indexOf('polygon-fill'),
                                    style.length-1);                  
                    
                    o = {fill: fillStyle.substring(
                                    fillStyle.indexOf('#'),
                                    fillStyle.indexOf(';'))};
                }
                
                borderStyle = style.substring(
                                    style.indexOf('line-color'),
                                    style.length-1); 
                              
                sizeStyle = style.substring(
                                style.indexOf('line-width'),
                                style.length-1);                   
                
                o.border = borderStyle.substring(
                                borderStyle.indexOf('#'),
                                borderStyle.indexOf(';'));
                                
                o.size = Number($.trim(sizeStyle.substring(
                                sizeStyle.indexOf(':')+1,
                                sizeStyle.indexOf(';'))));
            }
                           
            return o;
        },
        
        getStylerLayout: function(element, layer) {
            var pickers,
                sizer;    
                   
            if(layer.style_table == "points_style") {
               pickers = '' + 
                   '<div class="colorPicker">' + 
                   '  <span class="stylerLabel">Fill:&nbsp</span>' + 
                   '  <input type="text" id="showFillPalette" />' +
                   '</div>' +
                   '<div class="colorPicker">' + 
                   '  <span class="stylerLabel">Border:&nbsp</span>' + 
                   '  <input type="text" id="showBorderPalette" />' +
                   '</div>';
                   
               sizer = '' +
                   '<span class="sliderLabel">Size:&nbsp</span>' +
                   '  <div class="sliderContainer">' +
                   '    <div class="sizer"></div>' +
                   '  </div>' +
                   '<span id="pointSizeValue">8px</span>';
               
               $(element).find('.colorPickers').prepend(pickers);
               $(element).find('.sizerHolder').prepend(sizer);
            } else {
                if(layer.type == "range") {
                   pickers = '';
                   
                   //TODO issue #175 replace iucn ref     
                   if(layer.source == "jetz" || layer.source == "iucn") {
                       pickers+=''+
                           '<span class="seasonLabel">Breeding</span>' +
                           '<div class="colorPicker">' + 
                           '  <span class="stylerLabel">Fill:&nbsp</span>' + 
                           '  <input type="text" id="showFill2Palette" />' +
                           '  <input type="checkbox" id="seasChk2" ' + 
                                    'class="seasChk" checked="checked"/>' +
                           '</div>' +
                           '<span class="seasonLabel">Resident</span>' +
                           '<div class="colorPicker">' + 
                           '  <span class="stylerLabel">Fill:&nbsp</span>' + 
                           '  <input type="text" id="showFill1Palette" />' +
                           '  <input type="checkbox" id="seasChk1" ' + 
                                    'class="seasChk" checked="checked"/>' +
                           '</div>' +
                           '<span class="seasonLabel">Non-breeding</span>' +
                           '<div class="colorPicker">' + 
                           '  <span class="stylerLabel">Fill:&nbsp</span>' + 
                           '  <input type="text" id="showFill3Palette" />' +
                           '  <input type="checkbox" id="seasChk3" ' + 
                                    'class="seasChk" checked="checked"/>' +
                           '</div>';
                   }                           
                   
                   //TODO issue #175 replace iucn ref                           
                   if (layer.source == "iucn") {
                       pickers+=''+
                           '<span class="seasonLabel">Passage</span>' +
                           '<div class="colorPicker">' + 
                           '  <span class="stylerLabel">Fill:&nbsp</span>' + 
                           '  <input type="text" id="showFill4Palette" />' +
                           '  <input type="checkbox" id="seasChk4" ' + 
                                    'class="seasChk" checked="checked"/>' +
                           '</div>';
                   }
                   
                   //TODO issue #175 replace iucn ref  
                   if(layer.source != 'jetz') {
                        pickers+=''+
                           '<span class="seasonLabel">' + 
                               'Seasonality Uncertain</span>' +
                           '<div class="colorPicker">' + 
                           '  <span class="stylerLabel">Fill:&nbsp</span>' + 
                           '  <input type="text" id="showFill5Palette" />' +
                           '  <input type="checkbox" id="seasChk5" ' + 
                                    'class="seasChk" checked="checked"/>' +
                           '</div>';
                   }            
                     
                   //TODO issue #175 replace iucn ref         
                   if(layer.source == "iucn") {  
                       pickers+=''+      
                           '<span class="seasonLabel">' + 
                               'Extinct or Presence Uncertain</span>' +
                           '<div class="colorPicker">' + 
                           '  <span class="stylerLabel">Fill:&nbsp</span>' + 
                           '  <input type="text" id="showFill6Palette" />' +
                           '  <input type="checkbox" id="seasChk6" ' + 
                                    'class="seasChk" checked="checked"/>' +
                           '</div>';
                   }
                   
                   pickers+=''+
                       '<span class="seasonLabel">All</span>' +
                       '<div class="colorPicker">' + 
                       '  <span class="stylerLabel">Border:&nbsp</span>' + 
                       '  <input type="text" id="showBorderPalette" />' +
                       '</div>';
                       
                   sizer = '' +
                       '<span class="sliderLabel">Width:&nbsp</span>' +
                       '  <div class="sliderContainer">' +
                       '    <div class="sizer"></div>' +
                       '  </div>' +
                       '<span id="pointSizeValue">8px</span>';    
                       
                   $(element).find('.colorPickers').prepend(pickers);
                   $(element).find('.sizerHolder').prepend(sizer);
                } else {
                   pickers = '' + 
                       '<div class="colorPicker">' + 
                       '  <span class="stylerLabel">Fill:&nbsp</span>' + 
                       '  <input type="text" id="showFillPalette" />' +
                       '</div>' +
                       '<div class="colorPicker">' + 
                       '  <span class="stylerLabel">Border:&nbsp</span>' + 
                       '  <input type="text" id="showBorderPalette" />' +
                       '</div>';
                       
                   sizer = '' +
                       '<span class="sliderLabel">Width:&nbsp</span>' +
                       '  <div class="sliderContainer">' +
                       '    <div class="sizer"></div>' +
                       '  </div>' +
                       '<span id="pointSizeValue">8px</span>';
                   
                   $(element).find('.colorPickers').prepend(pickers);
                   $(element).find('.sizerHolder').prepend(sizer);
                }
            }
        },
        
        setStylerProperties: function(cont, lay, currSty, origSty, reset) {
            var colors = ['black','white','red','yellow',
                          'blue','green','orange','purple'],
                colors2 = ['#66C2A5','#FC8D62', '#8DA0CB',
                           '#E78AC3', '#A6D854', '#FFD92F','#E5C494'],
                objs = [],
                max,
                min,
                layOpa;    
                            
            if(lay.type == "range") {
                if(lay.source == "jetz" || lay.source == "iucn") {
                    objs.push({name: '#showFill1Palette', 
                            color: currSty.s1, 
                            def: origSty.s1});
                    objs.push({name: '#showFill2Palette', 
                            color: currSty.s2, 
                            def: origSty.s2});
                    objs.push({name: '#showFill3Palette', 
                            color: currSty.s3, 
                            def: origSty.s3});
                            
                    $(cont).find('#seasChk1')
                        .prop('checked', (currSty.s1c == 1) ? true : false);
                    $(cont).find('#seasChk2')
                        .prop('checked', (currSty.s2c == 1) ? true : false);
                    $(cont).find('#seasChk3')
                        .prop('checked', (currSty.s3c == 1) ? true : false);         
                }
                
                objs.push({name: '#showBorderPalette', 
                            color: currSty.border, 
                            def: origSty.border});                        
                      
               //TODO issue #175 replace iucn ref           
                if(lay.source == "iucn") {
                    $(cont).find('#seasChk4')
                        .prop('checked', (currSty.s4c == 1) ? true : false);
                    objs.push({name: '#showFill4Palette', 
                          color: currSty.s4, 
                          def: origSty.s4});                         
                }
               
                if(lay.source != 'jetz') {
                    $(cont).find('#seasChk5')
                        .prop('checked', (currSty.s5c == 1) ? true : false);
                    objs.push({name: '#showFill5Palette', 
                          color: currSty.s5, 
                          def: origSty.s5});
                }
               
                if(lay.source == "iucn") {
                    $(cont).find('#seasChk6')
                        .prop('checked', (currSty.pc == 1) ? true : false);
                    objs.push({name: '#showFill6Palette', 
                              color: currSty.p, 
                              def: origSty.p});       
                }        
            } else {
                objs = [ {name: '#showFillPalette', 
                          color: currSty.fill, 
                          def: origSty.fill},
                         {name: '#showBorderPalette', 
                          color: currSty.border, 
                          def: origSty.border}     
                       ];
            }
            
            _.each(objs, function(obj) {
                $(obj.name).spectrum({
                  color: obj.color,
                  showPaletteOnly: true,
                  palette: [
                      [obj.def],
                      colors, colors2
                  ]
               }); 
            });
            
            //sizer        
            if(lay.style_table == "points_style") {
                max = 8;
                min = 1;
            } else {
                max = 3;
                min = 0;
            }        
                              
            $(cont).find('.sizer').slider({
                value: currSty.size, 
                min:min, 
                max:max, 
                step:1, 
                animate:"slow",
                slide: function(event, ui) {
                    $(cont).find('#pointSizeValue').html(ui.value + "px");
                }
            });
                
            $(cont).find('#pointSizeValue').html(
                $(cont).find('.sizer').slider('value') + "px"); 

            layOpa = reset ? lay.orig_opacity : lay.style_opacity;
                    
            //opacity
            $(cont).find('.opacity').slider({
                value: layOpa, 
                min:0, 
                max:1, 
                step: 0.1, 
                animate:"slow",
                slide: function(event, ui) {
                    $(cont).find('#opacityValue').html(
                        (ui.value)*100 + "&#37");
                }}
            );
            
            $(cont).find('#opacityValue').html((layOpa)*100 + "&#37");
        },
        
        updateLegendCss: function(button, o, layer, opa) {
            if(layer.type == "range") {
                if(layer.source == "jetz" || layer.source == "iucn") {
                    $(button).find('.s1').css({
                        'background-color':o.s2, 
                        'opacity': (o.s2c == 0) ? 0 : opa});
                    $(button).find('.s2').css({
                        'background-color':o.s1,
                        'opacity': (o.s1c == 0) ? 0 : opa});
                    $(button).find('.s3').css({
                        'background-color':o.s3,
                        'opacity': (o.s3c == 0) ? 0 : opa});
                        
                    //TODO issue #175 replace iucn ref                
                    if(layer.source == "iucn") {
                        $(button).find('.s4').css({
                            'background-color':o.s4,
                            'opacity': (o.s4c == 0) ? 0 : opa}); 
                    }
                    
                    $(button).find('.legend-seasonal')
                        .css({
                            'border-color':o.border,
                            'border-width':o.size+"px",
                            'opacity':opa
                        }
                    );     
                } else {
                    $(button).find('.legend-polygon')
                        .css({
                            'background-color':o.s5,
                            'border-color':o.border,
                            'border-width':o.size+"px",
                            'opacity':(o.s5c == 0) ? 0 : opa
                        }
                    );
                }                                  
            } else {
                if(layer.style_table == "points_style") {
                    $(button).find('.legend-point')
                        .css({
                            'background-color':o.fill,
                            'border-color':o.border,
                            'width':(o.size+3)+"px",
                            'height':(o.size+3)+"px",
                            'opacity':opa
                        }
                    );
                } else {
                    $(button).find('.legend-polygon')
                        .css({
                            'background-color':o.fill,
                            'border-color':o.border,
                            'border-width':o.size+"px",
                            'opacity':opa
                        }
                    );    
                }
            }
        },
        
        updateLayerStyle: function(button, obj, lay, opa) {
            var o = obj,
                os = {},
                sel_style_desc,
                style_desc,
                params = {},
                oparams = {},
                self = this;
                
            $.extend(os, o);
                                
            if($(button).parent().hasClass('selected')) {   
                os.border = "#FF00FF";
            }
            
            sel_style_desc = self.updateStyle(lay, lay.tile_style, os);
            style_desc = self.updateStyle(lay, lay.tile_style, o);                                    
            
            params.layer = lay;
            params.style = sel_style_desc;
            
            //keep the style around for later        
            lay.style = style_desc;
            
            self.bus.fireEvent(new mol.bus.Event(
                'apply-layer-style', params));

            oparams = {
                layer: lay,
                opacity: lay.opacity,
                style_opacity: opa
            };

            //store the opacity on the layer object
            lay.style_opacity = oparams.style_opacity;
            
            self.bus.fireEvent(new mol.bus.Event(
                'layer-opacity', oparams));                
        },
        
        updateStyle: function(layer, style, newStyle) {
            var updatedStyle,
                season;
            
            if(layer.style_table == "points_style") {
                style = this.changeStyleProperty(
                            style, 'marker-fill', newStyle.fill, false);
                style = this.changeStyleProperty(
                            style, 'marker-line-color', newStyle.border, 
                                false);
                style = this.changeStyleProperty(
                            style, 'marker-width', newStyle.size, false);
            } else {
                if(layer.type == "range") {
                    if(layer.source == "jetz" || layer.source == "iucn") {
                        style = this.changeStyleProperty(
                                    style, 'seasonality=1', newStyle.s1, true, 
                                    'polygon-fill');
                        style = this.changeStyleProperty(
                                    style, 'seasonality=2', newStyle.s2, true, 
                                    'polygon-fill');
                        style = this.changeStyleProperty(
                                    style, 'seasonality=3', newStyle.s3, true, 
                                    'polygon-fill');                    
                                    
                        style = this.changeStyleProperty(
                                    style, 'seasonality=1', newStyle.s1c, true, 
                                    'polygon-opacity');
                        style = this.changeStyleProperty(
                                    style, 'seasonality=2', newStyle.s2c, true, 
                                    'polygon-opacity');
                        style = this.changeStyleProperty(
                                    style, 'seasonality=3', newStyle.s3c, true, 
                                    'polygon-opacity');    
                    }

                    //TODO issue #175 replace iucn ref                
                    if(layer.source == "iucn") {
                        style = this.changeStyleProperty(
                                style, 'seasonality=4', newStyle.s4, true, 
                                'polygon-fill');
                        style = this.changeStyleProperty(
                                style, 'seasonality=4', newStyle.s4c, true, 
                                'polygon-opacity');               
                    }
                    
                    if(layer.source != 'jetz') {
                        style = this.changeStyleProperty(
                                style, 'seasonality=5', newStyle.s5, true, 
                                'polygon-fill');
                        style = this.changeStyleProperty(
                                style, 'seasonality=5', newStyle.s5c, true, 
                                'polygon-opacity');
                        style = this.changeStyleProperty(
                                style, 'seasonality=0', newStyle.s5, true, 
                                'polygon-fill');
                        style = this.changeStyleProperty(
                                style, 'seasonality=0', newStyle.s5c, true, 
                                'polygon-opacity');        
                    }
                    
                    if(layer.source == 'iucn') {
                        style = this.changeStyleProperty(
                                style, 'presence=4', newStyle.p, true, 
                                'polygon-fill');
                        style = this.changeStyleProperty(
                                style, 'presence=5', newStyle.p, true, 
                                'polygon-fill'); 
                        style = this.changeStyleProperty(
                                style, 'presence=6', newStyle.p, true, 
                                'polygon-fill');
                        style = this.changeStyleProperty(
                                style, 'presence=4', newStyle.pc, true, 
                                'polygon-opacity');
                        style = this.changeStyleProperty(
                                style, 'presence=5', newStyle.pc, true, 
                                'polygon-opacity'); 
                        style = this.changeStyleProperty(
                                style, 'presence=6', newStyle.pc, true, 
                                'polygon-opacity');
                    }                                                 
                } else {
                    style = this.changeStyleProperty(
                                style, 'polygon-fill', newStyle.fill, 
                                    false);
                }
                
                style = this.changeStyleProperty(
                                style, 'line-color', newStyle.border, false);
                style = this.changeStyleProperty(
                                style, 'line-width', newStyle.size, false); 
            }
            
            updatedStyle = style;
            
            return updatedStyle;
        },
        
        changeStyleProperty: function(style, prop, newSty, isSeas, seasonProp) {
            var updatedStyle,
                subStyle,
                spreStyle,
                preStyle,
                smidStyle,
                midStyle,
                srestStyle;
                            
            if(isSeas) {
                spreStyle = style.substring(
                                0,
                                style.indexOf(prop+"]")
                            );
                
                preStyle = style.substring(
                                style.indexOf(prop+"]"),
                                style.length
                           );
                            
                smidStyle = preStyle.substring(
                                0,
                                preStyle.indexOf(seasonProp+":")
                            );
                
                midStyle = preStyle.substring(
                                preStyle.indexOf(seasonProp+":"),
                                preStyle.length
                           );
                
                srestStyle = midStyle.substring(
                                midStyle.indexOf(";"),
                                midStyle.length
                             );
                
                updatedStyle = spreStyle + 
                              smidStyle +
                              seasonProp + ":" + 
                              newSty +
                              srestStyle;                  
            } else {
                subStyle = style.substring(style.indexOf(prop), style.length);
                
                updatedStyle = style.substring(
                                    0,
                                    style.indexOf(prop + ":") + 
                                    prop.length+1
                               ) +
                               newSty +
                               subStyle.substring(
                                    subStyle.indexOf(";"),
                                    subStyle.length
                               );
            }                
            
            return updatedStyle;
        },
        
        toggleLayerHighlight: function(layer, visible, sel) {
            var o = {},
                style_desc,
                self = this,
                style = layer.tile_style,
                oldStyle,
                params = {
                    layer: layer,
                    style: null,
                    isSelected: sel
                };
                
                oldStyle = self.parseLayerStyle(layer, "current");
                
                if(layer.style_table == "points_style") {
                    style = this.changeStyleProperty(
                                style, 
                                'marker-line-color', 
                                visible ? '#FF00FF' : oldStyle.border, 
                                false
                            );
                } else {
                    style = this.changeStyleProperty(
                                style, 
                                'line-color', 
                                visible ? '#FF00FF' : oldStyle.border, 
                                false
                            );
                                
                    style = this.changeStyleProperty(
                                style, 
                                'line-width', 
                                visible ? 2 : oldStyle.size, 
                                false
                            );
                }

                style_desc = style;

                params.style = style_desc;   
                
                self.bus.fireEvent(
                    new mol.bus.Event(
                        'apply-layer-style', 
                        params));
        },
    });
    
    mol.map.styler.StylerDisplay = mol.mvp.View.extend({
        init: function(styler) {
            var html = '' + 
                       '<div>Something here.</div>',
                self = this;
                
            this._super(html);
        }
    });
}
mol.modules.map.images = function(mol) {

    mol.map.images = {};

    mol.map.images.ImagesEngine = mol.mvp.Engine.extend(
        {
            init: function(proxy, bus) {
                this.proxy = proxy;
                this.bus = bus;
             },

            /**
             * Starts the MenuEngine. Note that the container parameter is
             * ignored.
             */
            start: function() {

                this.display = new mol.map.images.ImagesDisplay();
                this.addEventHandlers();
            },

            showImages: function() {
                this.display.dialog(
                    {
                        autoOpen: true,
                        width: 640,
                        height: 480,
                        dialogClass: "mol-images",
                        modal: true
                    }
                );
                 $(this.display).width('98%');

            },
            addEventHandlers : function () {
                 var self = this;
                 this.bus.addHandler(
                    'get-images',
                    function (params) {
                        $.post(
                            'eol/images',
                            {
                                names : params.names},
                            function(response) {
                               $(self.display).empty();
                               _.each(
                                   response,
                                   function(species) {
                                       _.each(
                                           species.dataObjects,
                                           function(dataObject) {
                                               self.display.append(new mol.map.images.ImageDisplay(dataObject.eolMediaURL));
                                           }
                                       )
                                   }
                               );
                               self.showImages();
                            }
                        );

                    }
                );
            }
        }
    );

    mol.map.images.ImagesDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var html = '' +
                '<div class="mol-ImagesDisplay"></div>';

                this._super(html);
            }
        }
    );
       mol.map.images.ImageDisplay = mol.mvp.View.extend(
        {
            init: function(src) {
                var html = '' +
                '<img height="100%" src="{0}">';

                this._super(html.format(src));
            }
        }
    );
      mol.map.images.ThumbnailDisplay = mol.mvp.View.extend(
        {
            init: function(src) {
                var html = '' +
                '<img class="mol-Thumbnail" src="{0}">';

                this._super(html.format(src));
            }
        }
    );
};



mol.modules.map.boot = function(mol) {

    mol.map.boot = {};

    mol.map.boot.BootEngine = mol.mvp.Engine.extend({
        init: function(proxy, bus, map) {
            this.proxy = proxy;
            this.bus = bus;
            this.map = map;
            this.IE8 = false;
            this.maxLayers = ($.browser.chrome) ? 6 : 25;
            this.sql = '' +
 'SELECT DISTINCT l.scientificname as name,'+
                    '\'cdb\' as mode, ' +
                    't.type as type,'+
                    "CASE d.style_table WHEN 'points_style' " +
                        'THEN t.carto_css_point ' +
                        "WHEN 'polygons_style' " +
                        'THEN t.carto_css_poly END as css,' +
                    't.sort_order as type_sort_order, ' +
                    't.title as type_title, '+
                    't.opacity as opacity, ' +
                    'CONCAT(l.provider,\'\') as source, '+
                    'CONCAT(p.title,\'\') as source_title,'+
                    's.source_type as source_type, ' +
                    's.title as source_type_title, ' +
                    'l.feature_count as feature_count, '+
                    'CONCAT(n.v,\'\') as names, ' +
                    'CASE WHEN l.extent is null THEN null ELSE ' +
                    'CONCAT(\'{' +
                        '"sw":{' +
                            '"lng":\',ST_XMin(l.extent),\', '+
                            '"lat":\',ST_YMin(l.extent),\' '+
                        '}, '+
                        '"ne":{' +
                        '"lng":\',ST_XMax(l.extent),\', ' +
                        '"lat":\',ST_YMax(l.extent),\' ' +
                        '}}\') ' +
                    'END as extent, ' +
                    'l.dataset_id as dataset_id, ' +
                    'd.dataset_title as dataset_title, ' +
                    'd.style_table as style_table, ' +
                    'e.finalmin as mine, ' +
                    'e.finalmax as maxe, ' +
                    'e.habitatprefs as habitat, ' +
                    '(sl.latin is not Null and l.provider = \'jetz\') as inft ' +
                'FROM layer_metadata l ' +
                'LEFT JOIN elevandhabitat e ON ' +
                    'l.scientificname = e.scientific ' +
                'LEFT JOIN specieslist sl ON ' +
                    'l.scientificname = sl.latin ' +
                'LEFT JOIN data_registry d ON ' +
                    'l.dataset_id = d.dataset_id ' +
                'LEFT JOIN types t ON ' +
                    'l.type = t.type ' +
                'LEFT JOIN providers p ON ' +
                    'l.provider = p.provider ' +
                'LEFT JOIN source_types s ON ' +
                    'p.source_type = s.source_type ' +
                'LEFT JOIN ac n ON ' +
                    'l.scientificname = n.n ' +
                'WHERE ' +
                     "n.n~*'\\m{0}' OR n.v~*'\\m{0}'" +
                'ORDER BY name, type_sort_order';
        },
        start: function() {
            this.loadTerm();
        },
        /*
         *   Method to attempt loading layers from search term in the URL.
         */
        loadTerm: function() {
            var self = this;

            // Remove backslashes and replace characters that equal spaces.
            this.term = unescape(
                window.location.pathname
                    .replace(/\//g, '')
                    .replace(/\+/g, ' ')
                    .replace(/_/g, ' ')
            );

            if ((this.getIEVersion() >= 0 && this.getIEVersion() <= 8)
                || this.term == '') {
                // If on IE8- or no query params, fire the splash event
                self.bus.fireEvent(new mol.bus.Event('toggle-splash'));
            } else {
                // Otherwise, try and get a result using term
                $.getJSON(
                    mol.services.cartodb.sqlApi.jsonp_url.format(this.sql.format(self.term)),
                    function(response) {
                        var results = response.rows;
                        if (results.length == 0) {
                            self.bus.fireEvent(new mol.bus.Event('toggle-splash'));
                            self.map.setCenter(new google.maps.LatLng(0,-50));
                        } else {
                            //parse the results
                            self.loadLayers(self.getLayersWithIds(results));
                        }
                    },
                    'json'
                );
            }
        },
        /*
         * Adds layers to the map if there are fewer than 25 results,
         * or fires the search results widgetif there are more.
         */
        loadLayers: function(layers) {
            if (Object.keys(layers).length <= this.maxLayers) {
                this.bus.fireEvent(
                    new mol.bus.Event('add-layers', {layers: layers})
                );

            } else if (this.term != null) {
                this.bus.fireEvent(
                    new mol.bus.Event('search', {term: this.term})
                );
                this.map.setCenter(new google.maps.LatLng(0,-50));
            }
        },
        /*
         * Returns an array of layer objects {id, name, type, source}
         * with their id set given an array of layer objects
         * {name, type, source}.
         */
        getLayersWithIds: function(layers) {
            return _.map(
            layers,
            function(layer) {
                return _.extend(layer, {id: mol.core.getLayerId(layer)});
            }
            );
        },
        /* Returns the version of Internet Explorer or a -1
         * (indicating the use of another browser).
         */
        getIEVersion: function() {
            var rv = -1, ua, re;
            // Return value assumes failure.
            if (navigator.appName == 'Microsoft Internet Explorer') {
                ua = navigator.userAgent;
                re = new RegExp("MSIE ([0-9]{1,}[\.0-9]{0,})");
                if (re.exec(ua) != null) {
                    rv = parseFloat(RegExp.$1);
                }
            }
            return rv;
        }
    });
};
