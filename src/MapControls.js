import React, { useContext, useEffect, Fragment, useState } from 'react';

import MapContext from './MapContext';

import { Accordion, Card, Button, useAccordionToggle, AccordionContext, Form, Alert } from 'react-bootstrap';
import { DragBox, Select, Modify, Snap } from 'ol/interaction';
import { click, platformModifierKeyOnly, altShiftKeysOnly } from 'ol/events/condition';
import { GeoJSON } from 'ol/format';
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
    name: 'none',
    init: () => () => {},
  },
  {
    name: 'edit',
    init: (map, source) => {
      const select = new Select({
        condition: click,
      });
      const selectedFeatures = select.getFeatures();
      const modify = new Modify({ features: selectedFeatures, deleteCondition: altShiftKeysOnly });
      const snap = new Snap({ source });
      map.addInteraction(select);
      map.addInteraction(modify);
      map.addInteraction(snap);

      return () => {
        map.removeInteraction(select);
        map.removeInteraction(modify);
        map.removeInteraction(snap);
      };
    }
  },
  {
    name: 'print',
    init: (map, source) => {
      const features = _.chain(source.getFeatures())
        .sortBy(features, [feature => {
          return Number(feature.get('name').match(/\d+/)[0]);
        }])
        .forEach(f => console.log(f.get('name')))
        .value();
      
      console.log(new GeoJSON({dataProjection: 'EPSG:3857'}).writeFeatures(features));
    }
  },
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
    const nextTool = findTool(tool);
    if (currentTool === nextTool) {
      return;
    }
    setCurrentTool(nextTool);
  }, [tool]);
  useEffect(() => {
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
        {
          tools.map(({name}, index) => {
            return (<option key={index} value={name}>{name}</option>);
          })
        }
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
