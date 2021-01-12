import { useContext, useEffect } from 'react';

import MapContext from './MapContext';

import OLVectorLayer from 'ol/layer/Vector';

const VectorLayer = ({ source, style }) => {
  const { map } = useContext(MapContext);
  useEffect(() => {
    if (!map) return;
    let vectorLayer = new OLVectorLayer({
      source,
      style
    });
    map.addLayer(vectorLayer);
    return () => {
      if (!map) {
        return;
      }
      map.removeLayer(vectorLayer);
    };
  }, [map]);
  return null;
};
export default VectorLayer;
