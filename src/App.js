import React, { useEffect, useState, useRef } from 'react';

import _ from 'lodash';
import './style.scss';

import Layers from './Layers';
import TileLayer from './TileLayer';
import VectorLayer from './VectorLayer';
import MapContext from './MapContext';
import MapControls from './MapControls';

import OSM from 'ol/source/OSM';
import { toLonLat, fromLonLat } from 'ol/proj'
import VectorSource from 'ol/source/Vector';
import { GeoJSON } from 'ol/format';
import MultiPoint from 'ol/geom/MultiPoint';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { GeometryCollection } from 'ol/geom'
import { easeIn } from 'ol/easing';
import View from 'ol/View';
import OLMap from 'ol/Map';

import { useQueryParams, NumberParam, StringParam, withDefault, ArrayParam } from 'use-query-params';
import Color from 'color';
import { Col, Row, Container } from 'react-bootstrap';

const darken = (originalColorString) => {
  const color = Color(originalColorString);
  return color.darken(0.5).alpha(0.3).rgb().string();
}

const zonesSource = new VectorSource({
  url: './zones.json',
  format: new GeoJSON(),
});

const featureToMultipoints = (feature) => {
  const coordinates = feature.getGeometry().getCoordinates()[0];
  return new MultiPoint(coordinates);
}

const zoneStyles = (feature, resolution) => {
  const color = feature.get('color') || 'gray';
  const fillColor = feature.get('fillColor') || 'rgba(127, 127, 127, 0.5)';
  const text = feature.get('name');

  const fill = new Style({
    stroke: new Stroke({
      color,
      width: 2,
      lineDash: [5],
    }),
    fill: new Fill({
      color: fillColor,
    }),
    text: new Text({
      text,
      font: '12px Calibri,sans-serif',
      stroke: new Stroke({
        color,
        width: 1,
      }),
    }),
  });
  const points = new Style({
    image: new CircleStyle({
      radius: 2,
      fill: new Fill({
        color,
      }),
    }),
    geometry: featureToMultipoints,
  });

  return [fill, points]
}

