ckan.module('querytool-map', function($) {
    'use strict';

    var api = {
        get: function(action, params) {
            var api_ver = 3;
            var base_url = ckan.sandbox().client.endpoint;
            params = $.param(params);
            var url = base_url + '/api/' + api_ver + '/action/' + action + '?' + params;
            return $.getJSON(url);
        },
        post: function(action, data) {
            var api_ver = 3;
            var base_url = ckan.sandbox().client.endpoint;
            var url = base_url + '/api/' + api_ver + '/action/' + action;
            return $.post(url, data, 'json');
        }
    };

    return {
        initialize: function() {

            this.initLeaflet.call(this);
            this.mapResource = this.el.parent().parent().find('[id*=map_resource_]');
            this.mapTitleField = this.el.parent().parent().find('[id*=map_title_field_]');
            this.mapKeyField = this.el.parent().parent().find('[id*=map_key_field_]');
            this.mapColorScheme = this.el.parent().parent().find('[id*=map_color_scheme_]');

            this.valueField = $('#choose_y_axis_column');
            this.mapResource.change(this.onResourceChange.bind(this));
            this.mapTitleField.change(this.onPropertyChange.bind(this));
            this.mapKeyField.change(this.onPropertyChange.bind(this));
            this.mapColorScheme.change(this.onPropertyChange.bind(this));

            $('.leaflet-control-zoom-in').css({
                'color': '#121e87'
            });
            $('.leaflet-control-zoom-out').css({
                'color': '#121e87'
            });
            this.sandbox.subscribe('querytool:updateMaps', this.onPropertyChange.bind(this));
        },
        resetMap: function() {

            this.options.map_resource = this.mapResource.val();
            this.options.map_title_field = this.mapTitleField.val();
            this.options.map_key_field = this.mapKeyField.val();

            this.map.eachLayer(function(layer) {
                if (layer != this.osm) {
                    this.map.removeLayer(layer);
                }
            }.bind(this));

            if (this.legend) {
                this.map.removeControl(this.legend);
            }
            if (this.info) {
                this.map.removeControl(this.info);
            }
            this.map.setView([39, 40], 2);
        },
        onResourceChange: function() {

            this.options.map_title_field = this.mapTitleField.val();
            this.options.map_key_field = this.mapKeyField.val();

            if (this.options.map_resource != this.mapResource.val() && this.mapResource.val() != '') {
                this.options.map_resource = this.mapResource.val();

                api.get('querytool_get_geojson_properties', {
                        map_resource: this.options.map_resource
                    })
                    .done(function(data) {
                        if (data.success) {

                            this.mapTitleField.find('option').not(':first').remove();
                            this.mapKeyField.find('option').not(':first').remove();

                            $.each(data.result, function(idx, elem) {
                                this.mapTitleField.append(new Option(elem.text, elem.value));
                            }.bind(this));

                            $.each(data.result, function(idx, elem) {
                                this.mapKeyField.append(new Option(elem.text, elem.value));
                            }.bind(this));

                            this.resetMap.call(this);
                        } else {
                            this.resetMap.call(this);
                        }
                    }.bind(this))
                    .fail(function(error) {
                        this.resetMap.call(this);
                    }.bind(this));
            } else {
                this.resetMap.call(this);
            }
        },
        onPropertyChange: function() {

            this.options.map_resource = this.mapResource.val();
            this.options.map_title_field = this.mapTitleField.val();
            this.options.map_key_field = this.mapKeyField.val();
            this.options.map_color_scheme = this.mapColorScheme.val();

            if (this.options.map_title_field && this.options.map_key_field && this.options.map_resource) {

                if (this.legend) {
                    this.map.removeControl(this.legend);
                }
                this.map.eachLayer(function(layer) {
                    if (layer != this.osm) {
                        this.map.removeLayer(layer);
                    }
                }.bind(this));
                this.initializeMarkers.call(this, this.options.map_resource);
            } else {
                this.resetMap.call(this);
            }
        },
        initLeaflet: function() {
            // geo layer
            var mapURL = (this.options.map_resource === true) ? '' : this.options.map_resource;

            var elementId = this.el[0].id;
            var lat = 39;
            var lng = 40;
            var zoom = 2;

            this.map = new L.Map(elementId, {
                scrollWheelZoom: false,
//                zoomControl: false,
                inertiaMaxSpeed: 200,
                dragging: !L.Browser.mobile
            }).setView([lat, lng], zoom);

            var osmUrl = this.options.map_config.osm_url;
            var osmAttrib = this.options.map_config.osm_attribute;
            this.osm = new L.TileLayer(osmUrl, {
                minZoom: 2,
                maxZoom: 18,
                attribution: osmAttrib
            });

            this.map.addLayer(this.osm);

            if (mapURL) {
                // Initialize markers
                this.initializeMarkers.call(this, mapURL);
            }

        },
        createScale: function(featuresValues) {
            var colors = this.options.map_color_scheme.split(',');

            var values = $.map(featuresValues, function(feature, key) {
                    return feature.value;
                }).sort(function(a, b) {
                    return a - b;
                }),
                min = values[0],
                max = values[values.length - 1];

            return d3.scale.quantize()
                .domain([min, max])
                .range(colors);
        },
        formatNumber: function(num) {
            return (num % 1 ? num.toFixed(2) : num);
        },
        createLegend: function() {
            var scale = this.createScale(this.featuresValues);
            var opacity = 1;
            var noDataLabel = 'No data'
            this.legend = L.control({
                position: 'bottomright'
            });

            this.legend.onAdd = function(map) {
                var div = L.DomUtil.create('div', 'info'),
                    ul = L.DomUtil.create('ul', 'legend'),
                    domain = scale.domain(),
                    range = scale.range(),
                    min = domain[0] + 0.0000000001,
                    max = domain[domain.length - 1],
                    step = (max - min) / range.length,
                    grades = $.map(range, function(_, i) {
                        return (min + step * i);
                    }),
                    labels = [];

                div.appendChild(ul);
                for (var i = 0, len = grades.length; i < len; i++) {
                    ul.innerHTML +=
                        '<li><span style="background:' + scale(grades[i]) + '; opacity: ' + opacity + '"></span> ' +
                        this.formatNumber(grades[i]) +
                        (grades[i + 1] ? '&ndash;' + this.formatNumber(grades[i + 1]) + '</li>' : '+</li></ul>');
                }
                ul.innerHTML +=
                    '<li><span style="background:' + '#bdbdbd' + '; opacity: ' + opacity + '"></span> ' +
                    noDataLabel + '</li>';

                return div;
            }.bind(this);

            this.legend.addTo(this.map);
        },
        createInfo: function() {
            var options = this.options;
            var self = this;

            this.info = L.control();

            this.info.onAdd = function (map) {
                this._div = L.DomUtil.create('div', 'map-info'); // create a information div
                this.update();
                return this._div;
            };

            // method that we will use to update the control based on feature properties passed
            this.info.update = function (infoData) {
                this._div.innerHTML = '<h4></h4>' +  (infoData ?
                      options.map_title_field + ': ' + '<b>' + infoData.title + '</b><br/>'
                     + 'type' + ': ' + '<b>' + infoData.type + '</b>' : '');
            };

            this.info.addTo(this.map);
        },
        initializeMarkers: function(mapURL) {

            var smallIcon = L.icon({
                iconUrl: '/base/images/marker-icon.png',
                shadowUrl: '/base/images/marker-shadow.png',
                iconRetinaUrl: '/base/images/marker-icon-2x.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });


            api.post('querytool_get_geojson_map_data', {
                    geojson_url: mapURL,
                    map_key_field: this.options.map_key_field

                })
                .done(function(data) {
                    if (data.success) {
                        var geoJSON = data.result['geojson_data'];
                        this.featuresValues = data.result['geojson_keys'];



//                      Workaround for generating color if data for only one region
                        var valuesKeys = Object.keys(this.featuresValues)
                        var valuesLength = valuesKeys.length;
                        var scale;
                        if (valuesLength === 1) {

                            scale = function (value) {
                                if (value == this.featuresValues[valuesKeys[0]].value) {
                                    var colors = this.options.map_color_scheme.split(',');
                                    return colors[colors.length -1];
                                }
                            }.bind(this)

                        } else {
                            scale = this.createScale(this.featuresValues);
                        }
//                      -----------------------------------------------------------------
                        // Create the info window
                        this.createInfo.call(this);


                        this.geoL = L.geoJSON(geoJSON, {
                            style: function(feature) {

                                var elementData = feature.properties[this.options.map_key_field],
                                    value = elementData && elementData.value,
                                    color = (value) ? scale(value) : '#737373';

                                return {
                                    fillColor: color,
                                    weight: 2,
                                    opacity: 1,
                                    color: 'white',
                                    dashArray: '3',
                                    fillOpacity: 0.7
                                };
                            }.bind(this),
                            pointToLayer: function(fauture, latlng) {
                                return L.circleMarker(latlng, {
                                    icon: smallIcon
                                });
                            },
                            onEachFeature: function(feature, layer) {
                                var elementData = feature.properties[this.options.map_key_field];
                                if (elementData) {

                                    layer.on({
                                        mouseover: function highlightFeature(e) {
                                            var mark = e.target;
                                            mark.setStyle({
                                                weight: 3,
                                                color: '#737373',
                                                dashArray: '3',
                                                fillOpacity: 0.7
                                            });

                                            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                                                layer.bringToFront();
                                            }

                                            var infoData = {
                                                title: feature.properties[this.options.map_title_field],
                                                type: feature.properties['farm_type']
                                            };

                                            this.info.update(infoData);
                                        }.bind(this),
                                        mouseout: function resetHighlight(e) {
                                            this.geoL.resetStyle(e.target);
                                            this.info.update();
                                        }.bind(this)
                                    });
                                }
                            }.bind(this)
                        }).addTo(this.map);
                        //Create the legend
                        //this.createLegend.call(this);
                        // Properly zoom the map to fit all markers/polygons
                        this.map.fitBounds(this.geoL.getBounds());
                    } else {
                        this.resetMap.call(this);
                    }
                }.bind(this))
                .fail(function(error) {
                    this.resetMap.call(this);
                }.bind(this));

        },
        teardown: function() {
            // We must always unsubscribe on teardown to prevent memory leaks.
            this.sandbox.unsubscribe('querytool:updateMaps', this.onPropertyChange.bind(this));
        },
    }
});
