import React, { useContext, useEffect, Fragment, useState } from 'react';

import MapContext from './MapContext';

import { Accordion, Card, Button, useAccordionToggle, AccordionContext, Form, Alert } from 'react-bootstrap';
import { DragBox, Select } from 'ol/interaction';
import { click, platformModifierKeyOnly } from 'ol/events/condition';
import { containsCoordinate } from 'ol/extent';

const colorsTranslations = {
  blue: 'Синя Зона',
  green: 'Зелена Зона',
};

function ContextAwareToggle({ children, eventKey, callback, className }) {
  const currentEventKey = useContext(AccordionContext);

  const decoratedOnClick = useAccordionToggle(
    eventKey,
    () => callback && callback(eventKey),
  );

  const isCurrentEventKey = currentEventKey === eventKey;

  return (
    <Button
      variant='outline-link'
      className={[className, isCurrentEventKey? 'expanded': 'collapsed']}
      onClick={decoratedOnClick}
    >
      {children}
    </Button>
  );
}

const tools = [
  {
    name: 'collect',
    init: (map, source) => {
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
        source.forEachFeatureIntersectingExtent(extent, collectMatchingPoints);
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
];

const MapControls = ({
  tool,
  setTool,
  colors,
  info,
  featuresByColor,
  navigate,
  isZoneVisible,
  showZone
}) => {
  const { map, source } = useContext(MapContext);

  const findTool = (name) => _.find(tools, {name});
  const [currentTool, setCurrentTool] = useState(findTool(tool));  
  useEffect(() => {
    if(!map) {
      return;
    }
    console.log('useEffect Body')
    const nextTool = findTool(tool);
    if (currentTool === nextTool) {
      return;
    }
    setCurrentTool(nextTool);
  }, [tool]);
  useEffect(() => {
    console.log('initing new current t00l');
    if (!currentTool || !map) {
      return;
    }
    return currentTool.init(map, source);
  }, [currentTool, map])

  return (
    <>
      <pre className='info' style={info.style}>
        <p>
          {info.text || 'Информация'}
        </p>
        <p>
          {info.coordinate.map(num => Math.round((num + Number.EPSILON) * 10000) / 10000).toString()}
        </p>
      </pre>
      <Form.Control as="select" onChange={event => setTool(event.target.value)} value={tool}>
        <option value="none">None</option>
        <option value="collect">Collect</option>
      </Form.Control>
      <Accordion>  
      {
        colors.map((color, zoneIndex) => {
          return (<Card key={zoneIndex}>
            <Card.Header>
              <Button variant='outline-link' onClick={() => navigate(color)}>
                {colorsTranslations[color] || `${color} zone`}
              </Button>
              <Form.Check
                type="checkbox"
                value={color}
                checked={isZoneVisible(color)}
                onChange={e => showZone(e.target.checked, color)}
              />
              <ContextAwareToggle eventKey={zoneIndex.toString()} className='arrow'></ContextAwareToggle>
            </Card.Header>
            <Accordion.Collapse eventKey={zoneIndex.toString()}>
            <Card.Body>
              {featuresByColor[color].map((feature, subzoneIndex) => {
                const name = feature.get('name');
                return (<Fragment key={subzoneIndex}>
                    <Button variant='outline-link' onClick={() => navigate(name)}>
                        {name}
                    </Button>
                    <input  type="checkbox" value={color} checked={isZoneVisible(name)} onChange={e => showZone(e.target.checked, name)}></input>
                  </Fragment>
                );
              })}
            </Card.Body>
            </Accordion.Collapse>
          </Card>);
        })
      }
      </Accordion>
      </>
  )};
export default MapControls;
