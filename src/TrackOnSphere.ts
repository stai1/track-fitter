export interface TrackOnSphereDesc {
  /**
   * angular length of the straight, i.e. length of great circle segment
   */
  straightLengthMeters: number;

  /**
   * Earth radius
   */
  sphereRadius: number;

  /**
   * Center of track
   */
  centerDegrees: [number, number];

  /**
   * Tilt angle of track, radians, at the location of the center
   */
  angle: number;

  trackLengthMeters: number;
}

/**
 * Return the coordinate as [lon, lat] of a point on the circle at an angle, radians
 * @param angle 
 */
function circleCoordinate(angle: number, radiusAngular: number, center: [number, number]): [number, number] {
  const lonCenter = center[0];
  const latCenter = center[1];
  const lat = Math.asin(Math.sin(latCenter)*Math.cos(radiusAngular) + Math.cos(latCenter)*Math.sin(radiusAngular)*Math.cos(angle));
  const lon = lonCenter + Math.atan2(
    Math.sin(angle)*radiusAngular*Math.cos(latCenter),
    Math.cos(radiusAngular) - Math.sin(latCenter)*Math.sin(lat),
  );

  return [lon, lat];
}


export class TrackOnSphere {
  sphereRadius: number;
  center: [number, number];
  angle: number;

  private trackLength: number;
  private straightLength: number;
  private curveLinearRadius: number;

  private curveNegativeCenter: [number, number];
  private curvePositiveCenter: [number, number];
  private curveNegativeCircle: CircleOnSphere;
  private curvePositiveCircle: CircleOnSphere;

  constructor(
    public desc: TrackOnSphereDesc,
  ) {
    this.calculate(desc);
  }

  calculate(desc: TrackOnSphereDesc) {
    this.sphereRadius = desc.sphereRadius;
    this.center = desc.centerDegrees.map(value => value * Math.PI/180) as [number, number];
    this.angle = desc.angle;

    this.trackLength = desc.trackLengthMeters/this.sphereRadius;
    this.straightLength = desc.straightLengthMeters/this.sphereRadius;
    this.curveLinearRadius = (this.trackLength/2 - this.straightLength)/Math.PI;

    const straightRadiusAngular = this.straightLength/2;
    this.curveNegativeCenter = circleCoordinate(this.angle, -straightRadiusAngular, this.center);
    this.curvePositiveCenter = circleCoordinate(this.angle, straightRadiusAngular, this.center);
    this.curveNegativeCircle = new CircleOnSphere({
      radiusLinearMeters: this.curveLinearRadius,
      center: this.curveNegativeCenter,
      sphereRadiusMeters: 1,
    });
    this.curvePositiveCircle = new CircleOnSphere({
      radiusLinearMeters: this.curveLinearRadius,
      center: this.curvePositiveCenter,
      sphereRadiusMeters: 1,
    });
  }

  /**
   * Get the coordinates of the track path
   * @param precision 
   * @returns list of [lon, lat] describing the track
   */
  trackPathCoordinates(precision: number = 8): [number, number][] {
    const steps = 2**precision / 2;
    const coordinates: [number, number][] = [];
    let angleDelta = -Math.PI/2
    for(let i = 0; i < steps; ++i) {
      coordinates.push(this.curvePositiveCircle.coordinateDegrees(this.angle + angleDelta));
      angleDelta += Math.PI/steps;
    }
    coordinates.push(this.curvePositiveCircle.coordinateDegrees(this.angle + angleDelta));
    for(let i = 0; i < steps; ++i) {
      coordinates.push(this.curveNegativeCircle.coordinateDegrees(this.angle + angleDelta));
      angleDelta += Math.PI/steps;
    }
    coordinates.push(this.curveNegativeCircle.coordinateDegrees(this.angle + angleDelta));

    coordinates.push([...coordinates[0]]);

    return coordinates;
  }
}

export interface CircleOnSphereDesc {
  /**
   *Represents a circle at center [lon, lat] with linear radius
   */ 
  radiusLinearMeters: number;
  center: [number, number],
  sphereRadiusMeters: number;
}
export class CircleOnSphere {
  radiusLinearMeters: number;
  center: [number, number];
  sphereRadiusMeters: number;

  /**
   * linear radius in radians
   */
  radiusLinear: number;

  /**
   * Calculated great circle distance of radius
   */
  radiusAngular: number;

  constructor(
    desc: CircleOnSphereDesc,
  ) {
    this.radiusLinearMeters = desc.radiusLinearMeters;
    this.center = desc.center;
    this.sphereRadiusMeters = desc.sphereRadiusMeters;

    this.radiusLinear = this.radiusLinearMeters/this.sphereRadiusMeters;
    this.radiusAngular = Math.asin(this.radiusLinear/2)*2;
  }

  /**
   * Return the coordinate as [lon, lat] of a point on the circle at an angle, degrees
   * @param angle 
   */
  coordinateDegrees(angle: number): [number, number] {
    return this.coordinate(angle).map(value => value * 180/Math.PI) as [number, number];
  }

  coordinate(angle: number): [number, number] {
    return circleCoordinate(angle, this.radiusAngular, this.center);
  }
}