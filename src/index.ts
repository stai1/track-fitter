import 'ol/ol.css';
import { OSM } from 'ol/source';
import { Map, View, Feature, MapBrowserEvent } from 'ol';
import { MousePosition, ScaleLine, ZoomToExtent, defaults } from 'ol/control';
import { Coordinate, createStringXY } from 'ol/coordinate';
import { Geometry, LineString, Point } from 'ol/geom'
import { Tile , Vector } from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import { fromLonLat, toLonLat } from 'ol/proj';
import { getDistance } from 'ol/sphere';
import { Style, Stroke, Circle, Fill} from 'ol/style';
import { CircleOnSphere, TrackOnSphere } from './TrackOnSphere';
import { EARTH_AVERAGE_RADIUS_METERS } from './earth';
import { UNFIT_DATA } from './data';

const CENTER: [number, number] = [-122.25854118373765, 37.79438679073371];

const TRACK_LINE_STYLE = new Style({
  stroke: new Stroke({
    color: '#00ff00',
    width:3
  })
});
const CONTROL_POINTS_STYLE = new Style({
  image: new Circle({
    radius:5,
    fill: new Fill({
      color: '#ffffff'
    }),
    stroke: new Stroke({
      color: '#00ff00',
      width:2
    })
  })
});
const ROUTE_LINE_STYLE = new Style({
  stroke: new Stroke({
    color: '#ff0000',
    width:3
  })
});
const ROUTE_POINTS_STYLE = new Style({
  image: new Circle({
    radius:5,
    fill: new Fill({
      color: '#ffffff'
    }),
    stroke: new Stroke({
      color: '#ff0000',
      width:2
    })
  })
});

export class LineFitter {

  routeLayerSource = new VectorSource({wrapX: true});
  trackPathLayerSource = new VectorSource({wrapX: true});
  controlPointLayerSource = new VectorSource({wrapX: true});

  draggingPointIndex: number;
  map: Map;
  constructor() {
    let mapSource = new OSM();

    this.map = new Map({
      target: 'map',
      controls: defaults().extend([
        new MousePosition({
          coordinateFormat: createStringXY(5),
          projection: 'EPSG:4326',
        }),
        new ScaleLine(),
        new ZoomToExtent(),
      ]),
      layers: [
        new Tile({source: mapSource}),
        new Vector({ source: this.routeLayerSource}),
        new Vector({ source: this.trackPathLayerSource}),
        new Vector({ source: this.controlPointLayerSource}),
      ],
      view: new View({
        center: fromLonLat(CENTER),
        zoom: 19,
      }),
    });

    const feature = new Feature({geometry: new Point(fromLonLat(CENTER))});
    feature.setStyle(CONTROL_POINTS_STYLE);
    this.controlPointLayerSource.addFeature(feature);

    const trackOnSphere = new TrackOnSphere({
      straightLengthMeters: 100,
      sphereRadius: EARTH_AVERAGE_RADIUS_METERS,
      orientation: {
        centerDegrees: CENTER,
        angle: -0.73,
      },
      trackLengthMeters: 400,
    });

    const trackCoordinates = trackOnSphere.trackPathCoordinates();
    const trackLineFeature: Feature<LineString> = new Feature<LineString>({geometry: new LineString([])});

    trackLineFeature.getGeometry()?.setCoordinates(trackCoordinates.map(coordinate => fromLonLat(coordinate)));
    trackLineFeature.setStyle(TRACK_LINE_STYLE);
    this.trackPathLayerSource.addFeature(trackLineFeature);

    const fitData = UNFIT_DATA.map(coordinateDegrees => trackOnSphere.fitToTrack(coordinateDegrees).coordinate);
    for(const data of [...UNFIT_DATA, ...fitData]) {
      const dataPointFeature = new Feature({geometry: new Point(fromLonLat(data))});
      dataPointFeature.setStyle(ROUTE_POINTS_STYLE);
      this.routeLayerSource.addFeature(dataPointFeature);
    }

    const fitPath = trackOnSphere.fitPathToTrack(UNFIT_DATA);
    const routeLineFeature: Feature<LineString> = new Feature<LineString>({geometry: new LineString([])});
    routeLineFeature.getGeometry()?.setCoordinates(fitPath.map(point => fromLonLat(point.coordinate)));
    routeLineFeature.setStyle(ROUTE_LINE_STYLE);
    this.routeLayerSource.addFeature(routeLineFeature);
    console.log(fitPath.map(value => value.lapProgress*400))

  }


}

const app = new LineFitter();