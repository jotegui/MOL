mol.modules.map.feature = function(mol) {
    
    mol.map.feature = {};
    
    mol.map.feature.FeatureEngine = mol.mvp.Engine.extend({
        init : function(proxy, bus, map) {
            this.proxy = proxy;
            this.bus = bus;
            this.map = map;
            //TODO add
            this.url = 'http://mol.cartodb.com/api/v2/sql?callback=?&q={0}';
            //TODO add
            this.sql = "SELECT * FROM " + 
                       "get_map_feature_metadata({0},{1},{2},{3},'{4}')";
            this.mesql = "SELECT {5} as timestamp,* FROM " + 
                       "get_feature_presence({0},{1},{2},{3},'{4}')";           
            
            this.clickDisabled = true;
            this.makingRequest = false;
            this.mapMarker;
            this.activeLayers = [];
            
            this.lastRequestTime;        },

        start : function() {
            this.addEventHandlers();
        },
        
        addEventHandlers : function () {
            var self = this;
            
            this.bus.addHandler(
                'layer-click-toggle',
                function(event) {
                    if(event.disable) {
                      self.clickDisabled = event.disable;  
                        
                      self.map
                        .setOptions(
                          { 
                            draggableCursor: 
                            'url(' + 
                            'http://maps.google.com/mapfiles/' + 
                            'openhand.cur' + 
                            '), move' 
                          }
                        ); 
                    } 
                }
            );
            
            this.bus.addHandler(
                'add-layers',
                function(event) {
                    var newLays = _.map(event.layers, 
                                        function(l) { 
                                          var o = {id:l.id, op:l.opacity};
                                          
                                          return o });
                    
                    self.activeLayers = _.compact(
                                            _.union(
                                                newLays, 
                                                self.activeLayers));                              
                }
            );
            
            this.bus.addHandler(
                'remove-layers',
                function(event) {
                    var oldLays = _.map(event.layers, 
                                        function(l) { 
                                            var o = {id:l.id, op:l.opacity};
                                            return o;
                                        });                       
                                                
                    _.each(oldLays, function(e) {
                        self.activeLayers = _.reject(
                                                self.activeLayers, 
                                                function(ol) {
                                                    return ol.id == e.id;
                                                });
                    });                                                                      
                }
            );
            
            this.bus.addHandler(
                'layer-toggle',
                function(event) {
                    _.each(self.activeLayers, function(al) {
                        if(al.id == event.layer.id) {
                            al.op = event.showing ? 1 : 0;
                        }  
                    });             
                }
            );
            
            this.bus.addHandler(
                'layer-clicking-toggle',
                function(event) {
                    self.clickDisabled = event.disable;
                    
                    if(!self.clickDisabled) {
                      self.map
                        .setOptions({ draggableCursor: 'pointer' }); 
                    } else {
                      self.map
                        .setOptions(
                          { 
                            draggableCursor: 
                            'url(' + 
                            'http://maps.google.com/mapfiles/' + 
                            'openhand.cur' + 
                            '), move' 
                          }
                        ); 
                    }    
                }
            );
                
            google.maps.event.addListener(
                self.map,
                "click",
                function (mouseevent) {
                    var tolerance = 2,
                        sqlLayers,
                        sql,
                        sym;
                        
                    if(!self.clickDisabled && self.activeLayers.length > 0) {
                        if(self.makingRequest) {
                            alert('Please wait for your feature metadata ' + 
                              'request to complete before starting another.');
                        } else {
                            self.makingRequest = true;
                          
                            if(self.display) {
                                self.display.remove();
                            }   
                            
                            sqlLayers =  _.pluck(_.reject(
                                            self.activeLayers, 
                                            function(al) {
                                                return al.op == 0;
                                            }), 'id');         
                            
                            sql = self.sql.format(
                                    mouseevent.latLng.lng(),
                                    mouseevent.latLng.lat(),
                                    tolerance,
                                    self.map.getZoom(),
                                    sqlLayers.toString()
                            );
                            
                            self.bus.fireEvent(new mol.bus.Event(
                                'show-loading-indicator',
                                {source : 'feature'}));
                                
                               
                            
                            $.getJSON(
                                self.url.format(sql),
                                function(data, textStatus, jqXHR) {
                                    var results = {
                                            latlng: mouseevent.latLng,
                                            response: data
                                        },
                                        e;
                                        
                                    if(!data.error && data.rows.length != 0) {
                                        self.processResults(data.rows);
                                        self.showFeatures(results)
                                    }  
                                        
                                    self.makingRequest = false;    
                                    
                                    self.bus.fireEvent(
                                        new mol.bus.Event(
                                          'hide-loading-indicator',
                                          {source : 'feature'})); 
                                }
                            );
                        }  
                    }
                }
            );
            
            
        },
        
        processResults: function(rows) {
            var self = this,
                o,
                vs,
                all,
                allobj,
                head,
                sp,
                myLength,
                content,
                entry,
                inside;

            self.display = new mol.map.FeatureDisplay();
            self.featurect = 0;
            _.each(rows, function(row) {
                var i,
                    j,
                    k;
                    
                o = JSON.parse(row.layer_features);
                all = _.values(o)[0];
                allobj = all[0];
                                
                
                head = _.keys(o)[0].split("--");
                sp = head[1].replace("_", " ");
                sp = sp.charAt(0).toUpperCase() + sp.slice(1);
                
                content = '' + 
                        '<h3>' + 
                        '  <a href="#">' + 
                             sp +
                        '    <button ' + 
                                'class="source" ' + 
                                'title="Layer Source: ' 
                                + allobj["Source"] + '">' +
                        '      <img src="/static/maps/search/' + head[3] + '.png">' +
                        '    </button>' +
                        '    <button ' + 
                                'class="type" ' + 
                                'title="Layer Type: ' 
                                + allobj["Type"] + '">' + 
                        '      <img src="/static/maps/search/' + head[2] + '.png">' +  
                        '    </button>' + 
                        '  </a>' + 
                        '</h3>';

                //TODO try a stage content display
                myLength = (all.length > 100) ? 100 : all.length; 
                self.featurect+=(all.length);
                
                if(myLength == 1) {
                    entry = '<div>{0} record found.'.format(all.length);
                } else {
                    entry = '<div>{0} records found.'.format(all.length);
                }
                
                if(all.length > 100) {
                    entry+=' Displaying first 100 records. Please zoom in before querying again to reduce the number of records found.</div>';  
                } else {
                    entry+='</div>';
                }    
                
                for(j=0;j<myLength;j++) {
                    vs = all[j];
                    inside = ''; 
                      
                    for(i=0;i < _.keys(vs).length; i++) {
                        k = _.keys(vs)[i];
                        inside+='<div class="itemPair"><b>{0}:&nbsp;</b>{1}</div>'
                            .format(k,vs[k]);
                    }
                     
                    if(j!=0) {
                        entry+="<div>&nbsp</div>";  
                    }
                     
                    entry+=inside;  
                }

                content+='<div>{0}</div>'.format(entry);
                
                $(self.display).find('.accordion').append(content);
                
                $(self.display).find('.source').click(
                    function(event) {
                          self.bus.fireEvent(
                              new mol.bus.Event(
                                  'metadata-toggle',
                                  {params : {
                                      dataset_id: head[4],
                                      title: allobj["Source"]
                                  }}
                              )
                          );
                          event.stopPropagation();
                          event.cancelBubble = true;
                      }
                );
                
                $(self.display).find('.type').click(
                    function(event) {
                          self.bus.fireEvent(
                              new mol.bus.Event(
                                  'metadata-toggle',
                                  {params : {
                                      type: head[2],
                                      title: allobj["Type"]
                                  }}
                              )
                          );
                          event.stopPropagation();
                          event.cancelBubble = true;
                      }
                );
            });
        },
        
        showFeatures: function(params) {
            var self = this,
                latHem = (params.latlng.lat() > 0) ? 'N' : 'S',
                lngHem = (params.latlng.lng() > 0) ? 'E' : 'W',
                options = {
                    autoHeight: false,
                    collapsible: (params.response.total_rows > 1) ? true: false,
                    change: function (event, ui) {
                        self.mapMarker.draw();
                    },
                    animated: false
                }
                msg ='',
                zoom = self.map.getZoom(),
                pix = 2;
            if(params.response.total_rows > 1) { 
                options.active = false;
            }
            
            var msg = '<span>' + self.featurect + ' features from ' + params.response.total_rows + 
                ' layer' + ((params.response.total_rows>1) ? 's' : '') + ' found within ' + Math.round((pix*40075000/(256*(2^zoom)))/1000) + ' km' +
                ' of ' + Math.round(params.latlng.lat()*1000)/1000 + '&deg;' + latHem + ', ' + 
                Math.round(params.latlng.lng()*1000)/1000 + '&deg;' + lngHem + '</span>';
            
            $(self.display).find('.info').append($(msg));    
            $(self.display).find('.accordion').accordion(options);
            
            self.display.close.click(
                function(event) {
                    //self.display.empty();
                    event.stopPropagation();
                    self.mapMarker.remove();
                    
                }
            );
            self.mapMarker = new mol.map.FeatureMarker(params.latlng, self.map, self.display[0]);
        }
    });
    
    mol.map.FeatureDisplay = mol.mvp.View.extend({
        init : function(d, lat,NS,lng,EW) {
            var className = 'mol-Map-FeatureDisplay',
                html = '' +
                    '<div class="cartodb-popup">' +
                        '<a class="cartodb-popup-close-button close">x</a>' +
                        '<div class="cartodb-popup-content-wrapper">' +
                            '<div class="' + className + '">' +
                                '<div class="info"></div>' +
                                '<div class="accordion"></div>' +
                            '</div>'+
                        '</div>' +
                        '<div class="cartodb-popup-tip-container"></div>' +
                    '</div>';
            this._super(html);
            this.close = $(this).find('.close');
        }
    });
    
    //
    //Classes for a google maps info window overlay.
    //
    mol.map.FeatureMarker = function(latlng, map, div) {
            this.latlng_ = latlng;
            this.init_ = false;
            if (div) {
                div.parentNode.innerHTML='';
            }
            
            this.div_ = div;
            this.setMap(map);
    }
    mol.map.FeatureMarker.prototype = new google.maps.OverlayView();
    mol.map.FeatureMarker.prototype.draw = function () {
        var self = this,
            div = this.div_;

        if (!this.init_) {
            // Then add the overlay to the DOM
            var panes = this.getPanes();
            panes.overlayImage.appendChild(div);
            this.init_ = true;
             // catch mouse events and stop them propogating to the map
              google.maps.event.addDomListener(this.div_, 'mousedown', this.stopPropagation_);
              google.maps.event.addDomListener(this.div_, 'dblclick', this.stopPropagation_);
              google.maps.event.addDomListener(this.div_, 'DOMMouseScroll', this.stopPropagation_);

        }
        // Position the overlay 
        var point = this.getProjection().fromLatLngToDivPixel(this.latlng_);
        if (point && div) {
          div.style.left = (point.x -28) + 'px';
          div.style.top = (point.y - $(div).height()-5) + 'px';
        
        
            if($(div).offset().top<0) {
                this.map.panBy(0,$(div).offset().top-10);
            }
        }
    };
    mol.map.FeatureMarker.prototype.remove = function() {
        // Check if the overlay was on the map and needs to be removed.
        if (this.div_) {
          this.div_.parentNode.removeChild(this.div_);
          this.div_ = null;
        }
    };
   
    mol.map.FeatureMarker.prototype.getPosition = function() {
       return this.latlng_;
    };
    mol.map.FeatureMarker.prototype.getDOMElement = function() {
       return this.div_;
    };
    
    mol.map.FeatureMarker.prototype.stopPropagation_ = function(e) {
      if(navigator.userAgent.toLowerCase().indexOf('msie') != -1 && document.all) {
        window.event.cancelBubble = true;
        window.event.returnValue = false;
      } else {
        // e.preventDefault(); // optionally prevent default actions
        e.stopPropagation();
      }
    }
    
}
