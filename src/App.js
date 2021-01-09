import React, { Fragment, useEffect, useState } from 'react';

import _, { difference } from 'lodash';
import './style.css';

import { View, Map } from 'ol';
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM';
import { fromLonLat, toLonLat } from 'ol/proj'
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { GeoJSON } from 'ol/format';
import MultiPoint from 'ol/geom/MultiPoint';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { DragBox, Select } from 'ol/interaction';
import { click, platformModifierKeyOnly } from 'ol/events/condition';
import { containsCoordinate } from 'ol/extent';
import { GeometryCollection } from 'ol/geom'
import { easeIn} from 'ol/easing';

import { useQueryParams, NumberParam, StringParam, withDefault, ArrayParam } from 'use-query-params';
import Color from 'color';

const zonesSource = new VectorSource({
  url: './zones.json',
  format: new GeoJSON(),
});

const featureToMultipoints = (feature) => {
  const coordinates = feature.getGeometry().getCoordinates()[0];
  return new MultiPoint(coordinates);
}

let view;
let map;

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

const zonesLayer = new VectorLayer({
  source: zonesSource,
  style:  zoneStyles,
});

const Component = () => {
  const [query, setQuery] = useQueryParams({
    lon: withDefault(NumberParam, 23.3168),
    lat: withDefault(NumberParam, 42.6877),
    zoom: withDefault(NumberParam, 13),
    tool: withDefault(StringParam, 'none'),
  });

  const [features, setFeatures] = useState([]);

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
  },[features]);

  const {
    lon, lat, zoom, tool
  } = query;

  if(!view) {
    view= new View({
      center: fromLonLat([lon, lat]),
      zoom,
    });
    view.on('change', _.throttle((e) => {
      const view = e.target;
      const zoom = view.getZoom();
      const [lon, lat] = toLonLat(view.getCenter());
      setQuery({zoom, lon, lat}, 'replaceIn');
    }), 200);
  }
  if(!map) {
    map = new Map({
      target: 'map',
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        zonesLayer,
      ],
      view,
    });
  
    map.on('click', (a) => {
      console.log(a.coordinate);
    });

    map.on('pointermove', _.debounce(showInfo, 100));
  }
  
  const [info, setInfo] = useState({style: {}, text: '', coordinate: []});
  function showInfo(event) {
    const features = map.getFeaturesAtPixel(event.pixel);
    const coordinate = toLonLat(event.coordinate);
    if (features.length == 0) {
      setInfo({
        style: {opacity: 0},
        text: '',
        coordinate,
      })
      return;
    }

    const darken = (originalColorString) => {
      const color = Color(originalColorString);
      return color.darken(0.5).alpha(0.3).rgb().string();
    }

    map.forEachFeatureAtPixel(event.pixel, (feature, layer) => {
      const properties = feature.getProperties();
      const featureStyle = layer.getStyle()(feature)[0];
      const fillColor = featureStyle.getFill().getColor();
      const textColor = featureStyle.getStroke().getColor();
      const backgroundColor = darken(fillColor);
      setInfo({
        text: properties.name,
        coordinate,
        style: {
          backgroundColor,
          color: textColor,
          borderColor: textColor,
          opacity: 1,
        }
      });
    });
  }

  const tools = [
    {
      name: 'collect',
      init: () => {
        const select = new Select({
          condition: click,
        });
        const dragBox = new DragBox({
          condition: platformModifierKeyOnly,
        });
        const selectedFeatures = select.getFeatures();
        const asd = () => {
          selectedFeatures.clear();
        };

        const bsd = () => {
          const rotation = map.getView().getRotation();
          const oblique = rotation % (Math.PI / 2) !== 0;
          const candidateFeatures = oblique ? [] : selectedFeatures;
          const extent = dragBox.getGeometry().getExtent();
          const res = [];
          const collectMatchingPoints = (feature) => {
            candidateFeatures.push(feature);
            const coordinates = feature.getGeometry().getCoordinates()[0];
            const includedCoordinates = _.filter(coordinates, (coordinate) => {
              return containsCoordinate(extent, coordinate);
            });
            if(includedCoordinates.length) {
              _.forEach(includedCoordinates, (coordinate) => {
                res.push([feature.getProperties().name, JSON.stringify(coordinate)]);
              });
            }
          }
          zonesSource.forEachFeatureIntersectingExtent(extent, collectMatchingPoints);
          console.table(res);

          if (oblique) {
            const anchor = [0, 0];
            const geometry = dragBox.getGeometry().clone();
            geometry.rotate(-rotation, anchor);
            const extent$1 = geometry.getExtent();
            candidateFeatures.forEach(function (feature) {
              const geometry = feature.getGeometry().clone();
              geometry.rotate(-rotation, anchor);
              if (geometry.intersectsExtent(extent$1)) {
                selectedFeatures.push(feature);
              }
            });
          }
        }

        dragBox.on('boxstart', asd);
        dragBox.on('boxend', bsd);

        map.addInteraction(dragBox);
        map.addInteraction(select);

        return () => {
          map.removeInteraction(dragBox);
          map.removeInteraction(select);
          dragBox.un('boxstart', asd);
          dragBox.un('boxend', bsd);
        }
      }
    }
  ]

  const findTool = (name) => _.find(tools, {name});

  const [currentTool, setCurrentTool] = useState(findTool(tool));  
  useEffect(() => {
    console.log('useEffect Body')
    const nextTool = findTool(tool);
    if (currentTool === nextTool) {
      return;
    }
    setCurrentTool(nextTool);
  }, [tool]);
  useEffect(() => {
    console.log('initing new current t00l');
    if (!currentTool) {
      return;
    }
    return currentTool.init();
  }, [currentTool])

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
    
    showZone(true, name);
    view.fit(fitTarget, { duration: 2000, easing: easeIn, nearest: true, padding: [40, 40, 40, 40]});
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

  const [expanded, setExpanded] = useState({});
  const toggleExpanded = (color) => {
    setExpanded({...expanded, [color]: !expanded[color]});
  }

  return (
    <>
      <select onChange={(event) => setQuery({tool: event.target.value}, 'replaceIn')} value={tool} >
        <option value="none">None</option>
        <option value="collect">Collect</option>
      </select>
      <div>{JSON.stringify(info.coordinate)}</div>
      {
        colors.map((color, index) => {
          const expansionClass = (expanded[color] || false)? 'expanded': 'collapsed';
          return (<Fragment key={index}>
            <p className="accordion" > 
              <label onClick={() => navigate(color)}>{color} zone</label>
              <input  type="checkbox" value={color} checked={isZoneVisible(color)} onChange={e => showZone(e.target.checked, color)}></input>
              <button className={expansionClass} onClick={() => toggleExpanded(color)}></button>
            </p>
            <div className={expansionClass}>
            {featuresByColor[color].map((feature, index) => {
              const name = feature.get('name');
              return (
                <p key={index}> 
                  <label onClick={() => navigate(name)}>{name}</label>
                  <input  type="checkbox" value={name} checked={isZoneVisible(name)} onChange={e => showZone(e.target.checked, name)}></input>
                </p>
              );
            })}
            </div>
          </Fragment>);
        })
      }
      <pre className='info' style={info.style}>
        <p>
          {info.text}
        </p>
        <p>
          {info.coordinate.map(num => Math.round((num + Number.EPSILON) * 10000) / 10000).toString()}
        </p>
      </pre>
    </>
  );
};

export default function App() {
  return (
    <Component />
  );
}