const App = () => {
  const [query, setQuery] = useQueryParams({
    lon: withDefault(NumberParam, 23.3168),
    lat: withDefault(NumberParam, 42.6877),
    zoom: withDefault(NumberParam, 13),
    tool: withDefault(StringParam, 'none'),
  });

  const {
    lon, lat, zoom, tool
  } = query;

  const [features, setFeatures] = useState([]);

  const mapRef = useRef();
  const [map, setMap] = useState(null);
  const center = fromLonLat([lon, lat]);
  useEffect(() => {
    let options = {
      view: new View({
        zoom,
        center
      }),
      layers: [],
      controls: [],
      overlays: []
    };
    let mapObject = new OLMap(options);
    mapObject.setTarget(mapRef.current);
    setMap(mapObject);
    return () => mapObject.setTarget(undefined);
  }, []);

  useEffect(() => {
    zonesSource.on('featuresloadend', (event)=> {
      setFeatures(event.features);

      return () => {
        event.target.un('featuresloadend');
      };
    })
  });

  const [featuresByColor, setColorFeatures] = useState({});
  const [colors, setColors] = useState([]);

  useEffect(() => {
    const colors = _.chain(features)
      .map(feature => feature.get('color'))
      .uniq()
      .value();
    setColors(colors);
    setColorFeatures(_.groupBy(features, feature => feature.get('color')));
  }, [features]);

  const [hiddenFeaturesQuery, setHiddenFeaturesNames] = useQueryParams({
    hidden: withDefault(ArrayParam, []),
  });
  const hiddenFeatures = hiddenFeaturesQuery.hidden;

  const [featuresVisibilities, setFeaturesVisibilities] = useState({});

  const isZoneVisible = (name) => {
    return featuresVisibilities[name] || false;
  };

  useEffect(() => {
    const hiddenFeaturesHash = _.reduce(hiddenFeatures, (acc, name)=> {
      acc[name] = true;
      return acc;
    }, {})

    const visibilities = {};
    _.forEach(colors, color=> {
      visibilities[color] = _.every(featuresByColor[color], feature => !hiddenFeaturesHash[feature.get('name')]) && !hiddenFeaturesHash[color];
    });
    
    _.forEach(colors, (color) => {
      _.forEach(featuresByColor[color], (feature) => {
        visibilities[feature.get('name')] = true;
      });
      if(hiddenFeaturesHash[color]) {
        _.forEach(featuresByColor[color], (feature) => {
          visibilities[feature.get('name')] = false;
        })
        visibilities[color]=false;
      }
    });
    
    _.forEach(hiddenFeaturesHash, (_value, key)=> {
      visibilities[key] = false;
    });

    setFeaturesVisibilities(visibilities);
  }, [hiddenFeatures, features, colors, featuresByColor])


  const showZone = (shouldShow, name) => {
    if(_.includes(colors, name)){
      const featuresNames = getFeaturesNamesByColor(name);
      const hidden = _.difference(hiddenFeatures, featuresNames, [name]);
      if(shouldShow) {
        setHiddenFeaturesNames({hidden});
      } else {
        setHiddenFeaturesNames({hidden: [name, ...hidden]});
      }
      return;
    }

    const featureColor = getFeatureColorByName(name);
    const allNamesOfTheSameColor = getFeaturesNamesByColor(featureColor);

    if(shouldShow) {
      featuresVisibilities[name] = true;
      const newHiddenFeaturesNames = _.chain(hiddenFeatures)
      .difference([name, featureColor], allNamesOfTheSameColor)
      .concat(_.filter(allNamesOfTheSameColor, name => !featuresVisibilities[name]))
        .value();
      setHiddenFeaturesNames({hidden: newHiddenFeaturesNames});
    } else {
      featuresVisibilities[name] = false;
      const allAreInvisible = _.every(allNamesOfTheSameColor, (name) => !featuresVisibilities[name]);
      if(allAreInvisible) {
        const newHiddenFeaturesNames = _.chain(hiddenFeatures)
          .difference(allNamesOfTheSameColor)
          .concat(featureColor)
          .value();
        setHiddenFeaturesNames({hidden: newHiddenFeaturesNames});
      } else {
        const newHiddenFeaturesNames = _.chain(hiddenFeatures)
          .concat([name])
          .value();
        setHiddenFeaturesNames({hidden: newHiddenFeaturesNames});
      }
    }
  };

  const getFeaturesByColor = (color) => {
    return _.filter(features,
      feature => feature.get('color') === color);
  }

  const getFeatureColorByName = (name) => {
    return _.find(features, feature => feature.get('name') === name).get('color');
  }

  const getFeaturesNamesByColor = (color) => {
    return _.chain(features)
      .filter(feature => feature.get('color') === color)
      .map(feature => feature.get('name'))
      .value();
  }

  const navigate = (name) => {
    showZone(true, name);

    if(!map) {
      return;
    }

    let fitTarget;
    if(_.includes(colors, name)) {
      const zoneFeaturesGeometry = getFeaturesByColor(name)
        .map(feature => feature.getGeometry())
      const combinedGeometry = new GeometryCollection(zoneFeaturesGeometry);

      fitTarget = combinedGeometry.getExtent();
    } else {
      const feature = _.find(features, (f)=> f.get('name') === name);
      fitTarget = feature.getGeometry();
    }
    map.getView().fit(fitTarget, { duration: 2000, easing: easeIn, nearest: true, padding: [40, 40, 40, 40]});
  }

  useEffect(()=>{
    _.forEach(features, (feature)=>{
      if(featuresVisibilities[feature.get('name')]) {
        feature.setStyle(null);
      } else {
        feature.setStyle(new Style());
      }
    });
    return () =>{
      _.forEach(features, (feature)=>{ feature.setStyle(null); });
    };
  }, [features, featuresVisibilities]);

  useEffect(() => {
    if(!map) {
      return;
    }
    const view = map.getView();
    const renavigate = _.throttle((e) => {
      const view = e.target;
      const zoom = view.getZoom();
      const [lon, lat] = toLonLat(view.getCenter());
      setQuery({zoom, lon, lat}, 'pushIn');
    }, 200);

    const showInfoDebounced = _.debounce(showInfo, 100);
    
    view.on('change', renavigate);
    map.on('pointermove', showInfoDebounced);

    return () => {
      view.un('change', renavigate);
      view.un('pointermove', showInfoDebounced);
    }
  }, [map]);
  
  const [info, setInfo] = useState({style: {}, text: '', coordinate: []});
  function showInfo(event) {
    const features = map.getFeaturesAtPixel(event.pixel);
    const coordinate = toLonLat(event.coordinate);
    if (features.length == 0) {
      setInfo({
        text: '',
        coordinate,
      })
      return;
    }

    map.forEachFeatureAtPixel(event.pixel, (feature, layer) => {
      const text = feature.getProperties().name;
      let style;
      if(!layer) {
        style = {
          backgroundColor: 'white',
          color: 'black',
          borderColor: 'red',
        };
      } else {
        const featureStyle = layer.getStyle()(feature)[0];
        const fillColor = featureStyle.getFill().getColor();
        const textColor = featureStyle.getStroke().getColor();
        const backgroundColor = darken(fillColor);
        style = {
          backgroundColor,
          color: textColor,
          borderColor: textColor
        };
      }

      setInfo({
        text,
        coordinate,
        style,
      });
    });
  };

  return (
    <MapContext.Provider value={{ map, source: zonesSource }}>
      <Container>
        <Row>
          <Col lg="3">
            <MapControls
              tool={tool}
              setTool={tool => setQuery({tool}, 'pushIn')}
              info={info}
              colors={colors}
              featuresByColor={featuresByColor}
              navigate={navigate}
              isZoneVisible={isZoneVisible}
              showZone={showZone} >
            </MapControls>
          </Col>
          <Col lg="9">
            <div ref={mapRef} className="map">
            </div>
          </Col>
          <Layers>
            <TileLayer source={new OSM()}></TileLayer>
            <VectorLayer source={zonesSource} style={zoneStyles}></VectorLayer>
          </Layers>
        </Row>
      </Container>
    </MapContext.Provider>
  );
};

export default App;
