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
import { CircleOnSphere, TrackOnSphere, TrackOnSphereDesc } from './TrackOnSphere';
import { EARTH_AVERAGE_RADIUS_METERS } from './earth';
import { UNFIT_DATA } from './data';
import { TcxData, TrackPoint, parseTCX, writeTCX } from './tcx-parser';

const CENTER: [number, number] = [-122.25854118373765, 37.79438679073371];

const TRACK_LINE_STYLE = new Style({
  stroke: new Stroke({
    color: '#00ff00',
    width:2
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
  data: TcxData;
  trackOnSphere: TrackOnSphere;
  trackOnSphereDesc: TrackOnSphereDesc = {
    straightLengthMeters: 100,
    sphereRadius: EARTH_AVERAGE_RADIUS_METERS,
    orientation: {
      centerDegrees: CENTER,
      angle: -0.73,
    },
    trackLengthMeters: 400,
    laneWidth: 1.07,
    lane: 1,
  };

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

    this.createTrack();

    // const fitData = UNFIT_DATA.map(coordinateDegrees => trackOnSphere.fitToTrack(coordinateDegrees).coordinate);
    // for(const data of [...UNFIT_DATA, ...fitData]) {
    //   const dataPointFeature = new Feature({geometry: new Point(fromLonLat(data))});
    //   dataPointFeature.setStyle(ROUTE_POINTS_STYLE);
    //   this.routeLayerSource.addFeature(dataPointFeature);
    // }

    // const fitPath = trackOnSphere.fitPathToTrack(UNFIT_DATA);
    // const routeLineFeature: Feature<LineString> = new Feature<LineString>({geometry: new LineString([])});
    // routeLineFeature.getGeometry()?.setCoordinates(fitPath.map(point => fromLonLat(point.coordinate)));
    // routeLineFeature.setStyle(ROUTE_LINE_STYLE);
    // this.routeLayerSource.addFeature(routeLineFeature);
    // console.log(fitPath.map(value => value.lapProgress*400))

  }

  createTrack() {
    this.controlPointLayerSource.clear();
    const feature = new Feature({geometry: new Point(fromLonLat(CENTER))});
    feature.setStyle(CONTROL_POINTS_STYLE);
    this.controlPointLayerSource.addFeature(feature);

    this.trackOnSphere = new TrackOnSphere(this.trackOnSphereDesc);

    const trackCoordinates = this.trackOnSphere.trackPathCoordinates();
    const trackLineFeature: Feature<LineString> = new Feature<LineString>({geometry: new LineString([])});

    this.trackPathLayerSource.clear();
    trackLineFeature.getGeometry()?.setCoordinates(trackCoordinates.map(coordinate => fromLonLat(coordinate)));
    trackLineFeature.setStyle(TRACK_LINE_STYLE);
    this.trackPathLayerSource.addFeature(trackLineFeature);
  }

  loadTCX(fileContents: string) {
    this.data = parseTCX(fileContents);
    const routeLineFeature: Feature<LineString> = new Feature<LineString>({geometry: new LineString([])});
    routeLineFeature.getGeometry()?.setCoordinates(this.data.trackPoints.map(data => fromLonLat([data.lon, data.lat])));
    routeLineFeature.setStyle(ROUTE_LINE_STYLE);
    this.routeLayerSource.clear();
    this.routeLayerSource.addFeature(routeLineFeature);
  }

  exportTCX() {
    return writeTCX(this.data);
  }

  fitPath() {
    if(!this.data) {
      return;
    }
    const dataCoords = this.data.trackPoints.map(value => [value.lon, value.lat] as [number, number]);
    const fitPath = this.trackOnSphere.fitPathToTrack(dataCoords);
    for(let i = 0; i < this.data.trackPoints.length; ++i) {
      this.data.trackPoints[i].lon = fitPath[i].coordinate[0];
      this.data.trackPoints[i].lat = fitPath[i].coordinate[1];
      this.data.trackPoints[i].distance = fitPath[i].lapProgress * this.trackOnSphereDesc.trackLengthMeters;
    }

    this.routeLayerSource.clear();
    const routeLineFeature: Feature<LineString> = new Feature<LineString>({geometry: new LineString([])});
    routeLineFeature.getGeometry()?.setCoordinates(this.data.trackPoints.map(data => fromLonLat([data.lon, data.lat])));
    routeLineFeature.setStyle(ROUTE_LINE_STYLE);
    this.routeLayerSource.addFeature(routeLineFeature);
  }

  setLon(value: number) {
    this.trackOnSphereDesc.orientation.centerDegrees[0] = value;
    this.createTrack();
  }

  setLat(value: number) {
    this.trackOnSphereDesc.orientation.centerDegrees[1] = value;
    this.createTrack();
  }

  setAngle(value: number) {
    this.trackOnSphereDesc.orientation.angle = value;
    this.createTrack();
  }

  setLaneWidth(value: number) {
    this.trackOnSphereDesc.laneWidth = value;
    this.createTrack();
  }

  setLane(value: number) {
    if(!value || value < 1) {
      this.trackOnSphereDesc.lane;
    }
    else {
      this.trackOnSphereDesc.lane = value;
    }
    this.createTrack();
  }
}

const app = new LineFitter();

document.getElementById('import')?.addEventListener('click', () => {
  document.getElementById('import-input')?.click();
});
const importInput = document.getElementById('import-input') as HTMLInputElement;
importInput.addEventListener('change', (event) =>{
  const reader = new FileReader();
  reader.onload = event => {
    app.loadTCX(event.target?.result as string);
  };
  const file = (<HTMLInputElement> event.target).files?.[0];
  reader.readAsText(file as Blob, 'UTF-8');
});

document.getElementById('apply')?.addEventListener('click', () => {
  app.fitPath();
});

const formElement = document.getElementById('export') as HTMLFormElement;
formElement.addEventListener('submit', (ev: Event) => {

  const blob = new Blob([app.exportTCX()], {type: 'octet/stream'});

  const downloadElement = document.getElementById('download') as HTMLAnchorElement;
  downloadElement.href = window.URL.createObjectURL(blob);
  downloadElement.download = 'route' + '.tcx';
  downloadElement.click();
});

const lonElement = document.getElementById('lon') as HTMLInputElement;
lonElement.value = app.trackOnSphereDesc.orientation.centerDegrees[0].toString();
lonElement.addEventListener('input', (event) => {
  app.setLon(Number((event.target as HTMLInputElement).value));
});

const latElement = document.getElementById('lat') as HTMLInputElement;
latElement.value = app.trackOnSphereDesc.orientation.centerDegrees[1].toString();
latElement.addEventListener('input', (event) => {
  app.setLat(Number((event.target as HTMLInputElement).value));
});

const angleElement = document.getElementById('angle') as HTMLInputElement;
angleElement.value = app.trackOnSphereDesc.orientation.angle.toString();
angleElement.addEventListener('input', (event) => {
  app.setAngle(Number((event.target as HTMLInputElement).value));
});

const laneWidthElement = document.getElementById('laneWidth') as HTMLInputElement;
laneWidthElement.value = app.trackOnSphereDesc.laneWidth.toString();
laneWidthElement.addEventListener('input', (event) => {
  app.setLaneWidth(Number((event.target as HTMLInputElement).value));
});

const lane = document.getElementById('lane') as HTMLInputElement;
lane.value = app.trackOnSphereDesc.lane.toString();
lane.addEventListener('input', (event) => {
  app.setLane(Number((event.target as HTMLInputElement).value));
});