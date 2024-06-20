export interface TrackPoint {
  time: string;
  distance?: number;
  hr?: number;
  lon: number;
  lat: number;
  speed?: number;
  cadence?: number;
  watts?: number;
}
export interface TcxData {
  trackPoints: TrackPoint[];
}

function convertToNumber(content: string): number {
  if(content) {
    return Number(content);
  }
}

export function parseTCX(fileContents: string) {
  const domParser = new DOMParser();
  const xmlDoc = domParser.parseFromString(fileContents, 'text/xml');
  const activity = xmlDoc.getElementsByTagName('Activity')[0];
  const trackpointElements = xmlDoc.getElementsByTagName('Trackpoint');

  const points: TrackPoint[] = [];
  for(let i = 0; i < trackpointElements.length; ++i) {
    const trackpointElement = trackpointElements[i];
    points.push({
      time: trackpointElement.getElementsByTagName('Time')[0].textContent,
      hr: convertToNumber(trackpointElement.getElementsByTagName('HeartRateBpm')[0]?.getElementsByTagName('Value')[0]?.textContent),
      distance: convertToNumber(trackpointElement.getElementsByTagName('DistanceMeters')[0]?.textContent),
      lon: convertToNumber(trackpointElement.getElementsByTagName('Position')[0]?.getElementsByTagName('LongitudeDegrees')[0].textContent),
      lat: convertToNumber(trackpointElement.getElementsByTagName('Position')[0]?.getElementsByTagName('LatitudeDegrees')[0].textContent),
      speed: convertToNumber(trackpointElement.getElementsByTagName('Extensions')[0]?.getElementsByTagName('Speed')[0]?.textContent),
      cadence: convertToNumber(trackpointElement.getElementsByTagName('Extensions')[0]?.getElementsByTagName('RunCadence')[0]?.textContent),
      watts: convertToNumber(trackpointElement.getElementsByTagName('Extensions')[0]?.getElementsByTagName('Watts')[0]?.textContent),
    });
  }

  return {
    trackPoints: points,
  }
}

export function writeTCX(data: TcxData) {
  const xmlDoc = document.implementation.createDocument(null, 'TrainingCenterDatabase', null);
  const trainingCenterDatabase = xmlDoc.documentElement;
  const activity = trainingCenterDatabase
    .appendChild(xmlDoc.createElement('Activities'))
    .appendChild(xmlDoc.createElement('Activity'));
  activity.setAttribute('Sport', 'Running');
  activity.appendChild(xmlDoc.createElement('Id')).textContent = data.trackPoints[0].time;
  const lap = activity.appendChild(xmlDoc.createElement('Lap'));
  lap.setAttribute('StartTime', data.trackPoints[0].time);
  const track = lap.appendChild(xmlDoc.createElement('Track'));
  for(const point of data.trackPoints) {
    const trackpointElement = track.appendChild(xmlDoc.createElement('Trackpoint'));
    trackpointElement.appendChild(xmlDoc.createElement('Time')).textContent = point.time;
    trackpointElement.appendChild(xmlDoc.createElement('DistanceMeters')).textContent = String(point.distance);
    const position = trackpointElement.appendChild(xmlDoc.createElement('Position'));
    position.appendChild(xmlDoc.createElement('LatitudeDegrees')).textContent = String(point.lat);
    position.appendChild(xmlDoc.createElement('LongitudeDegrees')).textContent = String(point.lon);
    if(point.hr) {
      trackpointElement.appendChild(xmlDoc.createElement('HeartRateBpm')).appendChild(xmlDoc.createElement('Value')).textContent = String(point.hr);
    }
    const tpx = trackpointElement.appendChild(xmlDoc.createElement('Extensions')).appendChild(xmlDoc.createElement('TPX'));
    if(point.speed) {
      tpx.appendChild(xmlDoc.createElement('Speed')).textContent = String(point.speed);
    }
    if(point.cadence) {
      tpx.appendChild(xmlDoc.createElement('RunCadence')).textContent = String(point.cadence);
    }
    if(point.watts) {
      tpx.appendChild(xmlDoc.createElement('Watts')).textContent = String(point.watts);
    }
  }
  return '<?xml version="1.0" encoding="UTF-8"?>' + new XMLSerializer().serializeToString(xmlDoc);
}