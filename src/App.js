import React, { useEffect, useState } from 'react';

import _ from 'lodash';
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
import { altKeyOnly, click, pointerMove, platformModifierKeyOnly } from 'ol/events/condition';
import { containsCoordinate } from 'ol/extent';

import { useQueryParams, NumberParam, StringParam, withDefault } from 'use-query-params';

import blueZone from './blueZone.json';
import greenZone from './greenZone.json';

const blueZoneSource = new VectorSource({
  features: new GeoJSON().readFeatures(blueZone),
});
const greenZoneSource = new VectorSource({
  features: new GeoJSON().readFeatures(greenZone),
});

const featureToMultipoints = (feature) => {
  const coordinates = feature.getGeometry().getCoordinates()[0];
  return new MultiPoint(coordinates);
}

let view;
let map;

const createStyles = (color, fillColor) => {
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

  return (feature, resolution) => {
    fill.getText().setText(feature.get('name'));
    return [fill, points]
  }
}

const blueZoneStyles = createStyles('blue', 'rgba(0, 0, 255, 0.1)');
const greenZoneStyles = createStyles('green', 'rgba(0, 255, 0, 0.1)');

const blueZoneLayer = new VectorLayer({
  source: blueZoneSource,
  style:  blueZoneStyles,
});

const greenZoneLayer = new VectorLayer({
  source: greenZoneSource,
  style: greenZoneStyles,
});

const Component = () => {

  const [query, setQuery] = useQueryParams({
    lon: withDefault(NumberParam, 23.3168),
    lat: withDefault(NumberParam, 42.6877),
    zoom: withDefault(NumberParam, 13),
    tool: withDefault(StringParam, 'none'),
  });

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
        blueZoneLayer,
        greenZoneLayer,
      ],
      view,
    });
  
    map.on('click', (a) => {
      console.log(a.coordinate);
    });

    map.on('pointermove', _.debounce(showInfo, 100));
  }
  
  const [info, setInfo] = useState({style: {}, text: ''});
  function showInfo(event) {
    const features = map.getFeaturesAtPixel(event.pixel);
    if (features.length == 0) {
      setInfo({
        style: {opacity: 0},
        text: '',
      })
      return;
    }

    map.forEachFeatureAtPixel(event.pixel, (feature, layer) => {
      const properties = feature.getProperties();
      const featureStyle = layer.getStyle()(feature)[0];
      const fillColor = featureStyle.getFill().getColor();
      const textColor = featureStyle.getStroke().getColor();
      const regex = /rgba\((?<red>\d+),\s*(?<green>\d+),\s*(?<blue>\d+)(?<opacity>,\s0\.1)\)/;
      const match = fillColor.match(regex);
      const {red, green, blue} = match.groups;
      const backgroundColor = `rgba(${red}, ${green}, ${blue}, 0.3)`;
      setInfo({
        text: properties.name,
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
      deinit: () => {
        _.forEach(map.getInteractions(), interaction => {
          map.removeInteraction(interaction);
        });
      },
      init: () => {
        const select = new Select({
          condition: click,
        });
        const dragBox = new DragBox({
          condition: platformModifierKeyOnly,
        });
        const selectedFeatures = select.getFeatures();
        dragBox.on('boxstart', () => {
          selectedFeatures.clear();
        });
        dragBox.on('boxend', () => {
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
          greenZoneSource.forEachFeatureIntersectingExtent(extent, collectMatchingPoints);
          blueZoneSource.forEachFeatureIntersectingExtent(extent, collectMatchingPoints);
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
        });

        map.addInteraction(dragBox);
        map.addInteraction(select);
      }
    }
  ]

  const findTool = (name) => _.find(tools, {name});

  const [currentTool, setCurrentTool] = useState(findTool(tool));  
  useEffect(() => {
    const nextTool = findTool(tool);
    if (currentTool === nextTool) {
      return;
    }
    if (currentTool) {
      currentTool.deinit();
    }
    
    setCurrentTool(nextTool);
  }, [tool]);
  useEffect(() => {
    if (!currentTool) {
      return;
    }
    currentTool.init();
  }, [currentTool])

  return (
    <>
      <select onChange={(event) => setQuery({tool: event.target.value}, 'replaceIn')} value={tool} >
        <option value="none">None</option>
        <option value="collect">Collect</option>
      </select>
      <pre className='info' style={info.style}>{info.text}</pre>
    </>
  );
};

export default function App() {
  return (
    <Component />
  );
}
