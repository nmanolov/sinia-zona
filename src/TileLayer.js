import { useContext, useEffect } from 'react';

import MapContext from './MapContext';
import OLTileLayer from 'ol/layer/Tile';

const TileLayer = ({ source }) => {
  const { map } = useContext(MapContext); 
  
  useEffect(() => {
    if (!map) return;
    
    let tileLayer = new OLTileLayer({
      source,
    });
    map.addLayer(tileLayer);
    return () => {
      if (!map) {
        return;
      }
      map.removeLayer(tileLayer);
    };
  }, [map]);
  return null;
};
export default TileLayer;
