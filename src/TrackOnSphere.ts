export interface TrackOnSphereDesc {
  /**
   * angular length of the straight, i.e. length of great circle segment
   */
  straightLengthMeters: number;

  /**
   * Earth radius
   */
  sphereRadius: number;

  orientation: {
    /**
     * Center of track
     */
    centerDegrees: [number, number];

    /**
     * Tilt angle of track, radians, at the location of the center
     */
    angle: number;
  }

  trackLengthMeters: number;

  /**
   * Meters, commonly 1.22 or 1.07 (high school)
   */
  laneWidth: number;

  /**
   * Lane number, 1-indexed
   */
  lane: number;
}

function radians<T extends number[]>(array: T): T {
  return array.map(value => value * Math.PI/180) as T;
}

function degrees<T extends number[]>(array: T): T {
  return array.map(value => value * 180/Math.PI) as T;
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

/**
 * Return the angle from north to the great circle segment from p1 to p2, at p1
 * @param p1 coordinate in radians
 * @param p2 coordinate in radians
 */
function angleGreatCircle(p1: [number, number], p2: [number, number]): number {
  const lonDelta = p2[0] - p1[0];
  return Math.atan2(
    Math.sin(lonDelta)*Math.cos(p2[1]),
    Math.cos(p1[1])*Math.sin(p2[1]) - Math.sin(p1[1])*Math.cos(p2[1])*Math.cos(lonDelta)
  );
}

function floorMod(dividend: number, divisor: number): number {
  return ((dividend%divisor)+divisor)%divisor;
}
/**
 * Return the angle from angle1 to angle2, normalized within [-Math.PI, Math.PI)
 * @param angle1 
 * @param angle2 
 */
function angleBetween(angle1: number, angle2: number): number {
  const twoPi = 2*Math.PI;
  const rawAngle = angle2-angle1;
  return floorMod(rawAngle + Math.PI, twoPi)- Math.PI;
}

/**
 * Convert [lon, lat] to cartesian [x,y,z], assuming a unit sphere
 * @param lonLat 
 */
function lonLatToCartesian(lonLat: [number, number]): [number, number, number] {
  return [
    Math.cos(lonLat[0])*Math.cos(lonLat[1]),
    Math.sin(lonLat[0])*Math.cos(lonLat[1]),
    Math.sin(lonLat[1]),
  ]
}

/**
 * Convert [x, y, z] to [lon, lat]
 * @param cartesian 
 */
function cartesianToLonLat(cartesian: [number, number, number]): [number, number] {
  return [
    Math.atan2(cartesian[1], cartesian[0]),
    Math.atan2(cartesian[2], (cartesian[0]**2 + cartesian[1]**2)**0.5),
  ]
}

function crossProduct(p1: [number, number, number], p2: [number, number, number]): [number, number, number] {
  return [
    p1[1]*p2[2] - p1[2]*p2[1],
    p1[2]*p2[0] - p1[0]*p2[2],
    p1[0]*p2[1] - p1[1]*p2[0],
  ];
}

function dotProduct(p1: [number, number, number], p2: [number, number, number]): number {
  return p1.reduce((prev, curr, i) => {
      return prev + p1[i]*p2[i];
    },
    0
  );
}

/**
 * Project a point onto a plane described by a normal.
 * @param point 
 * @param normal 
 */
function project(point: [number, number, number], normal: [number, number, number]): [number, number, number] {
  const normalLength = normal.reduce((prev, curr) => prev + curr**2, 0) ** 0.5;
  const unitNormal = normal.map(value => value/normalLength) as [number, number, number];
  const dot = dotProduct(point, unitNormal)
  return point.map((value, i) => point[i] - dot*unitNormal[i]) as [number, number, number];
}

/**
 * Great circle distance, radians
 * @param p1 [lon, lat], radians
 * @param p2 [lon, lat], radians
 * @returns 
 */
function greatCircleDistance(p1: [number, number], p2: [number, number]): number {
  // haversine formula 
  const deltaLon = p2[0] - p1[0] 
  const deltaLat = p2[1] - p1[1] 
  const a = Math.sin(deltaLat/2)**2 + Math.cos(p1[1]) * Math.cos(p2[1]) * Math.sin(deltaLon/2)**2
  return 2 * Math.asin(a ** 0.5);
}

export class TrackOnSphere {
  sphereRadius: number;
  center: [number, number];
  angle: number;

  private trackLength: number;
  private straightLength: number;
  private curveLinearRadius: number;

  /* Circle of the curve on the negative side of the axis coincident with the angle of the track  */
  private curveNegativeCircle: CircleOnSphere;
  /* Circle of the curve on the positive side of the axis coincident with the angle of the track */
  private curvePositiveCircle: CircleOnSphere;

  private curveNegativeAngleToCenter: number;
  private curvePositiveAngleToCenter: number;
  private curveLength: number;

  constructor(
    public desc: TrackOnSphereDesc,
  ) {
    this.calculate(desc);
  }

  calculate(desc: TrackOnSphereDesc) {
    this.sphereRadius = desc.sphereRadius;
    this.center = radians(desc.orientation.centerDegrees)
    this.angle = desc.orientation.angle;

    const laneTrackLength = desc.trackLengthMeters + desc.laneWidth * (desc.lane - 1) * Math.PI;

    this.trackLength = laneTrackLength/this.sphereRadius;
    this.straightLength = desc.straightLengthMeters/this.sphereRadius;
    this.curveLength = (this.trackLength/2 - this.straightLength);
    this.curveLinearRadius = this.curveLength/Math.PI;

    const straightRadiusAngular = this.straightLength/2;
    this.curveNegativeCircle = new CircleOnSphere({
      radiusLinearMeters: this.curveLinearRadius,
      center: circleCoordinate(this.angle, -straightRadiusAngular, this.center),
      sphereRadiusMeters: 1,
    });
    this.curvePositiveCircle = new CircleOnSphere({
      radiusLinearMeters: this.curveLinearRadius,
      center: circleCoordinate(this.angle, straightRadiusAngular, this.center),
      sphereRadiusMeters: 1,
    });

    this.curveNegativeAngleToCenter = angleGreatCircle(this.curveNegativeCircle.center, this.center);
    this.curvePositiveAngleToCenter = angleGreatCircle(this.curvePositiveCircle.center, this.center);
  }

  updateOrientation(orientation: TrackOnSphereDesc['orientation']) {
    this.desc.orientation = orientation;
    this.calculate(this.desc);
  }

  /**
   * Get the coordinates of the track path
   * @param precision 
   * @returns list of [lon, lat] describing the track
   */
  trackPathCoordinates(precision: number = 8): [number, number][] {
    const steps = 2**precision / 2;
    const coordinates: [number, number][] = [];
    let angleDelta = Math.PI/2
    for(let i = 0; i < steps; ++i) {
      coordinates.push(this.curvePositiveCircle.coordinateDegrees(this.angle + angleDelta));
      angleDelta -= Math.PI/steps;
    }
    coordinates.push(this.curvePositiveCircle.coordinateDegrees(this.angle + angleDelta));
    for(let i = 0; i < steps; ++i) {
      coordinates.push(this.curveNegativeCircle.coordinateDegrees(this.angle + angleDelta));
      angleDelta -= Math.PI/steps;
    }
    coordinates.push(this.curveNegativeCircle.coordinateDegrees(this.angle + angleDelta));

    coordinates.push([...coordinates[0]]);

    return coordinates;
  }

  /**
   * Return the best-fit of a coordinate on a track, radians
   * @param coordinateDegrees as [lon, lat]
   */
  fitToTrack(coordinateDegrees: [number, number]): {
    coordinate: [number, number],
    /* progress along track length */
    proportion: number,
  } {
    const coordinate: [number, number] = radians(coordinateDegrees);

    // try curves
    const angleCurvePositiveCircleToCoordinate = angleGreatCircle(this.curvePositiveCircle.center, coordinate);
    if(Math.abs(angleBetween(angleCurvePositiveCircleToCoordinate, this.curvePositiveAngleToCenter)) > Math.PI/2) {
      const projected = this.projectOntoCurve(coordinate, this.curvePositiveCircle, this.curvePositiveAngleToCenter);
      (this.trackLength/2 - this.straightLength)/this.trackLength
      return {
        coordinate: degrees(projected.coordinate),
        // first curve
        proportion: projected.proportion * this.curveLength/this.trackLength,
      };
    }
    const angleCurveNegativeCircleToCoordinate = angleGreatCircle(this.curveNegativeCircle.center, coordinate);
    if(Math.abs(angleBetween(angleCurveNegativeCircleToCoordinate, this.curveNegativeAngleToCenter)) > Math.PI/2) {
      const projected = this.projectOntoCurve(coordinate, this.curveNegativeCircle, this.curveNegativeAngleToCenter);
      return {
        coordinate: degrees(projected.coordinate),
        // second curve
        proportion: 0.5 + projected.proportion * this.curveLength/this.trackLength,
      };
    }

    // else straights
    const frontStraight: [number, number][] = [
      this.curvePositiveCircle.coordinate(this.angle - Math.PI/2),
      this.curveNegativeCircle.coordinate(this.angle - Math.PI/2),
    ];
    const backStraight: [number, number][] = [
      this.curveNegativeCircle.coordinate(this.angle + Math.PI/2),
      this.curvePositiveCircle.coordinate(this.angle + Math.PI/2),
    ];
    const projectFrontStraight = this.projectOntoStraight(coordinate, frontStraight[0], frontStraight[1]);
    const projectBackStraight = this.projectOntoStraight(coordinate, backStraight[0], backStraight[1]);
    if(greatCircleDistance(coordinate, projectFrontStraight.coordinate) < greatCircleDistance(coordinate, projectBackStraight.coordinate)) {
      return {
        coordinate: degrees(projectFrontStraight.coordinate),
        // first straight
        proportion: this.curveLength/this.trackLength + projectFrontStraight.proportion * this.straightLength/this.trackLength,
      }
    }
    else {
      return {
        coordinate: degrees(projectBackStraight.coordinate),
        // second straight
        proportion: 0.5 + this.curveLength/this.trackLength + projectBackStraight.proportion * this.straightLength/this.trackLength,
      }
    }
  }

  fitPathToTrack(coordinatesDegrees: [number, number][]): {
    coordinate: [number, number],
    /* cumulative progress */
    lapProgress: number,
  }[] {
    const projectedPath = coordinatesDegrees.map(coordinateDegrees => this.fitToTrack(coordinateDegrees));

    if(!projectedPath.length) {
      return [];
    }
    const result: ReturnType<typeof this.fitPathToTrack> = [];
    let cumProportion = 0;
    let previousProportion = projectedPath[0].proportion;
    for(const projectedPoint of projectedPath) {
      // smallest change of position in forward or backward direction
      console.log(projectedPoint.proportion)
      const change = Math.abs(floorMod(projectedPoint.proportion-previousProportion+0.5, 1)-0.5);
      cumProportion += change;
      result.push({
        coordinate: projectedPoint.coordinate,
        lapProgress: cumProportion,
      });
      previousProportion = projectedPoint.proportion;
    }
    return result;
  }

  private projectOntoStraight(coordinate: [number, number], start: [number, number], end: [number, number]): {
    coordinate: [number, number];
    /* proportion of the curve where the coordinate is */
    proportion: number;
  } {
    const coordinateCartesian = lonLatToCartesian(coordinate);
    const startCartesian = lonLatToCartesian(start);
    const endCartesian = lonLatToCartesian(end);

    const projection = project(coordinateCartesian, crossProduct(startCartesian, endCartesian));

    const projectedCoordinate = cartesianToLonLat(projection);
    return {
      coordinate: projectedCoordinate,
      proportion: greatCircleDistance(start, projectedCoordinate)/greatCircleDistance(start,end),
    };
  }

  private projectOntoCurve(coordinate: [number, number], circle: CircleOnSphere, curveAngleToCenter: number): {
    coordinate: [number, number];
    /* proportion of the curve where the coordinate is */
    proportion: number;
  } {
    const angle = angleGreatCircle(circle.center, coordinate);
    return {
      coordinate: circle.coordinate(angle),
      proportion: angleBetween(angle, curveAngleToCenter - Math.PI/2)/Math.PI,
    };
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
    return degrees(this.coordinate(angle));
  }

  coordinate(angle: number): [number, number] {
    return circleCoordinate(angle, this.radiusAngular, this.center);
  }
}